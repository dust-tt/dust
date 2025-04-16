import { Request, Response } from 'express';
import { DustService } from '../services/dustService';
import { EventBridge, ProgressNotification } from '../services/eventBridge';

// Define MCPServer interface
export interface MCPServerOptions {
  name: string;
  dustService: DustService;
  timeout: number;
}

export interface MCPSession {
  id: string;
  data: Record<string, any>;
  user?: {
    apiKey: string;
    userId?: string;
    username?: string;
    email?: string;
    workspaceId?: string;
    permissions?: string[];
  };
  eventBridge?: EventBridge;
  sendProgressNotification?: (notification: ProgressNotification) => void;
}

export interface MCPServer {
  on(event: 'session', callback: (session: MCPSession) => void): void;
  handleSSEConnection(req: Request, res: Response): void;
  handleStreamConnection(req: Request, res: Response): void;
  addResourceTemplate(template: any): void;
  addTool(template: any): void;
  sendProgressNotification(sessionId: string, notification: ProgressNotification): void;
  getSession(sessionId: string): MCPSession | undefined;
  getAllSessions(): MCPSession[];
}

// This is a placeholder for the actual MCPServer implementation
// We'll implement this in a later task
export class MCPServer implements MCPServer {
  private name: string;
  private dustService: DustService;
  private timeout: number;
  private sessions: Map<string, MCPSession>;
  private sessionCallbacks: ((session: MCPSession) => void)[];
  private resourceTemplates: Map<string, any>;
  private toolTemplates: Map<string, any>;

  constructor(options: MCPServerOptions) {
    this.name = options.name;
    this.dustService = options.dustService;
    this.timeout = options.timeout;
    this.sessions = new Map();
    this.sessionCallbacks = [];
    this.resourceTemplates = new Map();
    this.toolTemplates = new Map();
  }

  on(event: 'session', callback: (session: MCPSession) => void): void {
    if (event === 'session') {
      this.sessionCallbacks.push(callback);
    }
  }

  handleSSEConnection(req: Request, res: Response): void {
    // This is a placeholder for the actual implementation
    // We'll implement this in a later task
    const sessionId = Math.random().toString(36).substring(2, 15);
    const session: MCPSession = {
      id: sessionId,
      data: {},
    };

    this.sessions.set(sessionId, session);

    // Notify session callbacks
    this.sessionCallbacks.forEach(callback => callback(session));

    // Set up SSE connection
    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
      this.sessions.delete(sessionId);
    });
  }

  handleStreamConnection(req: Request, res: Response): void {
    // This is a placeholder for the actual implementation
    // We'll implement this in a later task
    const sessionId = Math.random().toString(36).substring(2, 15);
    const session: MCPSession = {
      id: sessionId,
      data: {},
    };

    this.sessions.set(sessionId, session);

    // Notify session callbacks
    this.sessionCallbacks.forEach(callback => callback(session));

    // Set up HTTP Stream connection
    res.json({ type: 'connected', sessionId });

    // Handle client disconnect
    req.on('close', () => {
      this.sessions.delete(sessionId);
    });
  }

  addResourceTemplate(template: any): void {
    // Store the resource template
    this.resourceTemplates.set(template.uriTemplate, template);
  }

  addTool(template: any): void {
    // Store the tool template
    this.toolTemplates.set(template.name, template);
  }

  getResourceTemplate(uriTemplate: string): any {
    return this.resourceTemplates.get(uriTemplate);
  }

  getTool(name: string): any {
    return this.toolTemplates.get(name);
  }

  getAllResourceTemplates(): any[] {
    return Array.from(this.resourceTemplates.values());
  }

  getAllTools(): any[] {
    return Array.from(this.toolTemplates.values());
  }

  sendProgressNotification(sessionId: string, notification: ProgressNotification): void {
    // Get session
    const session = this.getSession(sessionId);

    if (!session) {
      return;
    }

    // Send notification
    if (session.sendProgressNotification) {
      session.sendProgressNotification(notification);
    }
  }

  getSession(sessionId: string): MCPSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): MCPSession[] {
    return Array.from(this.sessions.values());
  }
}
