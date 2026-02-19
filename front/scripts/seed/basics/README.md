# Basics Seed

Activates some feature flags and creates the following:

- 1 skill (Poem Writer) and 3 suggested skills
- 1 custom agent (HaikuPoet) with the Poem Writer skill linked
- 5 conversations (3 with custom agent, 2 with Dust global agent)
- 1 restricted space (with the user added as member)
- 2 MCP tools:
  - Global Fake MCP Tool (available in global space)
  - Restricted Fake MCP Tool (only available in restricted space)

Uses data from `assets/` folder.

## Setup

You can setup your own feature flags by creating your own config.json file.

## How to use ?

Run

```
npx tsx scripts/seed/basics/seed.ts --execute
```
