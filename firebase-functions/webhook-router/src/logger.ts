/**
 * Structured logger for Firebase Functions that outputs properly formatted JSON
 * for Cloud Logging and Datadog integration.
 *
 * Each log entry includes:
 * - message: The log message
 * - severity: Log level (DEBUG, INFO, WARNING, ERROR)
 * - Custom fields: Any additional context provided
 * - Stack traces for Error objects
 */

type LogContext = Record<string, unknown>;

type Severity = "DEBUG" | "INFO" | "WARNING" | "ERROR";

interface LogEntry extends LogContext {
  severity: Severity;
  message: string;
  time?: string;
}

/**
 * Serializes an Error object to include message and stack trace
 */
function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }
  return { message: String(error) };
}

/**
 * Processes the context object to handle Error objects properly
 */
function processContext(context: LogContext): LogContext {
  const processed: LogContext = {};

  for (const [key, value] of Object.entries(context)) {
    if (value instanceof Error) {
      processed[key] = serializeError(value);
    } else if (
      value &&
      typeof value === "object" &&
      "message" in value &&
      "stack" in value
    ) {
      // Handle error-like objects
      processed[key] = serializeError(value);
    } else {
      processed[key] = value;
    }
  }

  return processed;
}

/**
 * Core logging function that outputs structured JSON
 *
 * Note: Cloud Logging recognizes certain special fields:
 * - severity: Mapped to LogEntry.severity (levels: DEBUG, INFO, WARNING, ERROR)
 * - message: The log message (stays in jsonPayload.message)
 * - timestamp/time: Can be mapped to LogEntry.timestamp
 *
 * For Datadog integration, you may need to configure a remapper in Datadog's
 * log pipeline to extract jsonPayload.message as the main message field.
 */
function log(severity: Severity, message: string, context: LogContext = {}) {
  const logEntry: LogEntry = {
    severity,
    message,
    ...processContext(context),
    // Use 'time' instead of 'timestamp' for better Cloud Logging integration
    time: new Date().toISOString(),
  };

  const output = JSON.stringify(logEntry);

  // Always use console.log for structured JSON logs
  // Cloud Logging will parse the severity field correctly
  console.log(output);
}

/**
 * Structured logger for Firebase Functions
 */
export const logger = {
  /**
   * Log a debug message with optional context
   */
  debug(message: string, context?: LogContext) {
    log("DEBUG", message, context);
  },

  /**
   * Log an info message with optional context
   */
  info(message: string, context?: LogContext) {
    log("INFO", message, context);
  },

  /**
   * Log a warning message with optional context
   */
  warn(message: string, context?: LogContext) {
    log("WARNING", message, context);
  },

  /**
   * Log an error message with optional context
   */
  error(message: string, context?: LogContext) {
    log("ERROR", message, context);
  },
};
