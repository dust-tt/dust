/**
 * A configurable logging system for the MicroPython Sandbox Agent.
 * Supports different log levels and output formats.
 */

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
  outputFn?: (message: string, level: LogLevel) => void;
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
   */
  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (level > this.options.level) return;
    
    let formattedMessage = this.formatMessage(level, message);
    
    // Handle additional args by replacing %s, %d, etc.
    if (args.length > 0) {
      formattedMessage = formattedMessage.replace(/%[sdjifoO%]/g, (match) => {
        if (match === '%%') return '%';
        return String(args.shift() ?? '');
      });
    }
    
    this.options.outputFn(formattedMessage, level);
  }
  
  /**
   * Log an error message
   */
  error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }
  
  /**
   * Log a warning message
   */
  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }
  
  /**
   * Log an info message
   */
  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }
  
  /**
   * Log a debug message
   */
  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }
  
  /**
   * Log a trace message (most verbose)
   */
  trace(message: string, ...args: any[]): void {
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