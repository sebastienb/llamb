import Conf from 'conf';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';

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
  private static instance: SessionManager;
  private currentSession: Session;
  private conf: Conf<any>;
  private sessionsPath: string;

  private constructor() {
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

    // Initialize or load current session
    const sessionId = this.conf.get('currentSessionId') as string;
    if (sessionId && this.sessionExists(sessionId)) {
      this.currentSession = this.loadSession(sessionId);
    } else {
      this.currentSession = this.createNewSession();
      this.saveSession();
    }
  }

  /**
   * Get the SessionManager instance (Singleton pattern)
   */
  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
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
      id: `session_${Date.now()}`,
      messages: [],
      createdAt: now,
      updatedAt: now
    };
    this.conf.set('currentSessionId', this.currentSession.id);
    this.saveSession();
    return this.currentSession;
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
      // Update metadata
      this.conf.set('currentSessionId', this.currentSession.id);
      this.conf.set('lastUpdateTime', this.currentSession.updatedAt);
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