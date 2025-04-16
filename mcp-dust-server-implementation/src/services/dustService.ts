import fetch from 'node-fetch';
import { logger } from '../utils/logger';
import { APIError } from '../middleware/error-middleware';

// DustService options interface
export interface DustServiceOptions {
  apiKey: string;
  workspaceId: string;
  agentId: string;
  userContext: {
    username: string;
    email: string;
    fullName: string;
    timezone: string;
  };
  apiDomain?: string;
}

export interface DustWorkspace {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DustAgent {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DustAgentExecution {
  id: string;
  agentId: string;
  workspaceId: string;
  status: 'running' | 'succeeded' | 'failed';
  input: string;
  output?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DustKnowledgeBase {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DustConnector {
  id: string;
  name: string;
  description?: string;
  type: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceUpdates {
  name?: string;
  description?: string;
}

/**
 * DustService class for interacting with the Dust API
 */
export class DustService {
  private apiKey: string;
  private workspaceId: string;
  private agentId: string;
  private userContext: {
    username: string;
    email: string;
    fullName: string;
    timezone: string;
  };
  private apiDomain: string;

  /**
   * Create a new DustService instance
   * @param options DustService options
   */
  constructor(options: DustServiceOptions) {
    this.apiKey = options.apiKey;
    this.workspaceId = options.workspaceId;
    this.agentId = options.agentId;
    this.userContext = options.userContext;
    this.apiDomain = options.apiDomain || 'https://dust.tt';

    logger.info(`DustService initialized with workspace ID: ${this.workspaceId}`);
  }

  /**
   * Call the Dust API
   * @param endpoint API endpoint
   * @param method HTTP method
   * @param data Request data
   * @returns API response
   */
  async callDustApi<T>(endpoint: string, method: string = 'GET', data?: any): Promise<T> {
    try {
      // Ensure endpoint starts with a slash
      if (!endpoint.startsWith('/')) {
        endpoint = '/' + endpoint;
      }

      // Set up request headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': 'MCP-Dust-Server/1.0.0',
      };

      // Add user context headers if available
      if (this.userContext) {
        headers['X-Dust-User'] = this.userContext.username;
        headers['X-Dust-Email'] = this.userContext.email;
      }

      // Prepare request options
      const requestOptions: RequestInit = {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
      };

      // Make the request
      const url = `${this.apiDomain}/api${endpoint}`;
      logger.debug(`Calling Dust API: ${method} ${url}`);

      const response = await fetch(url, requestOptions);

      // Handle error responses
      if (!response.ok) {
        let errorData: any = {};

        try {
          errorData = await response.json();
        } catch (e) {
          // If response is not JSON, use text
          errorData = { message: await response.text() };
        }

        const errorMessage = errorData.message || response.statusText;
        logger.error(`Dust API error: ${response.status} ${errorMessage}`);

        throw new APIError(
          `Dust API error: ${errorMessage}`,
          response.status,
          errorData.code || 'DUST_API_ERROR'
        );
      }

      // Parse and return the response
      const responseData = await response.json();
      return responseData as T;
    } catch (error) {
      // If error is already an APIError, rethrow it
      if (error instanceof APIError) {
        throw error;
      }

      // Otherwise, wrap it in an APIError
      logger.error(`Error calling Dust API: ${error.message}`);
      throw new APIError(`Error calling Dust API: ${error.message}`, 500, 'DUST_API_ERROR');
    }
  }

  /**
   * List workspaces
   * @returns List of workspaces
   */
  async listWorkspaces(): Promise<DustWorkspace[]> {
    logger.info('Listing workspaces');
    const response = await this.callDustApi<{ workspaces: DustWorkspace[] }>('/workspaces');
    return response.workspaces;
  }

  /**
   * Get workspace by ID
   * @param workspaceId Workspace ID
   * @returns Workspace details
   */
  async getWorkspace(workspaceId: string): Promise<DustWorkspace> {
    logger.info(`Getting workspace: ${workspaceId}`);
    return this.callDustApi<DustWorkspace>(`/workspaces/${workspaceId}`);
  }

  /**
   * Create a new workspace
   * @param name Workspace name
   * @param description Workspace description
   * @returns Created workspace
   */
  async createWorkspace(name: string, description?: string): Promise<DustWorkspace> {
    logger.info(`Creating workspace: ${name}`);
    return this.callDustApi<DustWorkspace>('/workspaces', 'POST', {
      name,
      description,
    });
  }

  /**
   * Update a workspace
   * @param workspaceId Workspace ID
   * @param updates Workspace updates
   * @returns Updated workspace
   */
  async updateWorkspace(workspaceId: string, updates: WorkspaceUpdates): Promise<DustWorkspace> {
    logger.info(`Updating workspace: ${workspaceId}`);
    return this.callDustApi<DustWorkspace>(`/workspaces/${workspaceId}`, 'PATCH', updates);
  }

  /**
   * Delete a workspace
   * @param workspaceId Workspace ID
   */
  async deleteWorkspace(workspaceId: string): Promise<void> {
    logger.info(`Deleting workspace: ${workspaceId}`);
    await this.callDustApi<void>(`/workspaces/${workspaceId}`, 'DELETE');
  }

  /**
   * List agents in a workspace
   * @param workspaceId Workspace ID
   * @returns List of agents
   */
  async listAgents(workspaceId: string): Promise<DustAgent[]> {
    logger.info(`Listing agents for workspace: ${workspaceId}`);
    const response = await this.callDustApi<{ agents: DustAgent[] }>(`/workspaces/${workspaceId}/agents`);
    return response.agents;
  }

  /**
   * Get agent by ID
   * @param workspaceId Workspace ID
   * @param agentId Agent ID
   * @returns Agent details
   */
  async getAgent(workspaceId: string, agentId: string): Promise<DustAgent> {
    logger.info(`Getting agent: ${agentId} in workspace: ${workspaceId}`);
    return this.callDustApi<DustAgent>(`/workspaces/${workspaceId}/agents/${agentId}`);
  }

  /**
   * Execute an agent
   * @param workspaceId Workspace ID
   * @param agentId Agent ID
   * @param input Input for the agent
   * @returns Agent execution
   */
  async executeAgent(workspaceId: string, agentId: string, input: string): Promise<DustAgentExecution> {
    logger.info(`Executing agent: ${agentId} in workspace: ${workspaceId}`);
    return this.callDustApi<DustAgentExecution>(`/workspaces/${workspaceId}/agents/${agentId}/execute`, 'POST', {
      input,
    });
  }

  /**
   * Get agent execution by ID
   * @param workspaceId Workspace ID
   * @param agentId Agent ID
   * @param executionId Execution ID
   * @returns Agent execution details
   */
  async getAgentExecution(workspaceId: string, agentId: string, executionId: string): Promise<DustAgentExecution> {
    logger.info(`Getting agent execution: ${executionId} for agent: ${agentId} in workspace: ${workspaceId}`);
    return this.callDustApi<DustAgentExecution>(
      `/workspaces/${workspaceId}/agents/${agentId}/executions/${executionId}`
    );
  }

  /**
   * List knowledge bases in a workspace
   * @param workspaceId Workspace ID
   * @returns List of knowledge bases
   */
  async listKnowledgeBases(workspaceId: string): Promise<DustKnowledgeBase[]> {
    logger.info(`Listing knowledge bases for workspace: ${workspaceId}`);
    const response = await this.callDustApi<{ knowledgeBases: DustKnowledgeBase[] }>(
      `/workspaces/${workspaceId}/knowledge-bases`
    );
    return response.knowledgeBases;
  }

  /**
   * Get knowledge base by ID
   * @param workspaceId Workspace ID
   * @param knowledgeBaseId Knowledge base ID
   * @returns Knowledge base details
   */
  async getKnowledgeBase(workspaceId: string, knowledgeBaseId: string): Promise<DustKnowledgeBase> {
    logger.info(`Getting knowledge base: ${knowledgeBaseId} in workspace: ${workspaceId}`);
    return this.callDustApi<DustKnowledgeBase>(
      `/workspaces/${workspaceId}/knowledge-bases/${knowledgeBaseId}`
    );
  }

  /**
   * Search a knowledge base
   * @param workspaceId Workspace ID
   * @param knowledgeBaseId Knowledge base ID
   * @param query Search query
   * @param limit Result limit
   * @returns Search results
   */
  async searchKnowledgeBase(
    workspaceId: string,
    knowledgeBaseId: string,
    query: string,
    limit: number = 10
  ): Promise<any> {
    logger.info(`Searching knowledge base: ${knowledgeBaseId} in workspace: ${workspaceId} for: ${query}`);
    return this.callDustApi<any>(
      `/workspaces/${workspaceId}/knowledge-bases/${knowledgeBaseId}/search`,
      'POST',
      {
        query,
        limit,
      }
    );
  }

  /**
   * List connectors in a workspace
   * @param workspaceId Workspace ID
   * @returns List of connectors
   */
  async listConnectors(workspaceId: string): Promise<DustConnector[]> {
    logger.info(`Listing connectors for workspace: ${workspaceId}`);
    const response = await this.callDustApi<{ connectors: DustConnector[] }>(
      `/workspaces/${workspaceId}/connectors`
    );
    return response.connectors;
  }

  /**
   * Get connector by ID
   * @param workspaceId Workspace ID
   * @param connectorId Connector ID
   * @returns Connector details
   */
  async getConnector(workspaceId: string, connectorId: string): Promise<DustConnector> {
    logger.info(`Getting connector: ${connectorId} in workspace: ${workspaceId}`);
    return this.callDustApi<DustConnector>(
      `/workspaces/${workspaceId}/connectors/${connectorId}`
    );
  }

  /**
   * Get data from a connector
   * @param workspaceId Workspace ID
   * @param connectorId Connector ID
   * @param query Query parameters
   * @returns Connector data
   */
  async getConnectorData(
    workspaceId: string,
    connectorId: string,
    query: Record<string, any>
  ): Promise<any> {
    logger.info(`Getting data from connector: ${connectorId} in workspace: ${workspaceId}`);
    return this.callDustApi<any>(
      `/workspaces/${workspaceId}/connectors/${connectorId}/data`,
      'POST',
      query
    );
  }

  /**
   * Validate API key
   * @returns Whether the API key is valid
   */
  async validateApiKey(): Promise<boolean> {
    try {
      logger.info('Validating API key');
      await this.callDustApi<any>('/user');
      return true;
    } catch (error) {
      logger.error(`API key validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get user information
   * @returns User information
   */
  async getUserInfo(): Promise<any> {
    logger.info('Getting user information');
    return this.callDustApi<any>('/user');
  }

  /**
   * Extend the DustService with a custom method
   * @param methodName Method name
   * @param method Method implementation
   */
  extendWithMethod(methodName: string, method: Function): void {
    if (this[methodName]) {
      logger.warn(`Method ${methodName} already exists on DustService, overwriting`);
    }

    this[methodName] = method.bind(this);
    logger.info(`Extended DustService with method: ${methodName}`);
  }
}
