/**
 * A configurable logging system for the MicroPython Sandbox Agent.
 * Supports different log levels and output formats.
 */
import { AppError, isAppError } from "./errors";

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

export interface LoggerOptions {
  /** Minimum level to log */
  level: LogLevel;
  /** Whether to include timestamps in logs */
  timestamps?: boolean;
  /** Whether to include log level in logs */
  showLevel?: boolean;
  /** Custom output function (defaults to console) */
  outputFn: (message: string, level: LogLevel) => void;
}

export class Logger {
  private options: LoggerOptions;
  
  constructor(options: Partial<LoggerOptions> = {}) {
    this.options = {
      level: options.level ?? LogLevel.INFO,
      timestamps: options.timestamps ?? true,
      showLevel: options.showLevel ?? true,
      outputFn: options.outputFn ?? this.defaultOutputFn,
    };
  }
  
  /**
   * Default output function that logs to the console
   */
  private defaultOutputFn(message: string, level: LogLevel): void {
    switch (level) {
      case LogLevel.ERROR:
        console.error(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.INFO:
      case LogLevel.DEBUG:
      case LogLevel.TRACE:
      default:
        console.log(message);
        break;
    }
  }
  
  /**
   * Format a log message based on configuration
   */
  private formatMessage(level: LogLevel, message: string): string {
    const parts: string[] = [];
    
    if (this.options.timestamps) {
      parts.push(`[${new Date().toISOString()}]`);
    }
    
    if (this.options.showLevel) {
      parts.push(`[${LogLevel[level]}]`);
    }
    
    parts.push(message);
    return parts.join(' ');
  }
  
  /**
   * Log a message if the level is enabled
   * @param level The log level
   * @param message The message to log
   * @param args Values to substitute into the message
   */
  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (level > this.options.level) return;
    
    let formattedMessage = this.formatMessage(level, message);
    
    // Handle additional args by replacing %s, %d, etc.
    if (args.length > 0) {
      formattedMessage = formattedMessage.replace(/%[sdjifoO%]/g, (match): string => {
        if (match === '%%') return '%';
        
        const value = args.shift();
        if (value === undefined) return '';
        
        // Format based on specifier
        switch (match) {
          case '%j':
          case '%o':
          case '%O':
            try {
              return JSON.stringify(value, null, 2);
            } catch (err) {
              return String(value);
            }
          case '%d':
          case '%i':
            return Number(value).toString();
          case '%f':
            return Number(value).toFixed(6);
          case '%s':
          default:
            return String(value);
        }
      });
    }
    
    this.options.outputFn(formattedMessage, level);
  }
  
  /**
   * Log an error message
   * @param message The message to log
   * @param args Values to substitute into the message
   */
  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }
  
  /**
   * Log an error object with full context
   * @param error The error object to log
   * @param message Optional message to display before the error
   */
  logError(error: unknown, message?: string): void {
    if (this.options.level < LogLevel.ERROR) return;
    
    if (isAppError(error)) {
      // Already an AppError with context
      if (message) {
        this.error(message);
      }
      
      // Log the structured error
      const errorObj = error.toJSON();
      this.options.outputFn(
        this.formatMessage(LogLevel.ERROR, `[${errorObj.code}] ${errorObj.message}`),
        LogLevel.ERROR
      );
      
      // Log context if present
      if (errorObj.context && typeof errorObj.context === 'object' && Object.keys(errorObj.context).length > 0) {
        this.options.outputFn(
          this.formatMessage(LogLevel.ERROR, `Context: ${JSON.stringify(errorObj.context, null, 2)}`),
          LogLevel.ERROR
        );
      }
      
      // Log stack trace at debug level
      if (errorObj.stack && this.options.level >= LogLevel.DEBUG) {
        this.options.outputFn(
          this.formatMessage(LogLevel.DEBUG, `Stack: ${errorObj.stack}`),
          LogLevel.DEBUG
        );
      }
      
      // Log cause if present
      if (errorObj.cause) {
        this.options.outputFn(
          this.formatMessage(LogLevel.ERROR, `Caused by: ${JSON.stringify(errorObj.cause, null, 2)}`),
          LogLevel.ERROR
        );
      }
    } else if (error instanceof Error) {
      // Standard Error object
      this.error(message || error.message);
      if (this.options.level >= LogLevel.DEBUG && error.stack) {
        this.debug(`Stack: ${error.stack}`);
      }
    } else {
      // Unknown error type
      this.error(message || 'Unknown error occurred');
      this.debug(`Error details: ${JSON.stringify(error, null, 2)}`);
    }
  }
  
  /**
   * Log a warning message
   * @param message The message to log
   * @param args Values to substitute into the message
   */
  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }
  
  /**
   * Log an info message
   * @param message The message to log
   * @param args Values to substitute into the message
   */
  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }
  
  /**
   * Log a debug message
   * @param message The message to log
   * @param args Values to substitute into the message
   */
  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }
  
  /**
   * Log a trace message (most verbose)
   * @param message The message to log
   * @param args Values to substitute into the message
   */
  trace(message: string, ...args: unknown[]): void {
    this.log(LogLevel.TRACE, message, ...args);
  }
  
  /**
   * Create a separator line for visual grouping in logs
   */
  separator(): void {
    this.info("--------------------------------");
  }
  
  /**
   * Change the log level
   */
  setLevel(level: LogLevel): void {
    this.options.level = level;
  }
  
  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.options.level;
  }
  
  /**
   * Enable or disable timestamps
   */
  setTimestamps(enabled: boolean): void {
    this.options.timestamps = enabled;
  }
  
  /**
   * Enable or disable showing log level
   */
  setShowLevel(enabled: boolean): void {
    this.options.showLevel = enabled;
  }
}

// Create a default logger instance for easy imports
export const logger = new Logger();