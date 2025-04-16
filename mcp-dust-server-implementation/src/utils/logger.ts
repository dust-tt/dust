import pino from 'pino';
import { config } from '../config';
import { randomUUID } from 'crypto';

// Configure logger based on environment
const loggerConfig = {
  level: config.logging.level,
  formatters: {
    level: (label: string) => {
      return { level: label };
    },
    bindings: () => {
      return { pid: process.pid, host: process.env.HOSTNAME || 'unknown' };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Create base logger instance
const baseLogger =
  config.logging.format === 'pretty'
    ? pino({
        ...loggerConfig,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      })
    : pino(loggerConfig);

/**
 * Request context for logging
 */
export interface RequestContext {
  requestId: string;
  sessionId?: string;
  userId?: string;
  workspaceId?: string;
  path?: string;
  method?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Logger class with context support
 */
export class Logger {
  private baseLogger: pino.Logger;
  private context?: RequestContext;

  /**
   * Create a new Logger
   * @param baseLogger Base logger instance
   * @param context Request context
   */
  constructor(baseLogger: pino.Logger, context?: RequestContext) {
    this.baseLogger = baseLogger;
    this.context = context;
  }

  /**
   * Create a child logger with additional context
   * @param context Additional context
   * @returns Child logger
   */
  public child(context: Partial<RequestContext>): Logger {
    return new Logger(this.baseLogger, {
      ...this.context,
      ...context,
    } as RequestContext);
  }

  /**
   * Create a request logger with request context
   * @param req Express request
   * @returns Request logger
   */
  public createRequestLogger(req: any): Logger {
    const requestId = req.headers['x-request-id'] || randomUUID();
    const sessionId = req.session?.id;
    const userId = req.user?.id;
    const workspaceId = req.params?.workspaceId;

    return this.child({
      requestId,
      sessionId,
      userId,
      workspaceId,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  /**
   * Log a trace message
   * @param msg Message
   * @param obj Additional data
   */
  public trace(msg: string, obj?: object): void {
    this.baseLogger.trace({ ...this.context, ...obj }, msg);
  }

  /**
   * Log a debug message
   * @param msg Message
   * @param obj Additional data
   */
  public debug(msg: string, obj?: object): void {
    this.baseLogger.debug({ ...this.context, ...obj }, msg);
  }

  /**
   * Log an info message
   * @param msg Message
   * @param obj Additional data
   */
  public info(msg: string, obj?: object): void {
    this.baseLogger.info({ ...this.context, ...obj }, msg);
  }

  /**
   * Log a warning message
   * @param msg Message
   * @param obj Additional data
   */
  public warn(msg: string, obj?: object): void {
    this.baseLogger.warn({ ...this.context, ...obj }, msg);
  }

  /**
   * Log an error message
   * @param msg Message
   * @param obj Additional data
   */
  public error(msg: string, obj?: object): void {
    this.baseLogger.error({ ...this.context, ...obj }, msg);
  }

  /**
   * Log a fatal message
   * @param msg Message
   * @param obj Additional data
   */
  public fatal(msg: string, obj?: object): void {
    this.baseLogger.fatal({ ...this.context, ...obj }, msg);
  }
}

// Create logger instance
export const logger = new Logger(baseLogger);

export default logger;
