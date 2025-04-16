// src/services/agentService.ts
import { logger } from '../utils/logger';
import { DustService, DustAgent, DustAgentExecution } from './dustService';
import { PermissionProxy, Permission, ResourceType } from './permissionProxy';
import { EventBridge, EventType } from './eventBridge';
import { APIError } from '../middleware/error-middleware';

/**
 * Agent configuration
 */
export interface AgentConfig {
  id: string;
  agentId: string;
  workspaceId: string;
  name: string;
  description?: string;
  parameters?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Agent run status
 */
export enum AgentRunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

/**
 * Agent run
 */
export interface AgentRun {
  id: string;
  agentId: string;
  workspaceId: string;
  configId?: string;
  status: AgentRunStatus;
  input: string;
  output?: string;
  error?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/**
 * Agent service options
 */
export interface AgentServiceOptions {
  dustService: DustService;
  permissionProxy: PermissionProxy;
  eventBridge?: EventBridge;
}

/**
 * Agent service for managing agents
 */
export class AgentService {
  private dustService: DustService;
  private permissionProxy: PermissionProxy;
  private eventBridge?: EventBridge;
  private agentConfigs: Map<string, AgentConfig>;
  private agentRuns: Map<string, AgentRun>;
  
  /**
   * Create a new AgentService
   * @param options Agent service options
   */
  constructor(options: AgentServiceOptions) {
    this.dustService = options.dustService;
    this.permissionProxy = options.permissionProxy;
    this.eventBridge = options.eventBridge;
    this.agentConfigs = new Map();
    this.agentRuns = new Map();
    
    logger.info('AgentService initialized');
  }
  
  /**
   * List agents in a workspace
   * @param workspaceId Workspace ID
   * @param apiKey API key
   * @returns List of agents
   */
  public async listAgents(workspaceId: string, apiKey: string): Promise<DustAgent[]> {
    try {
      // Check if user has permission to access this workspace
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_WORKSPACE,
        ResourceType.WORKSPACE,
        workspaceId
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this workspace: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get agents from Dust API
      return this.dustService.listAgents(workspaceId);
    } catch (error) {
      logger.error(`Error listing agents for workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get agent by ID
   * @param workspaceId Workspace ID
   * @param agentId Agent ID
   * @param apiKey API key
   * @returns Agent details
   */
  public async getAgent(workspaceId: string, agentId: string, apiKey: string): Promise<DustAgent> {
    try {
      // Check if user has permission to access this agent
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_AGENT,
        ResourceType.AGENT,
        `${workspaceId}/${agentId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this agent: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get agent from Dust API
      return this.dustService.getAgent(workspaceId, agentId);
    } catch (error) {
      logger.error(`Error getting agent ${agentId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Execute an agent
   * @param workspaceId Workspace ID
   * @param agentId Agent ID
   * @param input Input for the agent
   * @param configId Configuration ID (optional)
   * @param apiKey API key
   * @returns Agent run
   */
  public async executeAgent(
    workspaceId: string,
    agentId: string,
    input: string,
    configId: string | undefined,
    apiKey: string
  ): Promise<AgentRun> {
    try {
      // Check if user has permission to execute this agent
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.EXECUTE_AGENT,
        ResourceType.AGENT,
        `${workspaceId}/${agentId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to execute this agent: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get agent configuration if provided
      let config: AgentConfig | undefined;
      if (configId) {
        config = this.agentConfigs.get(configId);
        
        if (!config) {
          throw new APIError(`Agent configuration not found: ${configId}`, 404, 'NOT_FOUND');
        }
        
        if (config.agentId !== agentId || config.workspaceId !== workspaceId) {
          throw new APIError(
            `Agent configuration does not match agent or workspace`,
            400,
            'BAD_REQUEST'
          );
        }
      }
      
      // Create agent run
      const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const run: AgentRun = {
        id: runId,
        agentId,
        workspaceId,
        configId,
        status: AgentRunStatus.PENDING,
        input,
        metadata: {
          config: config?.parameters,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      // Store agent run
      this.agentRuns.set(runId, run);
      
      // Emit agent execution started event
      if (this.eventBridge) {
        this.eventBridge.emit(EventType.AGENT_EXECUTION_STARTED, {
          workspaceId,
          agentId,
          runId,
          input,
          config: config?.parameters,
        });
      }
      
      // Update run status
      run.status = AgentRunStatus.RUNNING;
      run.updatedAt = new Date().toISOString();
      
      // Execute agent asynchronously
      this.executeAgentAsync(workspaceId, agentId, input, runId, apiKey);
      
      return run;
    } catch (error) {
      logger.error(`Error executing agent ${agentId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Execute an agent asynchronously
   * @param workspaceId Workspace ID
   * @param agentId Agent ID
   * @param input Input for the agent
   * @param runId Run ID
   * @param apiKey API key
   */
  private async executeAgentAsync(
    workspaceId: string,
    agentId: string,
    input: string,
    runId: string,
    apiKey: string
  ): Promise<void> {
    try {
      // Get agent run
      const run = this.agentRuns.get(runId);
      
      if (!run) {
        logger.error(`Agent run not found: ${runId}`);
        return;
      }
      
      // Execute agent using Dust API
      const execution = await this.dustService.executeAgent(workspaceId, agentId, input);
      
      // Start polling for execution status
      if (this.eventBridge) {
        this.eventBridge.startAgentExecutionPolling(workspaceId, agentId, execution.id);
      }
      
      // Wait for execution to complete
      const result = await this.waitForExecution(workspaceId, agentId, execution.id);
      
      // Update run with result
      run.status = result.status === 'succeeded' ? AgentRunStatus.SUCCEEDED : AgentRunStatus.FAILED;
      run.output = result.output;
      run.error = result.error;
      run.updatedAt = new Date().toISOString();
      run.completedAt = new Date().toISOString();
      
      // Emit agent execution completed event
      if (this.eventBridge) {
        if (run.status === AgentRunStatus.SUCCEEDED) {
          this.eventBridge.emit(EventType.AGENT_EXECUTION_COMPLETED, {
            workspaceId,
            agentId,
            runId,
            output: run.output,
          });
        } else {
          this.eventBridge.emit(EventType.AGENT_EXECUTION_FAILED, {
            workspaceId,
            agentId,
            runId,
            error: run.error,
          });
        }
      }
    } catch (error) {
      // Get agent run
      const run = this.agentRuns.get(runId);
      
      if (run) {
        // Update run with error
        run.status = AgentRunStatus.FAILED;
        run.error = error.message;
        run.updatedAt = new Date().toISOString();
        run.completedAt = new Date().toISOString();
        
        // Emit agent execution failed event
        if (this.eventBridge) {
          this.eventBridge.emit(EventType.AGENT_EXECUTION_FAILED, {
            workspaceId,
            agentId,
            runId,
            error: error.message,
          });
        }
      }
      
      logger.error(`Error executing agent ${agentId} in workspace ${workspaceId}: ${error.message}`);
    }
  }
  
  /**
   * Wait for agent execution to complete
   * @param workspaceId Workspace ID
   * @param agentId Agent ID
   * @param executionId Execution ID
   * @returns Agent execution
   */
  private async waitForExecution(
    workspaceId: string,
    agentId: string,
    executionId: string
  ): Promise<DustAgentExecution> {
    // Poll for execution status
    let execution: DustAgentExecution;
    let retries = 0;
    const maxRetries = 60; // 5 minutes with 5-second interval
    const interval = 5000; // 5 seconds
    
    while (retries < maxRetries) {
      // Get execution status
      execution = await this.dustService.getAgentExecution(workspaceId, agentId, executionId);
      
      // Check if execution is complete
      if (execution.status === 'succeeded' || execution.status === 'failed') {
        return execution;
      }
      
      // Wait for next poll
      await new Promise(resolve => setTimeout(resolve, interval));
      
      retries++;
    }
    
    // If we get here, execution timed out
    throw new Error(`Agent execution timed out after ${maxRetries * interval / 1000} seconds`);
  }
  
  /**
   * Get agent run by ID
   * @param workspaceId Workspace ID
   * @param agentId Agent ID
   * @param runId Run ID
   * @param apiKey API key
   * @returns Agent run
   */
  public async getAgentRun(
    workspaceId: string,
    agentId: string,
    runId: string,
    apiKey: string
  ): Promise<AgentRun> {
    try {
      // Check if user has permission to access this agent
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_AGENT,
        ResourceType.AGENT,
        `${workspaceId}/${agentId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this agent: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get agent run
      const run = this.agentRuns.get(runId);
      
      if (!run) {
        throw new APIError(`Agent run not found: ${runId}`, 404, 'NOT_FOUND');
      }
      
      // Check if run belongs to the specified agent and workspace
      if (run.agentId !== agentId || run.workspaceId !== workspaceId) {
        throw new APIError(
          `Agent run does not belong to the specified agent or workspace`,
          400,
          'BAD_REQUEST'
        );
      }
      
      return run;
    } catch (error) {
      logger.error(`Error getting agent run ${runId} for agent ${agentId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * List agent runs
   * @param workspaceId Workspace ID
   * @param agentId Agent ID
   * @param apiKey API key
   * @returns List of agent runs
   */
  public async listAgentRuns(
    workspaceId: string,
    agentId: string,
    apiKey: string
  ): Promise<AgentRun[]> {
    try {
      // Check if user has permission to access this agent
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_AGENT,
        ResourceType.AGENT,
        `${workspaceId}/${agentId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this agent: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get agent runs
      const runs = Array.from(this.agentRuns.values())
        .filter(run => run.agentId === agentId && run.workspaceId === workspaceId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      return runs;
    } catch (error) {
      logger.error(`Error listing agent runs for agent ${agentId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Create agent configuration
   * @param workspaceId Workspace ID
   * @param agentId Agent ID
   * @param name Configuration name
   * @param description Configuration description
   * @param parameters Configuration parameters
   * @param apiKey API key
   * @returns Agent configuration
   */
  public async createAgentConfig(
    workspaceId: string,
    agentId: string,
    name: string,
    description: string | undefined,
    parameters: Record<string, any> | undefined,
    apiKey: string
  ): Promise<AgentConfig> {
    try {
      // Check if user has permission to update this agent
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.WRITE_AGENT,
        ResourceType.AGENT,
        `${workspaceId}/${agentId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to update this agent: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Check if agent exists
      await this.getAgent(workspaceId, agentId, apiKey);
      
      // Create agent configuration
      const configId = `config-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const config: AgentConfig = {
        id: configId,
        agentId,
        workspaceId,
        name,
        description,
        parameters,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      // Store agent configuration
      this.agentConfigs.set(configId, config);
      
      return config;
    } catch (error) {
      logger.error(`Error creating agent configuration for agent ${agentId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get agent configuration by ID
   * @param workspaceId Workspace ID
   * @param agentId Agent ID
   * @param configId Configuration ID
   * @param apiKey API key
   * @returns Agent configuration
   */
  public async getAgentConfig(
    workspaceId: string,
    agentId: string,
    configId: string,
    apiKey: string
  ): Promise<AgentConfig> {
    try {
      // Check if user has permission to access this agent
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_AGENT,
        ResourceType.AGENT,
        `${workspaceId}/${agentId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this agent: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get agent configuration
      const config = this.agentConfigs.get(configId);
      
      if (!config) {
        throw new APIError(`Agent configuration not found: ${configId}`, 404, 'NOT_FOUND');
      }
      
      // Check if configuration belongs to the specified agent and workspace
      if (config.agentId !== agentId || config.workspaceId !== workspaceId) {
        throw new APIError(
          `Agent configuration does not belong to the specified agent or workspace`,
          400,
          'BAD_REQUEST'
        );
      }
      
      return config;
    } catch (error) {
      logger.error(`Error getting agent configuration ${configId} for agent ${agentId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * List agent configurations
   * @param workspaceId Workspace ID
   * @param agentId Agent ID
   * @param apiKey API key
   * @returns List of agent configurations
   */
  public async listAgentConfigs(
    workspaceId: string,
    agentId: string,
    apiKey: string
  ): Promise<AgentConfig[]> {
    try {
      // Check if user has permission to access this agent
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_AGENT,
        ResourceType.AGENT,
        `${workspaceId}/${agentId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this agent: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get agent configurations
      const configs = Array.from(this.agentConfigs.values())
        .filter(config => config.agentId === agentId && config.workspaceId === workspaceId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      return configs;
    } catch (error) {
      logger.error(`Error listing agent configurations for agent ${agentId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update agent configuration
   * @param workspaceId Workspace ID
   * @param agentId Agent ID
   * @param configId Configuration ID
   * @param name Configuration name
   * @param description Configuration description
   * @param parameters Configuration parameters
   * @param apiKey API key
   * @returns Updated agent configuration
   */
  public async updateAgentConfig(
    workspaceId: string,
    agentId: string,
    configId: string,
    name: string | undefined,
    description: string | undefined,
    parameters: Record<string, any> | undefined,
    apiKey: string
  ): Promise<AgentConfig> {
    try {
      // Check if user has permission to update this agent
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.WRITE_AGENT,
        ResourceType.AGENT,
        `${workspaceId}/${agentId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to update this agent: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get agent configuration
      const config = await this.getAgentConfig(workspaceId, agentId, configId, apiKey);
      
      // Update agent configuration
      if (name !== undefined) {
        config.name = name;
      }
      
      if (description !== undefined) {
        config.description = description;
      }
      
      if (parameters !== undefined) {
        config.parameters = parameters;
      }
      
      config.updatedAt = new Date().toISOString();
      
      // Store updated agent configuration
      this.agentConfigs.set(configId, config);
      
      return config;
    } catch (error) {
      logger.error(`Error updating agent configuration ${configId} for agent ${agentId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Delete agent configuration
   * @param workspaceId Workspace ID
   * @param agentId Agent ID
   * @param configId Configuration ID
   * @param apiKey API key
   */
  public async deleteAgentConfig(
    workspaceId: string,
    agentId: string,
    configId: string,
    apiKey: string
  ): Promise<void> {
    try {
      // Check if user has permission to update this agent
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.WRITE_AGENT,
        ResourceType.AGENT,
        `${workspaceId}/${agentId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to update this agent: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get agent configuration
      await this.getAgentConfig(workspaceId, agentId, configId, apiKey);
      
      // Delete agent configuration
      this.agentConfigs.delete(configId);
    } catch (error) {
      logger.error(`Error deleting agent configuration ${configId} for agent ${agentId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
}
