import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { isExecutableCodeBlock } from './commandUtils.js';

/**
 * Creates a custom renderer for marked that handles command code blocks
 * by adding a console prompt icon for executable commands
 */
export function createCustomRenderer(enableCommandPrompts: boolean = true): any {
  // Start with the base terminal renderer
  const renderer = new TerminalRenderer();
  
  // Store the original code block renderer
  const originalCodeRenderer = renderer.code;
  
  // Override the code block renderer to add our command prompt functionality
  renderer.code = function(code: any, infostring: string | undefined, escaped: boolean): string {
    // Convert to string safely
    const codeStr = typeof code === 'string' ? code : (code ? String(code) : '');
    
    // First, render the code block normally
    const renderedCode = originalCodeRenderer.call(this, code, infostring, escaped);
    
    // If command prompts are disabled, return as is
    if (!enableCommandPrompts) {
      return renderedCode;
    }
    
    // Make all shell/bash/sh languages executable by default
    if (infostring && ['bash', 'sh', 'shell', 'zsh', 'terminal', 'console'].includes(infostring.toLowerCase())) {
      // Make sure we create a unique marker that won't be confused with normal text
      const base64Code = Buffer.from(codeStr).toString('base64');
      const marker = `\n\n#CMD_MARKER@${infostring || ''}@${base64Code}#\n\n`;
      
      // Add the marker after the rendered code
      return `${renderedCode}${marker}`;
    }

    // Check for executable commands
    const isExecutable = isExecutableCodeBlock(infostring, codeStr);
    
    if (isExecutable) {
      // Add our custom command prompt marker that the React component can detect
      const base64Code = Buffer.from(codeStr).toString('base64');
      const marker = `\n\n#CMD_MARKER@${infostring || ''}@${base64Code}#\n\n`;
      
      // Add the marker after the rendered code
      return `${renderedCode}${marker}`;
    }
    
    // Check for any common command indicators in the content
    if (codeStr.match(/(ls|mkdir|cd|cp|mv|rm|git|npm|docker|kubectl|cat|echo)/)) {
      // Make sure we create a unique marker that won't be confused with normal text
      const base64Code = Buffer.from(codeStr).toString('base64');
      const marker = `\n\n#CMD_MARKER@${infostring || ''}@${base64Code}#\n\n`;
      
      // Add the marker after the rendered code
      return `${renderedCode}${marker}`;
    }
    
    // Not a command block, return normal rendering
    return renderedCode;
  };
  
  return renderer;
}

/**
 * Configures marked with our custom renderer
 */
export function configureMarked(enableCommandPrompts: boolean = true): void {
  const renderer = createCustomRenderer(enableCommandPrompts);
  
  marked.setOptions({
    renderer: renderer,
    // Keep any other marked options unchanged
    gfm: true,
    breaks: true
  });
}