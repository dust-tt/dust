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