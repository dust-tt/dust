# MicroPython Sandbox Agent

An AI agent that generates and executes Python code, inspired by [CodeAct (Wang et al., 2024)](https://huggingface.co/papers/2402.01030). Instead of using traditional JSON-based tool calls, the agent generates executable Python code that is run in a secure MicroPython WebAssembly sandbox.

## Key Concepts

- **Code Generation Over Tool Calls**: Following CodeAct's approach, the agent generates executable Python code rather than using traditional JSON-formatted tool calls. This provides more flexibility and expressiveness in handling complex tasks.
- **Secure Execution**: Generated Python code runs in a MicroPython environment compiled to WebAssembly, providing strong sandboxing guarantees.
- **TypeScript Tools**: Core functionalities are exposed as TypeScript functions with full type safety, which the generated Python code can access.

## Installation

1. Clone the repository
2. Install dependencies:

```bash
bun install
```

3. Create a `.env` file in the root directory with your OpenAI API key:

```
OPENAI_API_KEY=your_api_key_here
```

## Usage

Run the agent with a query:

```bash
bun start "What's the weather in Paris?"
```

Or programmatically:

```typescript
import { Agent } from "./agent";
import { fetchWeather, searchWeb } from "./tools";

async function main() {
  const agent = await Agent.create("What's the weather in Paris?");
  
  const tools = {
    fetch_weather: fetchWeather,
    search_web: searchWeb,
  };
  
  let answer = null;
  while (answer === null) {
    answer = await agent.step(tools);
  }
  
  console.log("Final answer:", answer);
}
```

## Development

To run tests:

```bash
bun test
```

For more detailed documentation, see [DOCUMENTATION.md](./DOCUMENTATION.md)

## TODO

Future enhancements to consider:

- [agent] Final summary config: disable or configure prompt
- [agent] "Artifacts" support (list of named docs/strings that can be passed to agent.step() that are shown to the agent)
- [agent] Ability to pass "canStopExecution" to agent.step() - if true, the agent will have access to the stop execution tool during that step
- [helpers] Add a tokenizer for better token management
- Create an "Extract from page" tool that scrapes a page, processes it by 32k token chunks, and extracts relevant information
- Implement a more robust web search and content processing system
- Add ability to persist agent state to redis/postgres/filesystem for better recovery and continuation of long-running tasks
