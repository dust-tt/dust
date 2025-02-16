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

## Development

To run tests:

```bash
bun test
```
