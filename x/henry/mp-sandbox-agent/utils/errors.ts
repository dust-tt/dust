/**
 * Custom error classes and error handling utilities for the MicroPython Sandbox Agent.
 * Provides consistent error handling with proper context information.
 */

/**
 * Base error class for the application
 * Contains context information to help with debugging
 */
export class AppError extends Error {
  /** Error code for categorizing errors */
  public code: string;
  
  /** Additional context about the error */
  public context: Record<string, unknown>;
  
  /** Original cause of the error, if it was wrapped */
  public cause?: Error;
  
  /** Whether the error has been handled */
  public handled: boolean = false;
  
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = 'APP_ERROR';
    this.context = {};
    
    // Capture the stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
    
    // Extract cause if provided
    if (options?.cause instanceof Error) {
      this.cause = options.cause;
    }
  }
  
  /**
   * Add additional context to the error
   */
  addContext(context: Record<string, unknown>): this {
    this.context = { ...this.context, ...context };
    return this;
  }
  
  /**
   * Mark the error as handled to prevent duplicate logging
   */
  markHandled(): this {
    this.handled = true;
    return this;
  }
  
  /**
   * Get a structured representation of the error for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: this.stack,
      cause: this.cause ? (
        this.cause instanceof AppError 
          ? this.cause.toJSON() 
          : {
              name: this.cause.name,
              message: this.cause.message,
              stack: this.cause.stack
            }
      ) : undefined
    };
  }
}

/**
 * Error class for validation errors
 */
export class ValidationError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = 'VALIDATION_ERROR';
  }
}

/**
 * Error class for configuration errors
 */
export class ConfigurationError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = 'CONFIG_ERROR';
  }
}

/**
 * Error class for external API errors
 */
export class APIError extends AppError {
  public statusCode?: number;
  
  constructor(message: string, statusCode?: number, options?: ErrorOptions) {
    super(message, options);
    this.code = 'API_ERROR';
    this.statusCode = statusCode;
  }
  
  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      statusCode: this.statusCode
    };
  }
}

/**
 * Error class for sandbox execution errors
 */
export class SandboxError extends AppError {
  public stdout: string;
  public stderr: string;
  
  constructor(message: string, stdout: string = '', stderr: string = '', options?: ErrorOptions) {
    super(message, options);
    this.code = 'SANDBOX_ERROR';
    this.stdout = stdout;
    this.stderr = stderr;
  }
  
  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      stdout: this.stdout,
      stderr: this.stderr
    };
  }
}

/**
 * Error class for tool execution errors
 */
export class ToolError extends AppError {
  public toolName: string;
  
  constructor(toolName: string, message: string, options?: ErrorOptions) {
    super(`Error in tool '${toolName}': ${message}`, options);
    this.code = 'TOOL_ERROR';
    this.toolName = toolName;
  }
  
  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      toolName: this.toolName
    };
  }
}

/**
 * Wraps an unknown error in an AppError for consistent handling
 */
export function wrapError(error: unknown, defaultMessage = 'An unexpected error occurred'): AppError {
  if (error instanceof AppError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new AppError(error.message, { cause: error });
  }
  
  if (typeof error === 'string') {
    return new AppError(error);
  }
  
  return new AppError(defaultMessage).addContext({ originalError: error });
}

/**
 * Creates a validation error with the provided field information
 */
export function createValidationError(
  message: string, 
  fieldName: string, 
  value?: unknown
): ValidationError {
  return new ValidationError(message).addContext({
    field: fieldName,
    invalidValue: value
  });
}

/**
 * Creates a configuration error with the provided config information
 */
export function createConfigError(
  message: string,
  configKey: string,
  expectedValue?: string
): ConfigurationError {
  return new ConfigurationError(message).addContext({
    configKey,
    expectedValue
  });
}

/**
 * Type guard to check if an error is an instance of AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}