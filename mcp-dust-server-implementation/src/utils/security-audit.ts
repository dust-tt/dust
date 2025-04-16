// src/utils/security-audit.ts
import { Request } from 'express';
import { logger } from './logger';

/**
 * Security event types
 */
export enum SecurityEventType {
  AUTHENTICATION_SUCCESS = 'authentication_success',
  AUTHENTICATION_FAILURE = 'authentication_failure',
  AUTHORIZATION_FAILURE = 'authorization_failure',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  INVALID_INPUT = 'invalid_input',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  SESSION_CREATED = 'session_created',
  SESSION_EXPIRED = 'session_expired',
  SESSION_INVALIDATED = 'session_invalidated',
  PASSWORD_CHANGED = 'password_changed',
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_UNLOCKED = 'account_unlocked',
  API_KEY_CREATED = 'api_key_created',
  API_KEY_REVOKED = 'api_key_revoked',
  PERMISSION_GRANTED = 'permission_granted',
  PERMISSION_REVOKED = 'permission_revoked',
  RESOURCE_ACCESSED = 'resource_accessed',
  RESOURCE_MODIFIED = 'resource_modified',
  RESOURCE_DELETED = 'resource_deleted',
  CONFIGURATION_CHANGED = 'configuration_changed',
}

/**
 * Security event severity
 */
export enum SecurityEventSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Security event data
 */
export interface SecurityEventData {
  /**
   * Event type
   */
  type: SecurityEventType;
  
  /**
   * Event severity
   */
  severity: SecurityEventSeverity;
  
  /**
   * Event message
   */
  message: string;
  
  /**
   * User ID
   */
  userId?: string;
  
  /**
   * Username
   */
  username?: string;
  
  /**
   * Session ID
   */
  sessionId?: string;
  
  /**
   * IP address
   */
  ipAddress?: string;
  
  /**
   * User agent
   */
  userAgent?: string;
  
  /**
   * Request path
   */
  path?: string;
  
  /**
   * Request method
   */
  method?: string;
  
  /**
   * Resource ID
   */
  resourceId?: string;
  
  /**
   * Resource type
   */
  resourceType?: string;
  
  /**
   * Action performed
   */
  action?: string;
  
  /**
   * Result of the action
   */
  result?: string;
  
  /**
   * Additional data
   */
  data?: Record<string, any>;
}

/**
 * Security audit utility
 */
export class SecurityAudit {
  /**
   * Log a security event
   * @param event Security event data
   */
  public static logEvent(event: SecurityEventData): void {
    // Determine log level based on severity
    switch (event.severity) {
      case SecurityEventSeverity.INFO:
        logger.info(`SECURITY: ${event.message}`, { securityEvent: event });
        break;
      case SecurityEventSeverity.LOW:
        logger.info(`SECURITY: ${event.message}`, { securityEvent: event });
        break;
      case SecurityEventSeverity.MEDIUM:
        logger.warn(`SECURITY: ${event.message}`, { securityEvent: event });
        break;
      case SecurityEventSeverity.HIGH:
        logger.error(`SECURITY: ${event.message}`, { securityEvent: event });
        break;
      case SecurityEventSeverity.CRITICAL:
        logger.fatal(`SECURITY: ${event.message}`, { securityEvent: event });
        break;
      default:
        logger.info(`SECURITY: ${event.message}`, { securityEvent: event });
    }
  }
  
  /**
   * Log authentication success
   * @param req Request
   * @param userId User ID
   * @param username Username
   */
  public static logAuthenticationSuccess(req: Request, userId: string, username: string): void {
    this.logEvent({
      type: SecurityEventType.AUTHENTICATION_SUCCESS,
      severity: SecurityEventSeverity.INFO,
      message: `Authentication successful for user ${username}`,
      userId,
      username,
      sessionId: req.session?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      path: req.path,
      method: req.method,
    });
  }
  
  /**
   * Log authentication failure
   * @param req Request
   * @param username Username
   * @param reason Failure reason
   */
  public static logAuthenticationFailure(req: Request, username: string, reason: string): void {
    this.logEvent({
      type: SecurityEventType.AUTHENTICATION_FAILURE,
      severity: SecurityEventSeverity.MEDIUM,
      message: `Authentication failed for user ${username}: ${reason}`,
      username,
      sessionId: req.session?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      path: req.path,
      method: req.method,
      data: { reason },
    });
  }
  
  /**
   * Log authorization failure
   * @param req Request
   * @param userId User ID
   * @param username Username
   * @param resourceType Resource type
   * @param resourceId Resource ID
   * @param action Action
   */
  public static logAuthorizationFailure(
    req: Request,
    userId: string,
    username: string,
    resourceType: string,
    resourceId: string,
    action: string
  ): void {
    this.logEvent({
      type: SecurityEventType.AUTHORIZATION_FAILURE,
      severity: SecurityEventSeverity.MEDIUM,
      message: `Authorization failed for user ${username} on ${resourceType} ${resourceId} for action ${action}`,
      userId,
      username,
      sessionId: req.session?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      path: req.path,
      method: req.method,
      resourceType,
      resourceId,
      action,
    });
  }
  
  /**
   * Log rate limit exceeded
   * @param req Request
   * @param limit Rate limit
   */
  public static logRateLimitExceeded(req: Request, limit: number): void {
    this.logEvent({
      type: SecurityEventType.RATE_LIMIT_EXCEEDED,
      severity: SecurityEventSeverity.MEDIUM,
      message: `Rate limit exceeded (${limit} requests)`,
      userId: req.user?.id,
      username: req.user?.username,
      sessionId: req.session?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      path: req.path,
      method: req.method,
      data: { limit },
    });
  }
  
  /**
   * Log invalid input
   * @param req Request
   * @param field Field name
   * @param value Field value
   * @param reason Validation reason
   */
  public static logInvalidInput(req: Request, field: string, value: string, reason: string): void {
    this.logEvent({
      type: SecurityEventType.INVALID_INPUT,
      severity: SecurityEventSeverity.LOW,
      message: `Invalid input for field ${field}: ${reason}`,
      userId: req.user?.id,
      username: req.user?.username,
      sessionId: req.session?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      path: req.path,
      method: req.method,
      data: { field, value: value.substring(0, 100), reason },
    });
  }
  
  /**
   * Log suspicious activity
   * @param req Request
   * @param activity Activity description
   * @param severity Activity severity
   */
  public static logSuspiciousActivity(
    req: Request,
    activity: string,
    severity: SecurityEventSeverity = SecurityEventSeverity.MEDIUM
  ): void {
    this.logEvent({
      type: SecurityEventType.SUSPICIOUS_ACTIVITY,
      severity,
      message: `Suspicious activity detected: ${activity}`,
      userId: req.user?.id,
      username: req.user?.username,
      sessionId: req.session?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      path: req.path,
      method: req.method,
      data: { activity },
    });
  }
  
  /**
   * Log session created
   * @param req Request
   */
  public static logSessionCreated(req: Request): void {
    this.logEvent({
      type: SecurityEventType.SESSION_CREATED,
      severity: SecurityEventSeverity.INFO,
      message: `Session created`,
      userId: req.user?.id,
      username: req.user?.username,
      sessionId: req.session?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });
  }
  
  /**
   * Log session expired
   * @param sessionId Session ID
   * @param userId User ID
   * @param username Username
   */
  public static logSessionExpired(sessionId: string, userId?: string, username?: string): void {
    this.logEvent({
      type: SecurityEventType.SESSION_EXPIRED,
      severity: SecurityEventSeverity.INFO,
      message: `Session expired`,
      userId,
      username,
      sessionId,
    });
  }
  
  /**
   * Log session invalidated
   * @param req Request
   * @param reason Invalidation reason
   */
  public static logSessionInvalidated(req: Request, reason: string): void {
    this.logEvent({
      type: SecurityEventType.SESSION_INVALIDATED,
      severity: SecurityEventSeverity.INFO,
      message: `Session invalidated: ${reason}`,
      userId: req.user?.id,
      username: req.user?.username,
      sessionId: req.session?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      data: { reason },
    });
  }
  
  /**
   * Log resource accessed
   * @param req Request
   * @param resourceType Resource type
   * @param resourceId Resource ID
   */
  public static logResourceAccessed(req: Request, resourceType: string, resourceId: string): void {
    this.logEvent({
      type: SecurityEventType.RESOURCE_ACCESSED,
      severity: SecurityEventSeverity.INFO,
      message: `Resource accessed: ${resourceType} ${resourceId}`,
      userId: req.user?.id,
      username: req.user?.username,
      sessionId: req.session?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      path: req.path,
      method: req.method,
      resourceType,
      resourceId,
    });
  }
  
  /**
   * Log resource modified
   * @param req Request
   * @param resourceType Resource type
   * @param resourceId Resource ID
   * @param changes Changes made
   */
  public static logResourceModified(
    req: Request,
    resourceType: string,
    resourceId: string,
    changes: Record<string, any>
  ): void {
    this.logEvent({
      type: SecurityEventType.RESOURCE_MODIFIED,
      severity: SecurityEventSeverity.INFO,
      message: `Resource modified: ${resourceType} ${resourceId}`,
      userId: req.user?.id,
      username: req.user?.username,
      sessionId: req.session?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      path: req.path,
      method: req.method,
      resourceType,
      resourceId,
      data: { changes },
    });
  }
  
  /**
   * Log resource deleted
   * @param req Request
   * @param resourceType Resource type
   * @param resourceId Resource ID
   */
  public static logResourceDeleted(req: Request, resourceType: string, resourceId: string): void {
    this.logEvent({
      type: SecurityEventType.RESOURCE_DELETED,
      severity: SecurityEventSeverity.INFO,
      message: `Resource deleted: ${resourceType} ${resourceId}`,
      userId: req.user?.id,
      username: req.user?.username,
      sessionId: req.session?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      path: req.path,
      method: req.method,
      resourceType,
      resourceId,
    });
  }
}
