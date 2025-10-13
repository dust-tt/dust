# Test MCP Server

An integrated test MCP server in the Dust CLI for debugging MCP server sync behavior.

## Usage

Start the test server:

```bash
cd cli
npm run build
dust test-mcp
```

Or specify a port:

```bash
dust test-mcp -p 8080
```

## Interactive Commands

While the server is running, type commands to manage tools dynamically:

- `add <name>` - Add a new tool
- `remove <name>` - Remove a tool
- `rename <oldName> <newName>` - Rename a tool (simulates tool updates)
- `list` - List all current tools
- `help` - Show help

## Testing the MCP Sync Bug Fix

### Setup

1. Start the test server: `dust test-mcp`
2. Copy the SSE URL (press 'c' or copy from output)
3. Add it as a remote MCP server in Dust

### Test Scenario: Tool Renaming

This reproduces the original Stripe MCP bug where renamed tools would show both old and new versions:

1. **Initial state**: Server starts with no tools
2. **Add a tool**: Type `add search_documentation`
3. **Configure in Dust**: Set the tool to "low" stake level
4. **Rename the tool**: Type `rename search_documentation search_stripe_documentation`
5. **Sync in Dust**: Trigger a manual sync or wait for automatic sync

### Expected Results

**With the fix (correct behavior):**
- ✅ Only `search_stripe_documentation` appears
- ✅ Old `search_documentation` metadata is deleted from database
- ✅ New tool has default "high" stake level

**Without the fix (bug):**
- ❌ Both `search_documentation` (low stake) and `search_stripe_documentation` (high stake) appear
- ❌ Old metadata persists in database

## Example Session

```bash
$ dust test-mcp

=== Test MCP Server ===
Commands:
  add <name>                - Add a new tool
  remove <name>             - Remove a tool
  rename <oldName> <newName> - Rename a tool
  list                      - List all tools
  help                      - Show this help
========================

HTTP server listening on port 61234

Listening at: http://localhost:61234/sse

Use MCP client to interact (Ctrl+C to stop). (Press 'c' to copy URL)

Test MCP Server - Dynamic Tool Management
Type commands to manage tools:
  add <name>                - Add a new tool
  remove <name>             - Remove a tool
  rename <oldName> <newName> - Rename a tool
  list                      - List all tools
  help                      - Show help

# User input:
add search_documentation
[Test Server] Added tool: search_documentation

list
[Test Server] Current tools:
  - search_documentation: Test tool: search_documentation

rename search_documentation search_stripe_documentation
[Test Server] Removed tool: search_documentation
[Test Server] Added tool: search_stripe_documentation

add new_feature
[Test Server] Added tool: new_feature
```

## Architecture

The test server is built using the same infrastructure as the CLI's agents-mcp server:
- Uses `McpServer` from `@modelcontextprotocol/sdk`
- SSE transport for MCP protocol
- Express HTTP server
- Dynamic tool registration
- Graceful shutdown handling

## Files

- `cli/src/mcp/servers/testServer.ts` - Server implementation
- `cli/src/ui/commands/TestMCP.tsx` - CLI command component

