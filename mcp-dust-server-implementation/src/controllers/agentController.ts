// src/controllers/agentController.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AgentService } from '../services/agentService';
import { APIError } from '../middleware/error-middleware';

/**
 * Agent controller for handling agent-related API endpoints
 */
export class AgentController {
  private agentService: AgentService;
  
  /**
   * Create a new AgentController
   * @param agentService Agent service
   */
  constructor(agentService: AgentService) {
    this.agentService = agentService;
    
    logger.info('AgentController initialized');
  }
  
  /**
   * List agents in a workspace
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public listAgents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID from request parameters
      const { workspaceId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get agents
      const agents = await this.agentService.listAgents(workspaceId, apiKey);
      
      // Return agents
      res.json({ agents });
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Get agent by ID
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public getAgent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and agent ID from request parameters
      const { workspaceId, agentId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get agent
      const agent = await this.agentService.getAgent(workspaceId, agentId, apiKey);
      
      // Return agent
      res.json(agent);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Execute an agent
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public executeAgent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and agent ID from request parameters
      const { workspaceId, agentId } = req.params;
      
      // Get input and config ID from request body
      const { input, configId } = req.body;
      
      // Validate request body
      if (!input) {
        throw new APIError('Input is required', 400, 'BAD_REQUEST');
      }
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Execute agent
      const run = await this.agentService.executeAgent(workspaceId, agentId, input, configId, apiKey);
      
      // Return run
      res.status(202).json(run);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Get agent run by ID
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public getAgentRun = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID, agent ID, and run ID from request parameters
      const { workspaceId, agentId, runId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get agent run
      const run = await this.agentService.getAgentRun(workspaceId, agentId, runId, apiKey);
      
      // Return run
      res.json(run);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * List agent runs
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public listAgentRuns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and agent ID from request parameters
      const { workspaceId, agentId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get agent runs
      const runs = await this.agentService.listAgentRuns(workspaceId, agentId, apiKey);
      
      // Return runs
      res.json({ runs });
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Create agent configuration
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public createAgentConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and agent ID from request parameters
      const { workspaceId, agentId } = req.params;
      
      // Get configuration data from request body
      const { name, description, parameters } = req.body;
      
      // Validate request body
      if (!name) {
        throw new APIError('Configuration name is required', 400, 'BAD_REQUEST');
      }
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Create agent configuration
      const config = await this.agentService.createAgentConfig(
        workspaceId,
        agentId,
        name,
        description,
        parameters,
        apiKey
      );
      
      // Return configuration
      res.status(201).json(config);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Get agent configuration by ID
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public getAgentConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID, agent ID, and config ID from request parameters
      const { workspaceId, agentId, configId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get agent configuration
      const config = await this.agentService.getAgentConfig(workspaceId, agentId, configId, apiKey);
      
      // Return configuration
      res.json(config);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * List agent configurations
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public listAgentConfigs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and agent ID from request parameters
      const { workspaceId, agentId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get agent configurations
      const configs = await this.agentService.listAgentConfigs(workspaceId, agentId, apiKey);
      
      // Return configurations
      res.json({ configs });
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Update agent configuration
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public updateAgentConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID, agent ID, and config ID from request parameters
      const { workspaceId, agentId, configId } = req.params;
      
      // Get configuration data from request body
      const { name, description, parameters } = req.body;
      
      // Validate request body
      if (!name && description === undefined && parameters === undefined) {
        throw new APIError('At least one field to update is required', 400, 'BAD_REQUEST');
      }
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Update agent configuration
      const config = await this.agentService.updateAgentConfig(
        workspaceId,
        agentId,
        configId,
        name,
        description,
        parameters,
        apiKey
      );
      
      // Return configuration
      res.json(config);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Delete agent configuration
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public deleteAgentConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID, agent ID, and config ID from request parameters
      const { workspaceId, agentId, configId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Delete agent configuration
      await this.agentService.deleteAgentConfig(workspaceId, agentId, configId, apiKey);
      
      // Return success
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}
