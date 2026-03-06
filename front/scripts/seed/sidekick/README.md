# Copilot Seed

Seeds data for testing the agent builder copilot feature. Enables the `agent_builder_copilot` feature flag and creates:

- 2 additional users (John Doe and Amigo)
- 3 agents:
  - **TechNewsDigest** - A deliberately basic agent with no tools that summarizes tech news. The prompt is intentionally limited to demonstrate the need for web search capabilities. This agents have a few conversations with feedback
  - **SharedDocumentationWriter** - A documentation helper agent with the main user and both additional users as editors. This agent has multiple editors
  - **MeteoWithSuggestions** - A weather forecast agent with no tools, used to demonstrate agent suggestions. This agent has existing conversations and suggestions.

## How to use

Run:

```bash
npx tsx scripts/seed/copilot/seed.ts --execute
```
