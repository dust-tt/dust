// src/services/permissionProxy.ts
import { logger } from '../utils/logger';
import { DustService } from './dustService';
import { APIError } from '../middleware/error-middleware';
import { UserContextService, UserContext } from './userContextService';
import { v4 as uuidv4 } from 'uuid';

/**
 * Permission types
 */
export enum Permission {
  // Workspace permissions
  READ_WORKSPACE = 'read:workspace',
  WRITE_WORKSPACE = 'write:workspace',
  DELETE_WORKSPACE = 'delete:workspace',
  ADMIN_WORKSPACE = 'admin:workspace',

  // Agent permissions
  READ_AGENT = 'read:agent',
  WRITE_AGENT = 'write:agent',
  EXECUTE_AGENT = 'execute:agent',
  DELETE_AGENT = 'delete:agent',
  ADMIN_AGENT = 'admin:agent',

  // Knowledge base permissions
  READ_KNOWLEDGE = 'read:knowledge',
  WRITE_KNOWLEDGE = 'write:knowledge',
  DELETE_KNOWLEDGE = 'delete:knowledge',
  ADMIN_KNOWLEDGE = 'admin:knowledge',

  // Connector permissions
  READ_CONNECTOR = 'read:connector',
  WRITE_CONNECTOR = 'write:connector',
  DELETE_CONNECTOR = 'delete:connector',
  ADMIN_CONNECTOR = 'admin:connector',

  // Task permissions
  READ_TASK = 'read:task',
  WRITE_TASK = 'write:task',
  DELETE_TASK = 'delete:task',
  ADMIN_TASK = 'admin:task',

  // User permissions
  READ_USER = 'read:user',
  WRITE_USER = 'write:user',
  DELETE_USER = 'delete:user',
  ADMIN_USER = 'admin:user',

  // System permissions
  READ_SYSTEM = 'read:system',
  WRITE_SYSTEM = 'write:system',
  ADMIN_SYSTEM = 'admin:system',
}

/**
 * Resource types
 */
export enum ResourceType {
  WORKSPACE = 'workspace',
  AGENT = 'agent',
  KNOWLEDGE_BASE = 'knowledge_base',
  CONNECTOR = 'connector',
  TASK = 'task',
  USER = 'user',
  SYSTEM = 'system',
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  granted: boolean;
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * Permission rule
 */
export interface PermissionRule {
  id: string;
  resourceType: ResourceType;
  resourcePattern: string;
  permission: Permission;
  effect: 'allow' | 'deny';
  conditions?: Record<string, any>;
  priority: number;
}

/**
 * Permission context
 */
export interface PermissionContext {
  user?: UserContext;
  resource?: Record<string, any>;
  action?: string;
  environment?: Record<string, any>;
}

/**
 * Permission proxy for checking permissions
 */
export class PermissionProxy {
  private dustService: DustService;
  private userContextService?: UserContextService;
  private permissionCache: Map<string, PermissionCheckResult>;
  private permissionRules: Map<string, PermissionRule>;
  private cacheTTL: number;

  /**
   * Create a new PermissionProxy
   * @param dustService DustService instance
   * @param userContextService UserContextService instance
   * @param cacheTTL Cache TTL in milliseconds (default: 5 minutes)
   */
  constructor(
    dustService: DustService,
    userContextService?: UserContextService,
    cacheTTL: number = 5 * 60 * 1000
  ) {
    this.dustService = dustService;
    this.userContextService = userContextService;
    this.permissionCache = new Map();
    this.permissionRules = new Map();
    this.cacheTTL = cacheTTL;

    // Clean up expired cache entries periodically
    setInterval(() => this.cleanupCache(), cacheTTL);

    // Initialize default permission rules
    this.initializeDefaultRules();

    logger.info('PermissionProxy initialized');
  }

  /**
   * Initialize default permission rules
   */
  private initializeDefaultRules(): void {
    // Add default rules for workspaces
    this.addRule({
      id: uuidv4(),
      resourceType: ResourceType.WORKSPACE,
      resourcePattern: '*',
      permission: Permission.READ_WORKSPACE,
      effect: 'allow',
      priority: 100,
    });

    // Add default rules for agents
    this.addRule({
      id: uuidv4(),
      resourceType: ResourceType.AGENT,
      resourcePattern: '*',
      permission: Permission.READ_AGENT,
      effect: 'allow',
      priority: 100,
    });

    // Add default rules for knowledge bases
    this.addRule({
      id: uuidv4(),
      resourceType: ResourceType.KNOWLEDGE_BASE,
      resourcePattern: '*',
      permission: Permission.READ_KNOWLEDGE,
      effect: 'allow',
      priority: 100,
    });

    // Add default rules for connectors
    this.addRule({
      id: uuidv4(),
      resourceType: ResourceType.CONNECTOR,
      resourcePattern: '*',
      permission: Permission.READ_CONNECTOR,
      effect: 'allow',
      priority: 100,
    });

    logger.info('Default permission rules initialized');
  }

  /**
   * Check if a user has a permission for a resource
   * @param apiKey API key
   * @param permission Permission to check
   * @param resourceType Resource type
   * @param resourceId Resource ID
   * @param context Permission context
   * @returns Permission check result
   */
  async checkPermission(
    apiKey: string,
    permission: Permission,
    resourceType: ResourceType,
    resourceId: string,
    context?: PermissionContext
  ): Promise<PermissionCheckResult> {
    try {
      // Create cache key
      const cacheKey = `${apiKey}:${permission}:${resourceType}:${resourceId}`;

      // Check cache
      const cachedResult = this.permissionCache.get(cacheKey);
      if (cachedResult) {
        logger.debug(`Using cached permission check result for ${cacheKey}`);
        return cachedResult;
      }

      // Get user context if available
      let userContext: UserContext | undefined;
      if (this.userContextService) {
        try {
          userContext = await this.userContextService.getUserContext(apiKey);
        } catch (error) {
          logger.warn(`Error getting user context: ${error.message}`);
        }
      }

      // Create permission context
      const permissionContext: PermissionContext = {
        ...context,
        user: userContext,
        environment: {
          timestamp: Date.now(),
          ...context?.environment,
        },
      };

      // First, try to evaluate using rules
      const ruleResult = this.evaluateRules(
        apiKey,
        permission,
        resourceType,
        resourceId,
        permissionContext
      );

      // If rules evaluation is conclusive, use that result
      if (ruleResult.granted || ruleResult.reason !== 'No matching permission rules') {
        // Cache result
        this.permissionCache.set(cacheKey, ruleResult);

        // Add expiration time to cache entry
        setTimeout(() => {
          this.permissionCache.delete(cacheKey);
        }, this.cacheTTL);

        return ruleResult;
      }

      // If no rules match, fall back to API-based permission checks
      let result: PermissionCheckResult;

      switch (resourceType) {
        case ResourceType.WORKSPACE:
          result = await this.checkWorkspacePermission(apiKey, permission, resourceId);
          break;
        case ResourceType.AGENT:
          result = await this.checkAgentPermission(apiKey, permission, resourceId);
          break;
        case ResourceType.KNOWLEDGE_BASE:
          result = await this.checkKnowledgeBasePermission(apiKey, permission, resourceId);
          break;
        case ResourceType.CONNECTOR:
          result = await this.checkConnectorPermission(apiKey, permission, resourceId);
          break;
        case ResourceType.TASK:
          result = await this.checkTaskPermission(apiKey, permission, resourceId);
          break;
        case ResourceType.USER:
          result = await this.checkUserPermission(apiKey, permission, resourceId);
          break;
        case ResourceType.SYSTEM:
          result = await this.checkSystemPermission(apiKey, permission, resourceId);
          break;
        default:
          throw new Error(`Unknown resource type: ${resourceType}`);
      }

      // Cache result
      this.permissionCache.set(cacheKey, result);

      // Add expiration time to cache entry
      setTimeout(() => {
        this.permissionCache.delete(cacheKey);
      }, this.cacheTTL);

      return result;
    } catch (error) {
      logger.error(`Permission check error: ${error.message}`);

      // Return denied permission check result
      return {
        granted: false,
        reason: error.message,
      };
    }
  }

  /**
   * Check if a user has a permission for a workspace
   * @param apiKey API key
   * @param permission Permission to check
   * @param workspaceId Workspace ID
   * @returns Permission check result
   */
  private async checkWorkspacePermission(
    apiKey: string,
    permission: Permission,
    workspaceId: string
  ): Promise<PermissionCheckResult> {
    try {
      // Use the original DustService instance's API key
      // This is a simplification - in a real implementation, we would use the provided API key

      // Get workspace information
      await this.dustService.getWorkspace(workspaceId);

      // If we get here, the user has access to the workspace
      // In a real implementation, we would check the specific permission

      return {
        granted: true,
      };
    } catch (error) {
      logger.error(`Workspace permission check failed: ${error.message}`);

      return {
        granted: false,
        reason:
          error instanceof APIError
            ? error.message
            : `Error checking workspace permission: ${error.message}`,
      };
    }
  }

  /**
   * Check if a user has a permission for an agent
   * @param apiKey API key
   * @param permission Permission to check
   * @param agentId Agent ID
   * @returns Permission check result
   */
  private async checkAgentPermission(
    apiKey: string,
    permission: Permission,
    agentId: string
  ): Promise<PermissionCheckResult> {
    try {
      // Extract workspace ID from agent ID (format: workspace-id/agent-id)
      const parts = agentId.split('/');
      if (parts.length !== 2) {
        throw new Error(`Invalid agent ID format: ${agentId}`);
      }

      const workspaceId = parts[0];
      const agentIdOnly = parts[1];

      // Get agent information
      await this.dustService.getAgent(workspaceId, agentIdOnly);

      // If we get here, the user has access to the agent
      // In a real implementation, we would check the specific permission

      return {
        granted: true,
      };
    } catch (error) {
      logger.error(`Agent permission check failed: ${error.message}`);

      return {
        granted: false,
        reason:
          error instanceof APIError
            ? error.message
            : `Error checking agent permission: ${error.message}`,
      };
    }
  }

  /**
   * Check if a user has a permission for a knowledge base
   * @param apiKey API key
   * @param permission Permission to check
   * @param knowledgeBaseId Knowledge base ID
   * @returns Permission check result
   */
  private async checkKnowledgeBasePermission(
    apiKey: string,
    permission: Permission,
    knowledgeBaseId: string
  ): Promise<PermissionCheckResult> {
    try {
      // Extract workspace ID from knowledge base ID (format: workspace-id/kb-id)
      const parts = knowledgeBaseId.split('/');
      if (parts.length !== 2) {
        throw new Error(`Invalid knowledge base ID format: ${knowledgeBaseId}`);
      }

      const workspaceId = parts[0];
      const kbIdOnly = parts[1];

      // Get knowledge base information
      await this.dustService.getKnowledgeBase(workspaceId, kbIdOnly);

      // If we get here, the user has access to the knowledge base
      // In a real implementation, we would check the specific permission

      return {
        granted: true,
      };
    } catch (error) {
      logger.error(`Knowledge base permission check failed: ${error.message}`);

      return {
        granted: false,
        reason:
          error instanceof APIError
            ? error.message
            : `Error checking knowledge base permission: ${error.message}`,
      };
    }
  }

  /**
   * Check if a user has a permission for a connector
   * @param apiKey API key
   * @param permission Permission to check
   * @param connectorId Connector ID
   * @returns Permission check result
   */
  private async checkConnectorPermission(
    apiKey: string,
    permission: Permission,
    connectorId: string
  ): Promise<PermissionCheckResult> {
    try {
      // Extract workspace ID from connector ID (format: workspace-id/connector-id)
      const parts = connectorId.split('/');
      if (parts.length !== 2) {
        throw new Error(`Invalid connector ID format: ${connectorId}`);
      }

      const workspaceId = parts[0];
      const connectorIdOnly = parts[1];

      // Get connector information
      await this.dustService.getConnector(workspaceId, connectorIdOnly);

      // If we get here, the user has access to the connector
      // In a real implementation, we would check the specific permission

      return {
        granted: true,
      };
    } catch (error) {
      logger.error(`Connector permission check failed: ${error.message}`);

      return {
        granted: false,
        reason:
          error instanceof APIError
            ? error.message
            : `Error checking connector permission: ${error.message}`,
      };
    }
  }

  /**
   * Check if a user has a permission for a task
   * @param apiKey API key
   * @param permission Permission to check
   * @param taskId Task ID
   * @returns Permission check result
   */
  private async checkTaskPermission(
    apiKey: string,
    permission: Permission,
    taskId: string
  ): Promise<PermissionCheckResult> {
    try {
      // For now, we'll just allow all task permissions
      // In a real implementation, we would check the specific permission

      return {
        granted: true,
      };
    } catch (error) {
      logger.error(`Task permission check failed: ${error.message}`);

      return {
        granted: false,
        reason:
          error instanceof APIError
            ? error.message
            : `Error checking task permission: ${error.message}`,
      };
    }
  }

  /**
   * Check if a user has a permission for a user
   * @param apiKey API key
   * @param permission Permission to check
   * @param userId User ID
   * @returns Permission check result
   */
  private async checkUserPermission(
    apiKey: string,
    permission: Permission,
    userId: string
  ): Promise<PermissionCheckResult> {
    try {
      // Get user context if available
      let userContext: UserContext | undefined;
      if (this.userContextService) {
        try {
          userContext = await this.userContextService.getUserContext(apiKey);
        } catch (error) {
          logger.warn(`Error getting user context: ${error.message}`);
        }
      }

      // If user is checking their own permissions, allow it
      if (userContext && userContext.id === userId) {
        return {
          granted: true,
        };
      }

      // Otherwise, deny by default
      // In a real implementation, we would check the specific permission

      return {
        granted: false,
        reason: 'You do not have permission to access this user',
      };
    } catch (error) {
      logger.error(`User permission check failed: ${error.message}`);

      return {
        granted: false,
        reason:
          error instanceof APIError
            ? error.message
            : `Error checking user permission: ${error.message}`,
      };
    }
  }

  /**
   * Check if a user has a permission for the system
   * @param apiKey API key
   * @param permission Permission to check
   * @param systemId System ID
   * @returns Permission check result
   */
  private async checkSystemPermission(
    apiKey: string,
    permission: Permission,
    systemId: string
  ): Promise<PermissionCheckResult> {
    try {
      // For now, we'll deny all system permissions
      // In a real implementation, we would check the specific permission

      return {
        granted: false,
        reason: 'System permissions are not implemented yet',
      };
    } catch (error) {
      logger.error(`System permission check failed: ${error.message}`);

      return {
        granted: false,
        reason:
          error instanceof APIError
            ? error.message
            : `Error checking system permission: ${error.message}`,
      };
    }
  }

  /**
   * Add a permission rule
   * @param rule Permission rule
   * @returns Rule ID
   */
  public addRule(rule: PermissionRule): string {
    // Generate ID if not provided
    if (!rule.id) {
      rule.id = uuidv4();
    }

    // Store rule
    this.permissionRules.set(rule.id, rule);

    // Clear cache to ensure rules are re-evaluated
    this.permissionCache.clear();

    logger.info(`Added permission rule: ${rule.id}`);

    return rule.id;
  }

  /**
   * Get a permission rule by ID
   * @param ruleId Rule ID
   * @returns Permission rule
   */
  public getRule(ruleId: string): PermissionRule | undefined {
    return this.permissionRules.get(ruleId);
  }

  /**
   * Update a permission rule
   * @param ruleId Rule ID
   * @param updates Rule updates
   * @returns Updated rule
   */
  public updateRule(ruleId: string, updates: Partial<PermissionRule>): PermissionRule | undefined {
    // Get existing rule
    const rule = this.permissionRules.get(ruleId);

    if (!rule) {
      return undefined;
    }

    // Update rule
    const updatedRule = { ...rule, ...updates };

    // Store updated rule
    this.permissionRules.set(ruleId, updatedRule);

    // Clear cache to ensure rules are re-evaluated
    this.permissionCache.clear();

    logger.info(`Updated permission rule: ${ruleId}`);

    return updatedRule;
  }

  /**
   * Delete a permission rule
   * @param ruleId Rule ID
   * @returns Whether the rule was deleted
   */
  public deleteRule(ruleId: string): boolean {
    // Delete rule
    const deleted = this.permissionRules.delete(ruleId);

    if (deleted) {
      // Clear cache to ensure rules are re-evaluated
      this.permissionCache.clear();

      logger.info(`Deleted permission rule: ${ruleId}`);
    }

    return deleted;
  }

  /**
   * Get all permission rules
   * @returns Permission rules
   */
  public getAllRules(): PermissionRule[] {
    return Array.from(this.permissionRules.values());
  }

  /**
   * Get permission rules for a resource type
   * @param resourceType Resource type
   * @returns Permission rules
   */
  public getRulesForResourceType(resourceType: ResourceType): PermissionRule[] {
    return Array.from(this.permissionRules.values()).filter(
      rule => rule.resourceType === resourceType
    );
  }

  /**
   * Check if a resource pattern matches a resource ID
   * @param pattern Resource pattern
   * @param resourceId Resource ID
   * @returns Whether the pattern matches the resource ID
   */
  private matchesPattern(pattern: string, resourceId: string): boolean {
    // If pattern is '*', it matches everything
    if (pattern === '*') {
      return true;
    }

    // If pattern ends with '*', it's a prefix match
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return resourceId.startsWith(prefix);
    }

    // Otherwise, it's an exact match
    return pattern === resourceId;
  }

  /**
   * Evaluate permission rules for a resource
   * @param apiKey API key
   * @param permission Permission to check
   * @param resourceType Resource type
   * @param resourceId Resource ID
   * @param context Permission context
   * @returns Permission check result
   */
  private evaluateRules(
    apiKey: string,
    permission: Permission,
    resourceType: ResourceType,
    resourceId: string,
    context?: PermissionContext
  ): PermissionCheckResult {
    // Get rules for this resource type
    const rules = this.getRulesForResourceType(resourceType)
      // Filter rules that match the permission
      .filter(
        rule =>
          rule.permission === permission ||
          rule.permission === (`admin:${permission.split(':')[1]}` as Permission)
      )
      // Filter rules that match the resource ID
      .filter(rule => this.matchesPattern(rule.resourcePattern, resourceId))
      // Sort by priority (higher priority first)
      .sort((a, b) => b.priority - a.priority);

    // If no rules match, deny by default
    if (rules.length === 0) {
      return {
        granted: false,
        reason: 'No matching permission rules',
      };
    }

    // Evaluate rules in order of priority
    for (const rule of rules) {
      // Check conditions if any
      if (rule.conditions && context) {
        // TODO: Implement condition evaluation
        // For now, we'll just assume conditions are met
      }

      // Return result based on rule effect
      return {
        granted: rule.effect === 'allow',
        reason: rule.effect === 'allow' ? 'Allowed by rule' : 'Denied by rule',
        metadata: {
          ruleId: rule.id,
          effect: rule.effect,
          priority: rule.priority,
        },
      };
    }

    // If we get here, deny by default
    return {
      granted: false,
      reason: 'No matching permission rules',
    };
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const count = this.permissionCache.size;
    this.permissionCache.clear();
    logger.debug(`Cleaned up ${count} permission cache entries`);
  }
}
