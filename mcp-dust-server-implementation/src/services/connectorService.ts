// src/services/connectorService.ts
import { logger } from '../utils/logger';
import { DustService, DustConnector } from './dustService';
import { PermissionProxy, Permission, ResourceType } from './permissionProxy';
import { EventBridge, EventType } from './eventBridge';
import { APIError } from '../middleware/error-middleware';

/**
 * Connector type
 */
export enum ConnectorType {
  GITHUB = 'github',
  SLACK = 'slack',
  NOTION = 'notion',
  GOOGLE_DRIVE = 'google_drive',
  CUSTOM = 'custom',
}

/**
 * Connector status
 */
export enum ConnectorStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  PENDING = 'pending',
}

/**
 * Connector configuration
 */
export interface ConnectorConfig {
  id: string;
  connectorId: string;
  workspaceId: string;
  name: string;
  description?: string;
  parameters?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Connector sync
 */
export interface ConnectorSync {
  id: string;
  connectorId: string;
  workspaceId: string;
  status: ConnectorStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Connector service options
 */
export interface ConnectorServiceOptions {
  dustService: DustService;
  permissionProxy: PermissionProxy;
  eventBridge?: EventBridge;
}

/**
 * Connector service for managing connectors
 */
export class ConnectorService {
  private dustService: DustService;
  private permissionProxy: PermissionProxy;
  private eventBridge?: EventBridge;
  private connectorConfigs: Map<string, ConnectorConfig>;
  private connectorSyncs: Map<string, ConnectorSync>;
  
  /**
   * Create a new ConnectorService
   * @param options Connector service options
   */
  constructor(options: ConnectorServiceOptions) {
    this.dustService = options.dustService;
    this.permissionProxy = options.permissionProxy;
    this.eventBridge = options.eventBridge;
    this.connectorConfigs = new Map();
    this.connectorSyncs = new Map();
    
    logger.info('ConnectorService initialized');
  }
  
  /**
   * List connectors in a workspace
   * @param workspaceId Workspace ID
   * @param apiKey API key
   * @returns List of connectors
   */
  public async listConnectors(workspaceId: string, apiKey: string): Promise<DustConnector[]> {
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
      
      // Get connectors from Dust API
      return this.dustService.listConnectors(workspaceId);
    } catch (error) {
      logger.error(`Error listing connectors for workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get connector by ID
   * @param workspaceId Workspace ID
   * @param connectorId Connector ID
   * @param apiKey API key
   * @returns Connector details
   */
  public async getConnector(
    workspaceId: string,
    connectorId: string,
    apiKey: string
  ): Promise<DustConnector> {
    try {
      // Check if user has permission to access this connector
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_CONNECTOR,
        ResourceType.CONNECTOR,
        `${workspaceId}/${connectorId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this connector: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get connector from Dust API
      return this.dustService.getConnector(workspaceId, connectorId);
    } catch (error) {
      logger.error(`Error getting connector ${connectorId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Create a connector configuration
   * @param workspaceId Workspace ID
   * @param connectorId Connector ID
   * @param name Configuration name
   * @param description Configuration description
   * @param parameters Configuration parameters
   * @param apiKey API key
   * @returns Connector configuration
   */
  public async createConnectorConfig(
    workspaceId: string,
    connectorId: string,
    name: string,
    description: string | undefined,
    parameters: Record<string, any> | undefined,
    apiKey: string
  ): Promise<ConnectorConfig> {
    try {
      // Check if user has permission to update this connector
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.WRITE_CONNECTOR,
        ResourceType.CONNECTOR,
        `${workspaceId}/${connectorId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to update this connector: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Check if connector exists
      await this.getConnector(workspaceId, connectorId, apiKey);
      
      // Create connector configuration
      const configId = `config-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const config: ConnectorConfig = {
        id: configId,
        connectorId,
        workspaceId,
        name,
        description,
        parameters,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      // Store connector configuration
      this.connectorConfigs.set(configId, config);
      
      return config;
    } catch (error) {
      logger.error(`Error creating connector configuration for connector ${connectorId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get connector configuration by ID
   * @param workspaceId Workspace ID
   * @param connectorId Connector ID
   * @param configId Configuration ID
   * @param apiKey API key
   * @returns Connector configuration
   */
  public async getConnectorConfig(
    workspaceId: string,
    connectorId: string,
    configId: string,
    apiKey: string
  ): Promise<ConnectorConfig> {
    try {
      // Check if user has permission to access this connector
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_CONNECTOR,
        ResourceType.CONNECTOR,
        `${workspaceId}/${connectorId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this connector: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get connector configuration
      const config = this.connectorConfigs.get(configId);
      
      if (!config) {
        throw new APIError(`Connector configuration not found: ${configId}`, 404, 'NOT_FOUND');
      }
      
      // Check if configuration belongs to the specified connector and workspace
      if (config.connectorId !== connectorId || config.workspaceId !== workspaceId) {
        throw new APIError(
          `Connector configuration does not belong to the specified connector or workspace`,
          400,
          'BAD_REQUEST'
        );
      }
      
      return config;
    } catch (error) {
      logger.error(`Error getting connector configuration ${configId} for connector ${connectorId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * List connector configurations
   * @param workspaceId Workspace ID
   * @param connectorId Connector ID
   * @param apiKey API key
   * @returns List of connector configurations
   */
  public async listConnectorConfigs(
    workspaceId: string,
    connectorId: string,
    apiKey: string
  ): Promise<ConnectorConfig[]> {
    try {
      // Check if user has permission to access this connector
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_CONNECTOR,
        ResourceType.CONNECTOR,
        `${workspaceId}/${connectorId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this connector: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get connector configurations
      const configs = Array.from(this.connectorConfigs.values())
        .filter(config => config.connectorId === connectorId && config.workspaceId === workspaceId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      return configs;
    } catch (error) {
      logger.error(`Error listing connector configurations for connector ${connectorId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update connector configuration
   * @param workspaceId Workspace ID
   * @param connectorId Connector ID
   * @param configId Configuration ID
   * @param name Configuration name
   * @param description Configuration description
   * @param parameters Configuration parameters
   * @param apiKey API key
   * @returns Updated connector configuration
   */
  public async updateConnectorConfig(
    workspaceId: string,
    connectorId: string,
    configId: string,
    name: string | undefined,
    description: string | undefined,
    parameters: Record<string, any> | undefined,
    apiKey: string
  ): Promise<ConnectorConfig> {
    try {
      // Check if user has permission to update this connector
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.WRITE_CONNECTOR,
        ResourceType.CONNECTOR,
        `${workspaceId}/${connectorId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to update this connector: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get connector configuration
      const config = await this.getConnectorConfig(workspaceId, connectorId, configId, apiKey);
      
      // Update connector configuration
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
      
      // Store updated connector configuration
      this.connectorConfigs.set(configId, config);
      
      return config;
    } catch (error) {
      logger.error(`Error updating connector configuration ${configId} for connector ${connectorId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Delete connector configuration
   * @param workspaceId Workspace ID
   * @param connectorId Connector ID
   * @param configId Configuration ID
   * @param apiKey API key
   */
  public async deleteConnectorConfig(
    workspaceId: string,
    connectorId: string,
    configId: string,
    apiKey: string
  ): Promise<void> {
    try {
      // Check if user has permission to update this connector
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.WRITE_CONNECTOR,
        ResourceType.CONNECTOR,
        `${workspaceId}/${connectorId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to update this connector: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get connector configuration
      await this.getConnectorConfig(workspaceId, connectorId, configId, apiKey);
      
      // Delete connector configuration
      this.connectorConfigs.delete(configId);
    } catch (error) {
      logger.error(`Error deleting connector configuration ${configId} for connector ${connectorId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Sync a connector
   * @param workspaceId Workspace ID
   * @param connectorId Connector ID
   * @param apiKey API key
   * @returns Connector sync
   */
  public async syncConnector(
    workspaceId: string,
    connectorId: string,
    apiKey: string
  ): Promise<ConnectorSync> {
    try {
      // Check if user has permission to update this connector
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.WRITE_CONNECTOR,
        ResourceType.CONNECTOR,
        `${workspaceId}/${connectorId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to update this connector: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Check if connector exists
      await this.getConnector(workspaceId, connectorId, apiKey);
      
      // Create connector sync
      const syncId = `sync-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const sync: ConnectorSync = {
        id: syncId,
        connectorId,
        workspaceId,
        status: ConnectorStatus.PENDING,
        startedAt: new Date().toISOString(),
        metadata: {
          progress: 0,
        },
      };
      
      // Store connector sync
      this.connectorSyncs.set(syncId, sync);
      
      // Emit connector sync started event
      if (this.eventBridge) {
        this.eventBridge.emit(EventType.CONNECTOR_SYNC_STARTED, {
          workspaceId,
          connectorId,
          syncId,
        });
      }
      
      // Start connector sync asynchronously
      this.syncConnectorAsync(workspaceId, connectorId, syncId, apiKey);
      
      return sync;
    } catch (error) {
      logger.error(`Error syncing connector ${connectorId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Sync a connector asynchronously
   * @param workspaceId Workspace ID
   * @param connectorId Connector ID
   * @param syncId Sync ID
   * @param apiKey API key
   */
  private async syncConnectorAsync(
    workspaceId: string,
    connectorId: string,
    syncId: string,
    apiKey: string
  ): Promise<void> {
    try {
      // Get connector sync
      const sync = this.connectorSyncs.get(syncId);
      
      if (!sync) {
        logger.error(`Connector sync not found: ${syncId}`);
        return;
      }
      
      // Update sync status
      sync.status = ConnectorStatus.ACTIVE;
      sync.metadata = {
        ...sync.metadata,
        progress: 0,
      };
      
      // Emit connector sync progress event
      if (this.eventBridge) {
        this.eventBridge.emit(EventType.CONNECTOR_SYNC_PROGRESS, {
          workspaceId,
          connectorId,
          syncId,
          progress: 0,
        });
      }
      
      // Simulate sync progress
      for (let progress = 0; progress <= 100; progress += 10) {
        // Update sync progress
        sync.metadata = {
          ...sync.metadata,
          progress,
        };
        
        // Emit connector sync progress event
        if (this.eventBridge) {
          this.eventBridge.emit(EventType.CONNECTOR_SYNC_PROGRESS, {
            workspaceId,
            connectorId,
            syncId,
            progress,
          });
        }
        
        // Wait for next progress update
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Update sync status
      sync.status = ConnectorStatus.ACTIVE;
      sync.completedAt = new Date().toISOString();
      sync.metadata = {
        ...sync.metadata,
        progress: 100,
        documentsProcessed: 42,
        documentsAdded: 15,
        documentsUpdated: 5,
        documentsRemoved: 2,
      };
      
      // Emit connector sync completed event
      if (this.eventBridge) {
        this.eventBridge.emit(EventType.CONNECTOR_SYNC_COMPLETED, {
          workspaceId,
          connectorId,
          syncId,
          metadata: sync.metadata,
        });
      }
    } catch (error) {
      // Get connector sync
      const sync = this.connectorSyncs.get(syncId);
      
      if (sync) {
        // Update sync with error
        sync.status = ConnectorStatus.ERROR;
        sync.error = error.message;
        sync.completedAt = new Date().toISOString();
        
        // Emit connector sync failed event
        if (this.eventBridge) {
          this.eventBridge.emit(EventType.CONNECTOR_SYNC_FAILED, {
            workspaceId,
            connectorId,
            syncId,
            error: error.message,
          });
        }
      }
      
      logger.error(`Error syncing connector ${connectorId} in workspace ${workspaceId}: ${error.message}`);
    }
  }
  
  /**
   * Get connector sync by ID
   * @param workspaceId Workspace ID
   * @param connectorId Connector ID
   * @param syncId Sync ID
   * @param apiKey API key
   * @returns Connector sync
   */
  public async getConnectorSync(
    workspaceId: string,
    connectorId: string,
    syncId: string,
    apiKey: string
  ): Promise<ConnectorSync> {
    try {
      // Check if user has permission to access this connector
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_CONNECTOR,
        ResourceType.CONNECTOR,
        `${workspaceId}/${connectorId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this connector: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get connector sync
      const sync = this.connectorSyncs.get(syncId);
      
      if (!sync) {
        throw new APIError(`Connector sync not found: ${syncId}`, 404, 'NOT_FOUND');
      }
      
      // Check if sync belongs to the specified connector and workspace
      if (sync.connectorId !== connectorId || sync.workspaceId !== workspaceId) {
        throw new APIError(
          `Connector sync does not belong to the specified connector or workspace`,
          400,
          'BAD_REQUEST'
        );
      }
      
      return sync;
    } catch (error) {
      logger.error(`Error getting connector sync ${syncId} for connector ${connectorId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * List connector syncs
   * @param workspaceId Workspace ID
   * @param connectorId Connector ID
   * @param apiKey API key
   * @returns List of connector syncs
   */
  public async listConnectorSyncs(
    workspaceId: string,
    connectorId: string,
    apiKey: string
  ): Promise<ConnectorSync[]> {
    try {
      // Check if user has permission to access this connector
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_CONNECTOR,
        ResourceType.CONNECTOR,
        `${workspaceId}/${connectorId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this connector: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get connector syncs
      const syncs = Array.from(this.connectorSyncs.values())
        .filter(sync => sync.connectorId === connectorId && sync.workspaceId === workspaceId)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      
      return syncs;
    } catch (error) {
      logger.error(`Error listing connector syncs for connector ${connectorId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
}
