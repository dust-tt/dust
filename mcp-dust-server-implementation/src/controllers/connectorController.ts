// src/controllers/connectorController.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ConnectorService } from '../services/connectorService';
import { APIError } from '../middleware/error-middleware';

/**
 * Connector controller for handling connector-related API endpoints
 */
export class ConnectorController {
  private connectorService: ConnectorService;
  
  /**
   * Create a new ConnectorController
   * @param connectorService Connector service
   */
  constructor(connectorService: ConnectorService) {
    this.connectorService = connectorService;
    
    logger.info('ConnectorController initialized');
  }
  
  /**
   * List connectors in a workspace
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public listConnectors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID from request parameters
      const { workspaceId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get connectors
      const connectors = await this.connectorService.listConnectors(workspaceId, apiKey);
      
      // Return connectors
      res.json({ connectors });
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Get connector by ID
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public getConnector = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and connector ID from request parameters
      const { workspaceId, connectorId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get connector
      const connector = await this.connectorService.getConnector(workspaceId, connectorId, apiKey);
      
      // Return connector
      res.json(connector);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Create connector configuration
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public createConnectorConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and connector ID from request parameters
      const { workspaceId, connectorId } = req.params;
      
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
      
      // Create connector configuration
      const config = await this.connectorService.createConnectorConfig(
        workspaceId,
        connectorId,
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
   * Get connector configuration by ID
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public getConnectorConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID, connector ID, and config ID from request parameters
      const { workspaceId, connectorId, configId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get connector configuration
      const config = await this.connectorService.getConnectorConfig(
        workspaceId,
        connectorId,
        configId,
        apiKey
      );
      
      // Return configuration
      res.json(config);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * List connector configurations
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public listConnectorConfigs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and connector ID from request parameters
      const { workspaceId, connectorId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get connector configurations
      const configs = await this.connectorService.listConnectorConfigs(
        workspaceId,
        connectorId,
        apiKey
      );
      
      // Return configurations
      res.json({ configs });
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Update connector configuration
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public updateConnectorConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID, connector ID, and config ID from request parameters
      const { workspaceId, connectorId, configId } = req.params;
      
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
      
      // Update connector configuration
      const config = await this.connectorService.updateConnectorConfig(
        workspaceId,
        connectorId,
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
   * Delete connector configuration
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public deleteConnectorConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID, connector ID, and config ID from request parameters
      const { workspaceId, connectorId, configId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Delete connector configuration
      await this.connectorService.deleteConnectorConfig(
        workspaceId,
        connectorId,
        configId,
        apiKey
      );
      
      // Return success
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Sync a connector
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public syncConnector = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and connector ID from request parameters
      const { workspaceId, connectorId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Sync connector
      const sync = await this.connectorService.syncConnector(workspaceId, connectorId, apiKey);
      
      // Return sync
      res.status(202).json(sync);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Get connector sync by ID
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public getConnectorSync = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID, connector ID, and sync ID from request parameters
      const { workspaceId, connectorId, syncId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get connector sync
      const sync = await this.connectorService.getConnectorSync(
        workspaceId,
        connectorId,
        syncId,
        apiKey
      );
      
      // Return sync
      res.json(sync);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * List connector syncs
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public listConnectorSyncs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and connector ID from request parameters
      const { workspaceId, connectorId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get connector syncs
      const syncs = await this.connectorService.listConnectorSyncs(
        workspaceId,
        connectorId,
        apiKey
      );
      
      // Return syncs
      res.json({ syncs });
    } catch (error) {
      next(error);
    }
  };
}
