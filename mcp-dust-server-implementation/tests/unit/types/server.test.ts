// tests/unit/types/server.test.ts
import { MCPServer, MCPSession, MCPServerOptions } from '../../../src/types/server';
import { DustService } from '../../../src/services/dustService';
import { Request, Response } from 'express';
import { mock } from 'jest-mock-extended';
import { EventEmitter } from 'events';

describe('MCPServer', () => {
  let mcpServer: MCPServer;
  let mockDustService: DustService;
  let options: MCPServerOptions;

  beforeEach(() => {
    // Create a mock DustService
    mockDustService = mock<DustService>();
    
    // Create MCPServer options
    options = {
      name: 'Test MCP Server',
      dustService: mockDustService,
      timeout: 30000,
    };
    
    // Create a new MCPServer instance
    mcpServer = new MCPServer(options);
  });

  describe('constructor', () => {
    it('should create a new MCPServer instance with the provided options', () => {
      expect(mcpServer).toBeDefined();
    });
  });

  describe('on', () => {
    it('should register a session callback', () => {
      // Create a mock callback
      const callback = jest.fn();
      
      // Register the callback
      mcpServer.on('session', callback);
      
      // Create a mock request and response
      const req = mock<Request>();
      const res = mock<Response>();
      
      // Set up response methods
      res.write.mockImplementation(() => true);
      res.json.mockImplementation(() => res);
      
      // Create a mock event emitter for the request
      const reqEmitter = new EventEmitter();
      req.on = reqEmitter.on.bind(reqEmitter);
      
      // Handle a connection
      mcpServer.handleSSEConnection(req, res);
      
      // Verify the callback was called
      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toHaveProperty('id');
      expect(callback.mock.calls[0][0]).toHaveProperty('data');
    });
  });

  describe('handleSSEConnection', () => {
    it('should set up an SSE connection and return a session ID', () => {
      // Create a mock request and response
      const req = mock<Request>();
      const res = mock<Response>();
      
      // Set up response methods
      res.write.mockImplementation(() => true);
      
      // Create a mock event emitter for the request
      const reqEmitter = new EventEmitter();
      req.on = reqEmitter.on.bind(reqEmitter);
      
      // Handle the connection
      mcpServer.handleSSEConnection(req, res);
      
      // Verify the response
      expect(res.write).toHaveBeenCalled();
      
      // Extract the session ID from the response
      const responseData = res.write.mock.calls[0][0] as string;
      const match = responseData.match(/data: (.*)\n\n/);
      expect(match).toBeTruthy();
      
      if (match) {
        const data = JSON.parse(match[1]);
        expect(data).toHaveProperty('type', 'connected');
        expect(data).toHaveProperty('sessionId');
        
        // Verify the session was stored
        const session = mcpServer.getSession(data.sessionId);
        expect(session).toBeDefined();
        expect(session).toHaveProperty('id', data.sessionId);
      }
    });

    it('should remove the session when the client disconnects', () => {
      // Create a mock request and response
      const req = mock<Request>();
      const res = mock<Response>();
      
      // Set up response methods
      res.write.mockImplementation(() => true);
      
      // Create a mock event emitter for the request
      const reqEmitter = new EventEmitter();
      req.on = jest.fn((event, callback) => {
        if (event === 'close') {
          reqEmitter.on(event, callback);
        }
        return req;
      });
      
      // Handle the connection
      mcpServer.handleSSEConnection(req, res);
      
      // Extract the session ID from the response
      const responseData = res.write.mock.calls[0][0] as string;
      const match = responseData.match(/data: (.*)\n\n/);
      expect(match).toBeTruthy();
      
      if (match) {
        const data = JSON.parse(match[1]);
        const sessionId = data.sessionId;
        
        // Verify the session was stored
        expect(mcpServer.getSession(sessionId)).toBeDefined();
        
        // Simulate client disconnect
        reqEmitter.emit('close');
        
        // Verify the session was removed
        expect(mcpServer.getSession(sessionId)).toBeUndefined();
      }
    });
  });

  describe('handleStreamConnection', () => {
    it('should set up an HTTP stream connection and return a session ID', () => {
      // Create a mock request and response
      const req = mock<Request>();
      const res = mock<Response>();
      
      // Set up response methods
      res.json.mockImplementation(() => res);
      
      // Create a mock event emitter for the request
      const reqEmitter = new EventEmitter();
      req.on = reqEmitter.on.bind(reqEmitter);
      
      // Handle the connection
      mcpServer.handleStreamConnection(req, res);
      
      // Verify the response
      expect(res.json).toHaveBeenCalled();
      
      // Extract the session ID from the response
      const responseData = res.json.mock.calls[0][0];
      expect(responseData).toHaveProperty('type', 'connected');
      expect(responseData).toHaveProperty('sessionId');
      
      // Verify the session was stored
      const session = mcpServer.getSession(responseData.sessionId);
      expect(session).toBeDefined();
      expect(session).toHaveProperty('id', responseData.sessionId);
    });

    it('should remove the session when the client disconnects', () => {
      // Create a mock request and response
      const req = mock<Request>();
      const res = mock<Response>();
      
      // Set up response methods
      res.json.mockImplementation(() => res);
      
      // Create a mock event emitter for the request
      const reqEmitter = new EventEmitter();
      req.on = jest.fn((event, callback) => {
        if (event === 'close') {
          reqEmitter.on(event, callback);
        }
        return req;
      });
      
      // Handle the connection
      mcpServer.handleStreamConnection(req, res);
      
      // Extract the session ID from the response
      const responseData = res.json.mock.calls[0][0];
      const sessionId = responseData.sessionId;
      
      // Verify the session was stored
      expect(mcpServer.getSession(sessionId)).toBeDefined();
      
      // Simulate client disconnect
      reqEmitter.emit('close');
      
      // Verify the session was removed
      expect(mcpServer.getSession(sessionId)).toBeUndefined();
    });
  });

  describe('addResourceTemplate', () => {
    it('should add a resource template', () => {
      // Create a resource template
      const template = {
        uriTemplate: 'dust://test',
        name: 'Test Resource',
        description: 'A test resource',
        load: jest.fn(),
      };
      
      // Add the template
      mcpServer.addResourceTemplate(template);
      
      // Verify the template was stored
      const storedTemplate = (mcpServer as any).getResourceTemplate('dust://test');
      expect(storedTemplate).toBe(template);
    });
  });

  describe('addTool', () => {
    it('should add a tool template', () => {
      // Create a tool template
      const template = {
        name: 'test/tool',
        description: 'A test tool',
        execute: jest.fn(),
      };
      
      // Add the template
      mcpServer.addTool(template);
      
      // Verify the template was stored
      const storedTemplate = (mcpServer as any).getTool('test/tool');
      expect(storedTemplate).toBe(template);
    });
  });

  describe('sendProgressNotification', () => {
    it('should send a progress notification to a session', () => {
      // Create a mock session
      const sessionId = 'test-session';
      const sendProgressNotification = jest.fn();
      const session: MCPSession = {
        id: sessionId,
        data: {},
        sendProgressNotification,
      };
      
      // Add the session
      (mcpServer as any).sessions.set(sessionId, session);
      
      // Create a progress notification
      const notification = {
        type: 'progress',
        toolName: 'test/tool',
        progress: 0.5,
        message: 'Test progress',
      };
      
      // Send the notification
      mcpServer.sendProgressNotification(sessionId, notification);
      
      // Verify the notification was sent
      expect(sendProgressNotification).toHaveBeenCalledWith(notification);
    });

    it('should not throw an error if the session does not exist', () => {
      // Create a progress notification
      const notification = {
        type: 'progress',
        toolName: 'test/tool',
        progress: 0.5,
        message: 'Test progress',
      };
      
      // Send the notification to a non-existent session
      expect(() => {
        mcpServer.sendProgressNotification('non-existent', notification);
      }).not.toThrow();
    });

    it('should not throw an error if the session does not have a sendProgressNotification function', () => {
      // Create a mock session without sendProgressNotification
      const sessionId = 'test-session';
      const session: MCPSession = {
        id: sessionId,
        data: {},
      };
      
      // Add the session
      (mcpServer as any).sessions.set(sessionId, session);
      
      // Create a progress notification
      const notification = {
        type: 'progress',
        toolName: 'test/tool',
        progress: 0.5,
        message: 'Test progress',
      };
      
      // Send the notification
      expect(() => {
        mcpServer.sendProgressNotification(sessionId, notification);
      }).not.toThrow();
    });
  });

  describe('getSession', () => {
    it('should return a session by ID', () => {
      // Create a mock session
      const sessionId = 'test-session';
      const session: MCPSession = {
        id: sessionId,
        data: {},
      };
      
      // Add the session
      (mcpServer as any).sessions.set(sessionId, session);
      
      // Get the session
      const retrievedSession = mcpServer.getSession(sessionId);
      
      // Verify the session was retrieved
      expect(retrievedSession).toBe(session);
    });

    it('should return undefined for a non-existent session', () => {
      // Get a non-existent session
      const retrievedSession = mcpServer.getSession('non-existent');
      
      // Verify undefined was returned
      expect(retrievedSession).toBeUndefined();
    });
  });

  describe('getAllSessions', () => {
    it('should return all sessions', () => {
      // Create mock sessions
      const session1: MCPSession = {
        id: 'session-1',
        data: {},
      };
      
      const session2: MCPSession = {
        id: 'session-2',
        data: {},
      };
      
      // Add the sessions
      (mcpServer as any).sessions.set(session1.id, session1);
      (mcpServer as any).sessions.set(session2.id, session2);
      
      // Get all sessions
      const sessions = mcpServer.getAllSessions();
      
      // Verify the sessions were retrieved
      expect(sessions).toHaveLength(2);
      expect(sessions).toContain(session1);
      expect(sessions).toContain(session2);
    });

    it('should return an empty array if there are no sessions', () => {
      // Get all sessions
      const sessions = mcpServer.getAllSessions();
      
      // Verify an empty array was returned
      expect(sessions).toHaveLength(0);
    });
  });
});
