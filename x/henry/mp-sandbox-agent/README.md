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

## TODO

The "research multi agent" flow I envision:

- Top level is a workflow
- Input is the research goal, a "reasoning effort" (corresponds roughly to number of total tokens and depth), and an "output format" (do you want a research / scientific report, a blog post etc...)
- First step is a "planning agent"
- Planning agent returns a list of sub-goals
- Next step is a "research agent". Agent researches the web to populate a scratchpad artifact. Agent is allowed to stop once the scratchpad is at a certain size (based on reasoning effort).
- Then we run "planning agent" again to maybe update the next set of sub-goals
- We rung the research agents again etc...
- Once there are no more sub-goals, and we have an artifact for every sub-goal, we break out of the loop.
- We run a final workflow step that will create the output in the requested format.
- First step of the final workflow step is to run a "create outline" agent
- Outline agent returns a list of sections.
- Next step is a "create section" agent for each section.
- Create section agent returns a list of sub-sections.
- We run the create section agents in parallel.
- Once all section agents have returned, we run a "write section" agent for each section.

- [agent] Final summery config: disable or configure prompt
- [agent] "Artifacts" support (list of named docs / strings that can be passed to agent.step() that are shown to the agent)
- [agent] ability to pass "canStopExecution" to agent.step(). If true, the agent will have access to the stop execution tool during that step.
- [helpers] add a tokenizer
- [workflow] support for while and for.
- "Extract from page" workflow, that scrapes a page, processes it by 32k tokens chunks, extracts relevant tokens from it and writes the results to a "scratchpad"
- "Planning agent" that takes a research goal, an optional collection of scratchpad "artifacts", an optional list of already completed sub-goals, an option list of upcoming sub-goals and retuns a modified list of upcoming sub-goals.
- "Research agent" that takes a goal, has access to websearch tool + the "Extract from page" workflow as a tool.
- Ability to "persist" agent and workflow states to redis / postgres / filesystem. We want agent steps of workflows, and workflow steps of agents, and workflow steps of workflows to benefit from this, such that simply resuming the top level object (whether it is agent or workflow) resumes the whole execution at the first non-saved step.
