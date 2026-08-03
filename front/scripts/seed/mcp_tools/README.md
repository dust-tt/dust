# MCP Tools Seed

Creates one shared data source and a small set of agents configured with
internal MCP tools. This is meant for local testing of server-injected tool
inputs such as data sources, time frames, and JSON schemas.

## Created Fixtures

- Data source: `MCP Tools Seed CRM`
- Agent: `MCPToolSeedSearchAgent`
- Agent: `MCPToolSeedIncludeDataAgent`
- Agent: `MCPToolSeedExtractDataAgent`

## Usage

```bash
npx tsx scripts/seed/mcp_tools/seed.ts --execute
```

To target a different workspace:

```bash
DEV_WORKSPACE_SID=MyWorkspace npx tsx scripts/seed/mcp_tools/seed.ts --execute
```

With dust-hive:

```bash
dust-hive warm json-not-enforced
dust-hive feed json-not-enforced mcp_tools
```
