// tests/unit/services/toolProvider.test.ts
import { ToolProvider } from '../../../src/services/toolProvider';
import { DustService } from '../../../src/services/dustService';
import { PermissionProxy } from '../../../src/services/permissionProxy';
import { mock } from 'jest-mock-extended';
import { z } from 'zod';

describe('ToolProvider', () => {
  let toolProvider: ToolProvider;
  let mockDustService: DustService;
  let mockPermissionProxy: PermissionProxy;

  beforeEach(() => {
    // Create mock services
    mockDustService = mock<DustService>();
    mockPermissionProxy = mock<PermissionProxy>();
    
    // Mock the PermissionProxy methods
    mockPermissionProxy.checkPermission.mockResolvedValue(true);
    mockPermissionProxy.checkWorkspacePermission.mockResolvedValue(true);
    mockPermissionProxy.checkAgentPermission.mockResolvedValue(true);
    mockPermissionProxy.checkKnowledgeBasePermission.mockResolvedValue(true);
    mockPermissionProxy.checkConnectorPermission.mockResolvedValue(true);
    
    // Create a new ToolProvider instance
    toolProvider = new ToolProvider(mockDustService, mockPermissionProxy);
  });

  describe('constructor', () => {
    it('should create a new ToolProvider instance with the provided services', () => {
      expect(toolProvider).toBeDefined();
    });
  });

  describe('registerTool', () => {
    it('should register a tool', () => {
      // Create a tool
      const tool = {
        name: 'test/tool',
        description: 'A test tool',
        parameters: z.object({
          param1: z.string(),
          param2: z.number().optional(),
        }),
        execute: jest.fn(),
      };
      
      // Register the tool
      toolProvider.registerTool(tool);
      
      // Verify the tool was registered
      expect((toolProvider as any).tools.get('test/tool')).toBe(tool);
    });

    it('should throw an error if a tool with the same name is already registered', () => {
      // Create a tool
      const tool = {
        name: 'test/tool',
        description: 'A test tool',
        parameters: z.object({
          param1: z.string(),
          param2: z.number().optional(),
        }),
        execute: jest.fn(),
      };
      
      // Register the tool
      toolProvider.registerTool(tool);
      
      // Try to register another tool with the same name
      expect(() => {
        toolProvider.registerTool(tool);
      }).toThrow();
    });
  });

  describe('getTool', () => {
    it('should return a registered tool', () => {
      // Create a tool
      const tool = {
        name: 'test/tool',
        description: 'A test tool',
        parameters: z.object({
          param1: z.string(),
          param2: z.number().optional(),
        }),
        execute: jest.fn(),
      };
      
      // Register the tool
      toolProvider.registerTool(tool);
      
      // Get the tool
      const result = toolProvider.getTool('test/tool');
      
      // Verify the result
      expect(result).toBe(tool);
    });

    it('should return undefined for a non-existent tool', () => {
      // Get a non-existent tool
      const result = toolProvider.getTool('non-existent');
      
      // Verify the result
      expect(result).toBeUndefined();
    });
  });

  describe('getAllTools', () => {
    it('should return all registered tools', () => {
      // Create tools
      const tool1 = {
        name: 'test/tool1',
        description: 'A test tool 1',
        parameters: z.object({
          param1: z.string(),
        }),
        execute: jest.fn(),
      };
      
      const tool2 = {
        name: 'test/tool2',
        description: 'A test tool 2',
        parameters: z.object({
          param2: z.number(),
        }),
        execute: jest.fn(),
      };
      
      // Register the tools
      toolProvider.registerTool(tool1);
      toolProvider.registerTool(tool2);
      
      // Get all tools
      const tools = toolProvider.getAllTools();
      
      // Verify the result
      expect(tools).toHaveLength(2);
      expect(tools).toContain(tool1);
      expect(tools).toContain(tool2);
    });

    it('should return an empty array if no tools are registered', () => {
      // Get all tools
      const tools = toolProvider.getAllTools();
      
      // Verify the result
      expect(tools).toHaveLength(0);
    });
  });

  describe('executeTool', () => {
    it('should execute a registered tool', async () => {
      // Create a mock execution result
      const executionResult = {
        content: [
          {
            type: 'text',
            text: 'Test result',
          },
        ],
      };
      
      // Create a tool
      const tool = {
        name: 'test/tool',
        description: 'A test tool',
        parameters: z.object({
          param1: z.string(),
          param2: z.number().optional(),
        }),
        execute: jest.fn().mockResolvedValue(executionResult),
      };
      
      // Register the tool
      toolProvider.registerTool(tool);
      
      // Execute the tool
      const result = await toolProvider.executeTool('test/tool', {
        param1: 'test',
        param2: 42,
      }, 'test-user-id', 'test-session-id');
      
      // Verify the result
      expect(result).toBe(executionResult);
      expect(tool.execute).toHaveBeenCalledWith({
        param1: 'test',
        param2: 42,
      }, {
        userId: 'test-user-id',
        sessionId: 'test-session-id',
      });
    });

    it('should throw an error for a non-existent tool', async () => {
      // Execute a non-existent tool
      await expect(toolProvider.executeTool('non-existent', {}, 'test-user-id', 'test-session-id')).rejects.toThrow();
    });

    it('should throw an error if the parameters are invalid', async () => {
      // Create a tool
      const tool = {
        name: 'test/tool',
        description: 'A test tool',
        parameters: z.object({
          param1: z.string(),
          param2: z.number().optional(),
        }),
        execute: jest.fn(),
      };
      
      // Register the tool
      toolProvider.registerTool(tool);
      
      // Execute the tool with invalid parameters
      await expect(toolProvider.executeTool('test/tool', {
        param1: 123, // Should be a string
      }, 'test-user-id', 'test-session-id')).rejects.toThrow();
    });

    it('should throw an error if the user does not have permission', async () => {
      // Mock the PermissionProxy.checkPermission method
      mockPermissionProxy.checkPermission.mockResolvedValue(false);
      
      // Create a tool
      const tool = {
        name: 'test/tool',
        description: 'A test tool',
        parameters: z.object({
          param1: z.string(),
          param2: z.number().optional(),
        }),
        execute: jest.fn(),
      };
      
      // Register the tool
      toolProvider.registerTool(tool);
      
      // Execute the tool
      await expect(toolProvider.executeTool('test/tool', {
        param1: 'test',
        param2: 42,
      }, 'test-user-id', 'test-session-id')).rejects.toThrow();
    });
  });

  describe('describeTool', () => {
    it('should describe a registered tool', () => {
      // Create a tool
      const tool = {
        name: 'test/tool',
        description: 'A test tool',
        parameters: z.object({
          param1: z.string(),
          param2: z.number().optional(),
        }),
        execute: jest.fn(),
      };
      
      // Register the tool
      toolProvider.registerTool(tool);
      
      // Describe the tool
      const description = toolProvider.describeTool('test/tool');
      
      // Verify the description
      expect(description).toBeDefined();
      expect(description).toHaveProperty('name', 'test/tool');
      expect(description).toHaveProperty('description', 'A test tool');
      expect(description).toHaveProperty('parameters');
    });

    it('should throw an error for a non-existent tool', () => {
      // Describe a non-existent tool
      expect(() => {
        toolProvider.describeTool('non-existent');
      }).toThrow();
    });
  });
});
