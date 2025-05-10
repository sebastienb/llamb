import Conf from 'conf';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Define the message interface to match OpenAI's format
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Session {
  id: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export class SessionManager {
  private static instances: Map<string, SessionManager> = new Map();
  private currentSession: Session;
  private conf: Conf<any>;
  private sessionsPath: string;
  private terminalId: string;

  private constructor(terminalId?: string) {
    // Generate or use the provided terminal ID
    this.terminalId = terminalId || SessionManager.generateTerminalId();

    // Initialize Conf for storing metadata
    this.conf = new Conf({
      projectName: 'llamb',
      configName: 'sessions'
    });

    // Set up sessions directory
    this.sessionsPath = path.join(os.homedir(), '.llamb', 'sessions');
    if (!existsSync(this.sessionsPath)) {
      mkdirSync(this.sessionsPath, { recursive: true });
    }

    // Initialize or load current session for this terminal
    const sessionKey = `terminal_${this.terminalId}`;
    const sessionId = this.conf.get(sessionKey) as string;
    if (sessionId && this.sessionExists(sessionId)) {
      this.currentSession = this.loadSession(sessionId);
    } else {
      this.currentSession = this.createNewSession();
      this.saveSession();
    }
  }

  /**
   * Generate a unique terminal ID based on environment variables
   * This helps identify different terminal sessions
   */
  private static generateTerminalId(): string {
    // First check if this is an SSH session
    if (process.env.SSH_CONNECTION) {
      // For SSH sessions, use SSH_CONNECTION which contains source IP, source port,
      // destination IP, and destination port - creating a unique identifier
      const sshId = `ssh-${process.env.SSH_CONNECTION}`;
      return crypto.createHash('md5').update(sshId).digest('hex').substring(0, 8);
    }

    // For local sessions, use environment variables that might help identify the terminal session
    // Important: Remove process.pid and Date.now() which change between sessions in the same terminal
    // Only use stable identifiers that persist across terminal sessions

    // Get the TTY path which is stable for the same terminal window
    const tty = process.env.TTY || '';

    // Include terminal-specific IDs when available
    const terminalIds = [
      process.env.TERM_SESSION_ID, // macOS Terminal.app session ID
      process.env.WINDOWID,        // X11 window ID
      process.env.TERMINATOR_UUID, // Terminator terminal ID
      process.env.ITERM_SESSION_ID // iTerm2 session ID
    ].filter(Boolean);

    // Different strategies based on available environment variables
    if (terminalIds.length > 0) {
      // If we have a terminal-specific ID, use it with TTY
      const envVars = [...terminalIds, tty, process.env.SHELL].filter(Boolean).join('-');
      return crypto.createHash('md5').update(envVars).digest('hex').substring(0, 8);
    } else if (tty) {
      // If we have TTY but no terminal ID, hash the TTY with user info
      // This ensures we get a consistent ID for the same terminal
      const username = process.env.USER || process.env.USERNAME || '';
      const userTty = `${username}-${tty}-${process.env.SHELL || ''}`;
      return crypto.createHash('md5').update(userTty).digest('hex').substring(0, 8);
    } else {
      // Last resort - create a pseudo-random ID but store it in the user's home directory
      // This at least ensures consistency within a single terminal session
      const homedir = os.homedir();
      const localIdPath = path.join(homedir, '.llamb', 'local_terminal_id');

      try {
        // Try to read existing ID first
        if (existsSync(localIdPath)) {
          return readFileSync(localIdPath, 'utf8').trim();
        }

        // Generate new ID if none exists
        const randomId = crypto.randomBytes(4).toString('hex');

        // Ensure directory exists
        const dir = path.dirname(localIdPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        // Save for future use
        writeFileSync(localIdPath, randomId);
        return randomId;
      } catch (error) {
        // If file operations fail, fall back to a simple hash of username + shell
        const fallback = `${process.env.USER || ''}-${process.env.SHELL || ''}-local`;
        return crypto.createHash('md5').update(fallback).digest('hex').substring(0, 8);
      }
    }
  }

  /**
   * Get the SessionManager instance for the current terminal
   */
  public static getInstance(terminalId?: string): SessionManager {
    const id = terminalId || SessionManager.generateTerminalId();

    if (!SessionManager.instances.has(id)) {
      SessionManager.instances.set(id, new SessionManager(id));
    }

    return SessionManager.instances.get(id)!;
  }

  /**
   * Add a user message to the conversation
   */
  public addUserMessage(content: string): void {
    this.currentSession.messages.push({
      role: 'user',
      content
    });
    this.currentSession.updatedAt = new Date().toISOString();
    this.saveSession();
  }

  /**
   * Add an assistant message to the conversation
   */
  public addAssistantMessage(content: string): void {
    this.currentSession.messages.push({
      role: 'assistant',
      content
    });
    this.currentSession.updatedAt = new Date().toISOString();
    this.saveSession();
  }

  /**
   * Get all messages for the current session
   */
  public getMessages(): Message[] {
    return [...this.currentSession.messages];
  }

  /**
   * Clear the current session
   */
  public clearSession(): void {
    this.currentSession.messages = [];
    this.currentSession.updatedAt = new Date().toISOString();
    this.saveSession();
  }

  /**
   * Create a new session and make it the current one
   */
  public createNewSession(): Session {
    const now = new Date().toISOString();
    this.currentSession = {
      id: `session_${this.terminalId}_${Date.now()}`,
      messages: [],
      createdAt: now,
      updatedAt: now
    };

    // Save session ID with terminal-specific key
    const sessionKey = `terminal_${this.terminalId}`;
    this.conf.set(sessionKey, this.currentSession.id);

    this.saveSession();
    return this.currentSession;
  }

  /**
   * Get the terminal ID for this session manager
   */
  public getTerminalId(): string {
    return this.terminalId;
  }

  /**
   * Get the current session
   */
  public getCurrentSession(): Session {
    return { ...this.currentSession };
  }

  /**
   * Get session file path
   */
  private getSessionFilePath(sessionId: string): string {
    return path.join(this.sessionsPath, `${sessionId}.json`);
  }

  /**
   * Check if a session exists
   */
  private sessionExists(sessionId: string): boolean {
    return existsSync(this.getSessionFilePath(sessionId));
  }

  /**
   * Save the current session to disk
   */
  private saveSession(): void {
    try {
      const filePath = this.getSessionFilePath(this.currentSession.id);
      writeFileSync(filePath, JSON.stringify(this.currentSession, null, 2), 'utf8');

      // Update terminal-specific metadata
      const sessionKey = `terminal_${this.terminalId}`;
      this.conf.set(sessionKey, this.currentSession.id);
      this.conf.set(`${sessionKey}_lastUpdate`, this.currentSession.updatedAt);
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  /**
   * Load a session from disk
   */
  private loadSession(sessionId: string): Session {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      const data = readFileSync(filePath, 'utf8');
      return JSON.parse(data) as Session;
    } catch (error) {
      console.error('Failed to load session:', error);
      return this.createNewSession();
    }
  }
}