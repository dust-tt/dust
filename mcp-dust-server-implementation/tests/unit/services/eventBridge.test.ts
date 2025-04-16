// tests/unit/services/eventBridge.test.ts
import { EventBridge } from '../../../src/services/eventBridge';
import { DustService } from '../../../src/services/dustService';
import { MCPServer } from '../../../src/types/server';
import { mock } from 'jest-mock-extended';
import { EventEmitter } from 'events';

describe('EventBridge', () => {
  let eventBridge: EventBridge;
  let mockDustService: DustService;
  let mockMCPServer: MCPServer;
  let mockEventEmitter: EventEmitter;

  beforeEach(() => {
    // Create mock services
    mockDustService = mock<DustService>();
    mockMCPServer = mock<MCPServer>();
    mockEventEmitter = new EventEmitter();
    
    // Mock the DustService.getEventEmitter method
    (mockDustService as any).getEventEmitter = jest.fn().mockReturnValue(mockEventEmitter);
    
    // Create a new EventBridge instance
    eventBridge = new EventBridge(mockDustService, mockMCPServer);
  });

  describe('constructor', () => {
    it('should create a new EventBridge instance with the provided services', () => {
      expect(eventBridge).toBeDefined();
    });

    it('should subscribe to Dust events', () => {
      // Verify the DustService.getEventEmitter method was called
      expect((mockDustService as any).getEventEmitter).toHaveBeenCalled();
      
      // Verify event listeners were added
      expect(mockEventEmitter.listenerCount('agent.run.progress')).toBeGreaterThan(0);
      expect(mockEventEmitter.listenerCount('agent.run.completed')).toBeGreaterThan(0);
      expect(mockEventEmitter.listenerCount('agent.run.failed')).toBeGreaterThan(0);
      expect(mockEventEmitter.listenerCount('knowledge.search.progress')).toBeGreaterThan(0);
      expect(mockEventEmitter.listenerCount('knowledge.search.completed')).toBeGreaterThan(0);
      expect(mockEventEmitter.listenerCount('knowledge.search.failed')).toBeGreaterThan(0);
      expect(mockEventEmitter.listenerCount('connector.sync.progress')).toBeGreaterThan(0);
      expect(mockEventEmitter.listenerCount('connector.sync.completed')).toBeGreaterThan(0);
      expect(mockEventEmitter.listenerCount('connector.sync.failed')).toBeGreaterThan(0);
    });
  });

  describe('event handling', () => {
    it('should handle agent.run.progress events', () => {
      // Create a mock session ID
      const sessionId = 'test-session-id';
      
      // Create a mock event
      const event = {
        sessionId,
        agentId: 'test-agent-id',
        runId: 'test-run-id',
        progress: 0.5,
        message: 'Test progress',
      };
      
      // Emit the event
      mockEventEmitter.emit('agent.run.progress', event);
      
      // Verify the MCPServer.sendProgressNotification method was called
      expect(mockMCPServer.sendProgressNotification).toHaveBeenCalledWith(sessionId, {
        type: 'progress',
        toolName: 'dust/agent/execute',
        progress: 0.5,
        message: 'Test progress',
        data: {
          agentId: 'test-agent-id',
          runId: 'test-run-id',
        },
      });
    });

    it('should handle agent.run.completed events', () => {
      // Create a mock session ID
      const sessionId = 'test-session-id';
      
      // Create a mock event
      const event = {
        sessionId,
        agentId: 'test-agent-id',
        runId: 'test-run-id',
        result: {
          output: 'Test output',
        },
      };
      
      // Emit the event
      mockEventEmitter.emit('agent.run.completed', event);
      
      // Verify the MCPServer.sendProgressNotification method was called
      expect(mockMCPServer.sendProgressNotification).toHaveBeenCalledWith(sessionId, {
        type: 'completed',
        toolName: 'dust/agent/execute',
        progress: 1.0,
        message: 'Agent run completed',
        data: {
          agentId: 'test-agent-id',
          runId: 'test-run-id',
          result: {
            output: 'Test output',
          },
        },
      });
    });

    it('should handle agent.run.failed events', () => {
      // Create a mock session ID
      const sessionId = 'test-session-id';
      
      // Create a mock event
      const event = {
        sessionId,
        agentId: 'test-agent-id',
        runId: 'test-run-id',
        error: 'Test error',
      };
      
      // Emit the event
      mockEventEmitter.emit('agent.run.failed', event);
      
      // Verify the MCPServer.sendProgressNotification method was called
      expect(mockMCPServer.sendProgressNotification).toHaveBeenCalledWith(sessionId, {
        type: 'failed',
        toolName: 'dust/agent/execute',
        progress: 1.0,
        message: 'Agent run failed: Test error',
        data: {
          agentId: 'test-agent-id',
          runId: 'test-run-id',
          error: 'Test error',
        },
      });
    });

    it('should handle knowledge.search.progress events', () => {
      // Create a mock session ID
      const sessionId = 'test-session-id';
      
      // Create a mock event
      const event = {
        sessionId,
        knowledgeBaseId: 'test-kb-id',
        searchId: 'test-search-id',
        progress: 0.5,
        message: 'Test progress',
      };
      
      // Emit the event
      mockEventEmitter.emit('knowledge.search.progress', event);
      
      // Verify the MCPServer.sendProgressNotification method was called
      expect(mockMCPServer.sendProgressNotification).toHaveBeenCalledWith(sessionId, {
        type: 'progress',
        toolName: 'dust/knowledge/search',
        progress: 0.5,
        message: 'Test progress',
        data: {
          knowledgeBaseId: 'test-kb-id',
          searchId: 'test-search-id',
        },
      });
    });

    it('should handle connector.sync.progress events', () => {
      // Create a mock session ID
      const sessionId = 'test-session-id';
      
      // Create a mock event
      const event = {
        sessionId,
        connectorId: 'test-connector-id',
        syncId: 'test-sync-id',
        progress: 0.5,
        message: 'Test progress',
      };
      
      // Emit the event
      mockEventEmitter.emit('connector.sync.progress', event);
      
      // Verify the MCPServer.sendProgressNotification method was called
      expect(mockMCPServer.sendProgressNotification).toHaveBeenCalledWith(sessionId, {
        type: 'progress',
        toolName: 'dust/connector/sync',
        progress: 0.5,
        message: 'Test progress',
        data: {
          connectorId: 'test-connector-id',
          syncId: 'test-sync-id',
        },
      });
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from all events', () => {
      // Unsubscribe from events
      eventBridge.unsubscribe();
      
      // Verify event listeners were removed
      expect(mockEventEmitter.listenerCount('agent.run.progress')).toBe(0);
      expect(mockEventEmitter.listenerCount('agent.run.completed')).toBe(0);
      expect(mockEventEmitter.listenerCount('agent.run.failed')).toBe(0);
      expect(mockEventEmitter.listenerCount('knowledge.search.progress')).toBe(0);
      expect(mockEventEmitter.listenerCount('knowledge.search.completed')).toBe(0);
      expect(mockEventEmitter.listenerCount('knowledge.search.failed')).toBe(0);
      expect(mockEventEmitter.listenerCount('connector.sync.progress')).toBe(0);
      expect(mockEventEmitter.listenerCount('connector.sync.completed')).toBe(0);
      expect(mockEventEmitter.listenerCount('connector.sync.failed')).toBe(0);
    });
  });
});
