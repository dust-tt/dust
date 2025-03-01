# MicroPython Sandbox Agent

## Overview

MicroPython Sandbox Agent is a secure, code-first AI agent framework that uses executable Python code instead of traditional JSON-based tool calls. The agent is inspired by the CodeAct approach (Wang et al., 2024) and runs generated Python code in a MicroPython WebAssembly sandbox, providing strong security guarantees while maintaining expressiveness and flexibility.

## Key Features

### 1. Code Generation Over Tool Calls
- **Code-First Approach**: Instead of using JSON-formatted tool calls, the agent generates executable Python code.
- **Enhanced Expressiveness**: Python code provides greater flexibility and expressiveness for handling complex tasks.
- **Iterative Reasoning**: The agent can analyze outputs, plan next steps, and generate new code in an iterative process.

### 2. Secure Execution Environment
- **MicroPython WebAssembly Sandbox**: All generated Python code runs in a MicroPython environment compiled to WebAssembly.
- **Strong Sandboxing**: Provides isolation and protection from potentially harmful code execution.
- **Controlled Access**: Only explicitly exposed functions are available to the executed code.

### 3. Type-Safe Tool Definitions
- **Zod Schema Validation**: Input and output validation using Zod schemas ensures type safety.
- **Clear Tool Documentation**: Automatically generates documentation for available tools.
- **Error Handling**: Robust error handling for tool execution with clear error messages.

## Core Components

### 1. Agent Class

The `Agent` class is the primary interface for creating and managing AI agents:

```typescript
// Creating an agent
const agent = await Agent.create("Research the weather in Paris");

// Run agent steps with provided tools
const answer = await agent.step({
  fetch_weather: fetchWeather,
  search_web: searchWeb,
  // other tools...
});
```

Key methods:
- `create(goal: string)`: Creates a new agent with a specified goal
- `step(tools: Record<string, Tool>)`: Runs one step of the agent with provided tools
- `getSteps()`: Returns the agent's step history

### 2. PythonSandbox Class

The `PythonSandbox` class provides a secure execution environment for Python code:

```typescript
// Create a sandbox instance
const sandbox = await PythonSandbox.create();

// Expose a function to the sandbox
sandbox.expose("fetch_data", myToolDefinition);

// Run Python code in the sandbox
const result = await sandbox.runCode("data = await fetch_data({'url': 'example.com'})");
```

Key methods:
- `create()`: Creates a new sandbox instance
- `expose(name: string, func: ExposedFunction)`: Exposes a function to the sandbox
- `runCode(code: string)`: Executes Python code in the sandbox

### 3. Tool Definition System

Tools are defined using a type-safe API:

```typescript
const fetchWeather = defineTool(
  "Fetch weather data for a location",
  z.object({ location: z.string() }),
  z.object({ temperature: z.number(), conditions: z.string() }),
  async (input, { log }) => {
    // Implementation...
    return ok({ temperature: 22, conditions: "Sunny" });
  }
);
```

Each tool includes:
- Description: Clear documentation of the tool's purpose
- Input schema: Zod schema defining expected input parameters
- Output schema: Zod schema defining the return value structure
- Implementation function: Async function that performs the actual work


## Built-in Tools

### 1. Web Search
The `search_web` tool provides web search capabilities:

```python
results = await search_web({"query": "latest news about AI"})
```

### 2. Web Scraping
The `scrape_pages` tool extracts content from web pages:

```python
content = await scrape_pages({"urls": ["https://example.com"]})
```

### 3. Weather Information
The `fetch_weather` tool retrieves weather data:

```python
weather = await fetch_weather({"location": "New York"})
```

## Utility Components

### Logging System

The `Logger` class in `utils/logger.ts` provides a configurable logging system:

```typescript
import { logger, LogLevel } from "./utils/logger";

// Set log level (ERROR, WARN, INFO, DEBUG, TRACE)
logger.setLevel(LogLevel.DEBUG);

// Basic logging
logger.info("This is an informational message");
logger.error("An error occurred: %s", errorMessage);
logger.debug("Debug data: %o", debugObject);

// Configure logger options
logger.setTimestamps(false); // Disable timestamps in log output
logger.setShowLevel(false);  // Hide log level in output

// Create a custom logger instance
const customLogger = new Logger({
  level: LogLevel.WARN,
  timestamps: true,
  showLevel: true,
  outputFn: (message, level) => {
    // Custom output function
    myLoggingService.log(message, level);
  }
});
```

This logging system replaces direct `console.log` calls and provides:

- Multiple severity levels (ERROR, WARN, INFO, DEBUG, TRACE)
- Configurable formatting (timestamps, level indicators)
- Support for string interpolation with %s, %d, %o, etc.
- Customizable output destinations through outputFn
- Runtime configuration

## Usage Examples

### Basic Usage
```typescript
import { Agent } from "./agent";
import { fetchWeather, searchWeb, scrapePages } from "./tools";

async function main() {
  // Get the query from command line arguments
  const request = process.argv[2];
  if (!request) {
    console.error("Please provide a request as a command line argument");
    process.exit(1);
  }
  
  // Create an agent with the query
  const agent = await Agent.create(request);
  
  // Define available tools
  const tools = {
    fetch_weather: fetchWeather,
    search_web: searchWeb,
    scrape_pages: scrapePages,
  };
  
  // Run the agent until it has an answer
  let answer = null;
  while (answer === null) {
    answer = await agent.step(tools);
  }
  
  // Display the final answer
  console.log("\nFinal answer:");
  console.log(answer);
}

main().catch(error => {
  console.error("Error:", error);
  process.exit(1);
});
```

### Using Custom Tools
```typescript
import { Agent } from "./agent";
import { defineTool } from "./tools/helpers";
import { z } from "zod";
import { ok } from "./tools/types";

// Define a custom tool
const calculator = defineTool(
  "Performs basic arithmetic operations",
  z.object({ 
    operation: z.enum(["add", "subtract", "multiply", "divide"]), 
    a: z.number(), 
    b: z.number() 
  }),
  z.object({ result: z.number() }),
  async (input, { log }) => {
    const { operation, a, b } = input;
    let result;
    
    switch (operation) {
      case "add": result = a + b; break;
      case "subtract": result = a - b; break;
      case "multiply": result = a * b; break;
      case "divide": 
        if (b === 0) return { type: "error", error: "Division by zero" };
        result = a / b; 
        break;
    }
    
    log(`Calculated ${operation}: ${a} ${operation} ${b} = ${result}`);
    return ok({ result });
  }
);

async function runCalculatorAgent() {
  const agent = await Agent.create("Calculate the result of complex math expressions");
  
  const tools = { calculator };
  
  let answer = null;
  while (answer === null) {
    answer = await agent.step(tools);
  }
  
  console.log("Result:", answer);
}
```

## Future Vision

Based on the TODO section in the README, the project aims to enhance the agent's capabilities:

1. **Enhanced Agent Capabilities**:
   - Support for "artifacts" (named documents that can be passed to the agent)
   - Ability to control when the agent can stop execution
   - Improved reasoning and token management

2. **Research and Content Generation**:
   - Web search and information extraction
   - Content processing tools for large documents
   - Advanced scraping capabilities

3. **Technical Enhancements**:
   - Persistent state storage (Redis/PostgreSQL/filesystem)
   - Improved error handling and recovery

This vision positions the package as a powerful tool for generating, executing, and reasoning with Python code to solve complex tasks while maintaining a secure execution environment.

## Improvement Suggestions

The following improvements would enhance the codebase's architecture, security, and maintainability:

1. **Architectural Improvements**:
   - Reduce coupling between the Agent and PythonSandbox classes
   - Split the Agent class into smaller components with single responsibilities
   - Define clear interfaces for key components to improve testability
   - Make model selection configurable rather than hardcoded

2. **Code Quality**:
   - ✅ Replace `any` types with proper TypeScript definitions
   - ✅ Implement consistent error handling with proper context information
   - ✅ Replace direct console.log statements with a configurable logging system
   - Add proper validation and defaults for environment variables

3. **Security Enhancements**:
   - Implement input validation for all external inputs (URLs, API parameters)
   - Add resource limits to the sandbox (memory, execution time)
   - Improve handling of API keys and sensitive information
   - Implement proper security boundaries for the sandbox

4. **Testing and Documentation**:
   - Expand test coverage, especially for integration scenarios
   - Add end-to-end tests for complete system behavior
   - Improve JSDoc comments for all public APIs
   - Add architectural documentation with component diagrams

These improvements would significantly enhance the codebase's maintainability, security, and extensibility without changing its core concepts.

## Implementation Progress

### ✅ Configurable Logging System (Completed)

A configurable logging system has been implemented in `utils/logger.ts` to replace direct console.log statements. This system provides:

- Different log levels (ERROR, WARN, INFO, DEBUG, TRACE)
- Environment variable configuration (LOG_LEVEL)
- Formatted output with timestamps and level indicators
- String interpolation for cleaner log messages
- Customizable output functions

Usage example:

```typescript
import { logger, LogLevel } from "./utils/logger";

// Set log level
logger.setLevel(LogLevel.DEBUG);

// Log messages at different levels
logger.error("Critical error: %s", errorMessage);
logger.warn("Warning: The operation may be slow");
logger.info("Processing file: %s", filename);
logger.debug("Request payload: %o", payload);

// Configure output format
logger.setTimestamps(false); // Disable timestamps
logger.setShowLevel(false);  // Hide log level
```

The Agent and main.ts files have been updated to use this logging system, providing better control over verbosity and output format.

### ✅ Consistent Error Handling (Completed)

A comprehensive error handling system has been implemented in `utils/errors.ts` to provide consistent error handling with proper context information. The system includes:

- **Custom Error Classes**: A hierarchy of error classes for different types of errors, each with specific context fields.
- **Context Information**: All errors can have context information attached to provide details for debugging.
- **Error Wrapping**: Utility functions to wrap unknown errors in structured format.
- **Integration with Logger**: Special error logging methods that display context information.

Key error classes:
- `AppError`: Base error class with context support
- `ValidationError`: For input validation failures
- `ConfigurationError`: For configuration and environment issues
- `APIError`: For issues with external API calls
- `SandboxError`: For Python code execution failures
- `ToolError`: For errors in tool execution

Usage example:

```typescript
import { ValidationError, APIError, wrapError } from "./utils/errors";
import { logger } from "./utils/logger";

// Create an error with context
const validationError = new ValidationError("Invalid city name")
  .addContext({
    providedValue: city,
    expectedFormat: "non-empty string"
  });

// Log the error with full context
logger.logError(validationError);

// Wrap an unknown error
try {
  await someOperation();
} catch (error) {
  const wrappedError = wrapError(error, "Operation failed");
  wrappedError.addContext({
    operation: "someOperation",
    input: JSON.stringify(input)
  });
  logger.logError(wrappedError);
}
```

This error handling system is now integrated throughout the codebase, including:
- Sandbox code execution
- Tool implementations (especially API calls)
- Agent steps and API interactions
- Configuration validation

### ✅ Type-Safe Code with Proper TypeScript Definitions (Completed)

The codebase has been updated to use proper TypeScript definitions, eliminating `any` types and providing better type safety. The improvements include:

- **Generic Type Parameters**: Tools and functions now use generic type parameters for better type checking.
- **Defined Interfaces**: Well-defined interfaces for key data structures and APIs.
- **JSON Value Type**: A proper type for JSON values that can be passed between JavaScript and Python.
- **Type Guards**: Added type guards to ensure type safety when dealing with unknown data.
- **Type-Safe API Design**: Redesigned APIs to use proper TypeScript features.

Key type definitions:

```typescript
// JSON value type for Python/JavaScript interop
export type JsonValue = 
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// Type-safe tool definition
export interface Tool<TInput = unknown, TOutput = unknown> {
  fn: (input: TInput, context: ToolContext) => Promise<ToolOutput<TOutput>>;
  input: z.ZodType<TInput>;
  output: z.ZodType<TOutput>;
  description: string;
}

// Type-safe sandbox function exposure
export interface ExposedFunction<TInput = unknown, TOutput = unknown> {
  fn: (input: TInput) => Promise<TOutput>;
  input: z.ZodType<TInput>;
  output: z.ZodType<TOutput>;
  description: string;
}
```

These changes improve:
- Compile-time type checking
- Code editor autocompletion and IntelliSense
- Refactoring safety
- Documentation through types
- Developer experience

## Installation

1. Clone the repository
2. Install dependencies:
```bash
bun install
```
3. Create a `.env` file with your OpenAI API key:
```
OPENAI_API_KEY=your_api_key_here
```

## Development

To run tests:
```bash
bun test
```