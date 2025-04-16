// src/services/eventBridge.ts
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { DustService } from './dustService';
import { MCPServer } from '../types/server';
import { v4 as uuidv4 } from 'uuid';

/**
 * Event types
 */
export enum EventType {
  // Agent events
  AGENT_EXECUTION_STARTED = 'agent:execution:started',
  AGENT_EXECUTION_PROGRESS = 'agent:execution:progress',
  AGENT_EXECUTION_COMPLETED = 'agent:execution:completed',
  AGENT_EXECUTION_FAILED = 'agent:execution:failed',
  
  // Knowledge base events
  KNOWLEDGE_BASE_SEARCH_STARTED = 'knowledge_base:search:started',
  KNOWLEDGE_BASE_SEARCH_PROGRESS = 'knowledge_base:search:progress',
  KNOWLEDGE_BASE_SEARCH_COMPLETED = 'knowledge_base:search:completed',
  KNOWLEDGE_BASE_SEARCH_FAILED = 'knowledge_base:search:failed',
  
  // Connector events
  CONNECTOR_DATA_STARTED = 'connector:data:started',
  CONNECTOR_DATA_PROGRESS = 'connector:data:progress',
  CONNECTOR_DATA_COMPLETED = 'connector:data:completed',
  CONNECTOR_DATA_FAILED = 'connector:data:failed',
  
  // Session events
  SESSION_CREATED = 'session:created',
  SESSION_UPDATED = 'session:updated',
  SESSION_DELETED = 'session:deleted',
  
  // System events
  SYSTEM_ERROR = 'system:error',
  SYSTEM_WARNING = 'system:warning',
  SYSTEM_INFO = 'system:info',
}

/**
 * Event data
 */
export interface EventData {
  id: string;
  type: EventType;
  timestamp: number;
  source: string;
  data: Record<string, any>;
}

/**
 * Event subscription
 */
export interface EventSubscription {
  id: string;
  eventTypes: EventType[];
  callback: (event: EventData) => void;
  filter?: (event: EventData) => boolean;
}

/**
 * Progress notification
 */
export interface ProgressNotification {
  id: string;
  type: string;
  timestamp: number;
  progress: number;
  message: string;
  data?: Record<string, any>;
}

/**
 * Event bridge for connecting Dust's event system with MCP's progress notifications
 */
export class EventBridge {
  private dustService: DustService;
  private mcpServer?: MCPServer;
  private eventEmitter: EventEmitter;
  private subscriptions: Map<string, EventSubscription>;
  private pollingIntervals: Map<string, NodeJS.Timeout>;
  private sessionId?: string;
  
  /**
   * Create a new EventBridge
   * @param dustService DustService instance
   * @param mcpServer MCPServer instance
   * @param sessionId Session ID
   */
  constructor(dustService: DustService, mcpServer?: MCPServer, sessionId?: string) {
    this.dustService = dustService;
    this.mcpServer = mcpServer;
    this.sessionId = sessionId;
    this.eventEmitter = new EventEmitter();
    this.subscriptions = new Map();
    this.pollingIntervals = new Map();
    
    // Set max listeners to avoid memory leak warnings
    this.eventEmitter.setMaxListeners(100);
    
    logger.info('EventBridge initialized');
  }
  
  /**
   * Subscribe to events
   * @param eventTypes Event types to subscribe to
   * @param callback Callback function
   * @param filter Filter function
   * @returns Subscription ID
   */
  public subscribe(
    eventTypes: EventType[],
    callback: (event: EventData) => void,
    filter?: (event: EventData) => boolean
  ): string {
    // Create subscription
    const subscriptionId = uuidv4();
    const subscription: EventSubscription = {
      id: subscriptionId,
      eventTypes,
      callback,
      filter,
    };
    
    // Store subscription
    this.subscriptions.set(subscriptionId, subscription);
    
    // Add event listeners
    for (const eventType of eventTypes) {
      this.eventEmitter.on(eventType, (event: EventData) => {
        // Check filter
        if (subscription.filter && !subscription.filter(event)) {
          return;
        }
        
        // Call callback
        subscription.callback(event);
      });
    }
    
    logger.debug(`Subscribed to events: ${eventTypes.join(', ')} (${subscriptionId})`);
    
    return subscriptionId;
  }
  
  /**
   * Unsubscribe from events
   * @param subscriptionId Subscription ID
   * @returns Whether the subscription was removed
   */
  public unsubscribe(subscriptionId: string): boolean {
    // Get subscription
    const subscription = this.subscriptions.get(subscriptionId);
    
    if (!subscription) {
      return false;
    }
    
    // Remove subscription
    this.subscriptions.delete(subscriptionId);
    
    logger.debug(`Unsubscribed from events: ${subscription.eventTypes.join(', ')} (${subscriptionId})`);
    
    return true;
  }
  
  /**
   * Emit an event
   * @param eventType Event type
   * @param data Event data
   * @returns Event data
   */
  public emit(eventType: EventType, data: Record<string, any>): EventData {
    // Create event
    const event: EventData = {
      id: uuidv4(),
      type: eventType,
      timestamp: Date.now(),
      source: this.sessionId || 'system',
      data,
    };
    
    // Emit event
    this.eventEmitter.emit(eventType, event);
    
    // Convert to progress notification if MCP server is available
    if (this.mcpServer && this.sessionId) {
      const notification = this.convertToProgressNotification(event);
      
      if (notification) {
        // Send notification to MCP server
        this.sendProgressNotification(notification);
      }
    }
    
    logger.debug(`Emitted event: ${eventType} (${event.id})`);
    
    return event;
  }
  
  /**
   * Start polling for agent execution status
   * @param workspaceId Workspace ID
   * @param agentId Agent ID
   * @param executionId Execution ID
   * @param interval Polling interval in milliseconds
   * @returns Polling ID
   */
  public startAgentExecutionPolling(
    workspaceId: string,
    agentId: string,
    executionId: string,
    interval: number = 1000
  ): string {
    // Create polling ID
    const pollingId = `agent:${workspaceId}:${agentId}:${executionId}`;
    
    // Emit started event
    this.emit(EventType.AGENT_EXECUTION_STARTED, {
      workspaceId,
      agentId,
      executionId,
    });
    
    // Start polling
    const intervalId = setInterval(async () => {
      try {
        // Get execution status
        const execution = await this.dustService.getAgentExecution(workspaceId, agentId, executionId);
        
        // Check status
        if (execution.status === 'running') {
          // Emit progress event
          this.emit(EventType.AGENT_EXECUTION_PROGRESS, {
            workspaceId,
            agentId,
            executionId,
            status: execution.status,
            progress: 0.5, // We don't have actual progress information
          });
        } else if (execution.status === 'succeeded') {
          // Emit completed event
          this.emit(EventType.AGENT_EXECUTION_COMPLETED, {
            workspaceId,
            agentId,
            executionId,
            status: execution.status,
            output: execution.output,
          });
          
          // Stop polling
          this.stopPolling(pollingId);
        } else if (execution.status === 'failed') {
          // Emit failed event
          this.emit(EventType.AGENT_EXECUTION_FAILED, {
            workspaceId,
            agentId,
            executionId,
            status: execution.status,
            error: execution.error,
          });
          
          // Stop polling
          this.stopPolling(pollingId);
        }
      } catch (error) {
        // Emit failed event
        this.emit(EventType.AGENT_EXECUTION_FAILED, {
          workspaceId,
          agentId,
          executionId,
          error: error.message,
        });
        
        // Stop polling
        this.stopPolling(pollingId);
      }
    }, interval);
    
    // Store interval ID
    this.pollingIntervals.set(pollingId, intervalId);
    
    logger.debug(`Started agent execution polling: ${pollingId}`);
    
    return pollingId;
  }
  
  /**
   * Start polling for knowledge base search status
   * @param workspaceId Workspace ID
   * @param knowledgeBaseId Knowledge base ID
   * @param searchId Search ID
   * @param interval Polling interval in milliseconds
   * @returns Polling ID
   */
  public startKnowledgeBaseSearchPolling(
    workspaceId: string,
    knowledgeBaseId: string,
    searchId: string,
    interval: number = 1000
  ): string {
    // Create polling ID
    const pollingId = `knowledge_base:${workspaceId}:${knowledgeBaseId}:${searchId}`;
    
    // Emit started event
    this.emit(EventType.KNOWLEDGE_BASE_SEARCH_STARTED, {
      workspaceId,
      knowledgeBaseId,
      searchId,
    });
    
    // For now, we'll just emit a completed event after a short delay
    // In a real implementation, we would poll the Dust API for search status
    setTimeout(() => {
      // Emit completed event
      this.emit(EventType.KNOWLEDGE_BASE_SEARCH_COMPLETED, {
        workspaceId,
        knowledgeBaseId,
        searchId,
        results: [],
      });
    }, 1000);
    
    logger.debug(`Started knowledge base search polling: ${pollingId}`);
    
    return pollingId;
  }
  
  /**
   * Start polling for connector data status
   * @param workspaceId Workspace ID
   * @param connectorId Connector ID
   * @param requestId Request ID
   * @param interval Polling interval in milliseconds
   * @returns Polling ID
   */
  public startConnectorDataPolling(
    workspaceId: string,
    connectorId: string,
    requestId: string,
    interval: number = 1000
  ): string {
    // Create polling ID
    const pollingId = `connector:${workspaceId}:${connectorId}:${requestId}`;
    
    // Emit started event
    this.emit(EventType.CONNECTOR_DATA_STARTED, {
      workspaceId,
      connectorId,
      requestId,
    });
    
    // For now, we'll just emit a completed event after a short delay
    // In a real implementation, we would poll the Dust API for connector data status
    setTimeout(() => {
      // Emit completed event
      this.emit(EventType.CONNECTOR_DATA_COMPLETED, {
        workspaceId,
        connectorId,
        requestId,
        data: {},
      });
    }, 1000);
    
    logger.debug(`Started connector data polling: ${pollingId}`);
    
    return pollingId;
  }
  
  /**
   * Stop polling
   * @param pollingId Polling ID
   * @returns Whether the polling was stopped
   */
  public stopPolling(pollingId: string): boolean {
    // Get interval ID
    const intervalId = this.pollingIntervals.get(pollingId);
    
    if (!intervalId) {
      return false;
    }
    
    // Clear interval
    clearInterval(intervalId);
    
    // Remove interval ID
    this.pollingIntervals.delete(pollingId);
    
    logger.debug(`Stopped polling: ${pollingId}`);
    
    return true;
  }
  
  /**
   * Convert an event to a progress notification
   * @param event Event data
   * @returns Progress notification
   */
  private convertToProgressNotification(event: EventData): ProgressNotification | null {
    // Create notification
    const notification: ProgressNotification = {
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      progress: 0,
      message: '',
      data: event.data,
    };
    
    // Set progress and message based on event type
    switch (event.type) {
      case EventType.AGENT_EXECUTION_STARTED:
        notification.progress = 0;
        notification.message = 'Agent execution started';
        break;
      case EventType.AGENT_EXECUTION_PROGRESS:
        notification.progress = event.data.progress || 0.5;
        notification.message = 'Agent execution in progress';
        break;
      case EventType.AGENT_EXECUTION_COMPLETED:
        notification.progress = 1;
        notification.message = 'Agent execution completed';
        break;
      case EventType.AGENT_EXECUTION_FAILED:
        notification.progress = 1;
        notification.message = `Agent execution failed: ${event.data.error}`;
        break;
      case EventType.KNOWLEDGE_BASE_SEARCH_STARTED:
        notification.progress = 0;
        notification.message = 'Knowledge base search started';
        break;
      case EventType.KNOWLEDGE_BASE_SEARCH_PROGRESS:
        notification.progress = event.data.progress || 0.5;
        notification.message = 'Knowledge base search in progress';
        break;
      case EventType.KNOWLEDGE_BASE_SEARCH_COMPLETED:
        notification.progress = 1;
        notification.message = 'Knowledge base search completed';
        break;
      case EventType.KNOWLEDGE_BASE_SEARCH_FAILED:
        notification.progress = 1;
        notification.message = `Knowledge base search failed: ${event.data.error}`;
        break;
      case EventType.CONNECTOR_DATA_STARTED:
        notification.progress = 0;
        notification.message = 'Connector data request started';
        break;
      case EventType.CONNECTOR_DATA_PROGRESS:
        notification.progress = event.data.progress || 0.5;
        notification.message = 'Connector data request in progress';
        break;
      case EventType.CONNECTOR_DATA_COMPLETED:
        notification.progress = 1;
        notification.message = 'Connector data request completed';
        break;
      case EventType.CONNECTOR_DATA_FAILED:
        notification.progress = 1;
        notification.message = `Connector data request failed: ${event.data.error}`;
        break;
      default:
        // Not a progress event
        return null;
    }
    
    return notification;
  }
  
  /**
   * Send a progress notification to the MCP server
   * @param notification Progress notification
   */
  private sendProgressNotification(notification: ProgressNotification): void {
    // Check if MCP server and session ID are available
    if (!this.mcpServer || !this.sessionId) {
      return;
    }
    
    // TODO: Implement sending progress notification to MCP server
    // For now, we'll just log it
    logger.debug(`Sending progress notification: ${notification.type} (${notification.id})`);
  }
  
  /**
   * Dispose of the event bridge
   */
  public dispose(): void {
    // Clear all subscriptions
    this.subscriptions.clear();
    
    // Clear all polling intervals
    for (const intervalId of this.pollingIntervals.values()) {
      clearInterval(intervalId);
    }
    this.pollingIntervals.clear();
    
    // Remove all listeners
    this.eventEmitter.removeAllListeners();
    
    logger.info('EventBridge disposed');
  }
}
