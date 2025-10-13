# Test MCP Server for Debugging

This is a simple interactive MCP server that allows you to dynamically add/remove tools while it's running. Perfect for testing MCP server sync behavior.

## Setup

1. Make sure the CLI dependencies are installed:
```bash
cd cli
npm install
```

2. The test server is ready to use at: `cli/test-mcp-server.js`

## Usage

### Running the Server

You can run it directly with node:
```bash
node cli/test-mcp-server.js
```

Or use it with the Dust MCP client by adding it to your MCP configuration.

### Interactive Commands

While the server is running, you can type commands on stdin to modify the tools:

- `add <name> <description>` - Add a new tool
- `remove <name>` - Remove a tool  
- `rename <oldName> <newName>` - Rename a tool (simulates a tool update)
- `list` - List all current tools
- `help` - Show help

### Initial Tools

The server starts with these tools:
- `search_documentation` - Search through documentation (will be renamed to test sync)
- `get_status` - Get server status

## Testing the Sync Bug Fix

1. **Add the test server to Dust as a remote MCP server** using the server URL/connection
2. **Initial state**: Note that it has `search_documentation` and `get_status` tools
3. **Configure stakes**: Set `search_documentation` to "low" stake
4. **Rename the tool**: In the test server console, run:
   ```
   rename search_documentation search_stripe_documentation
   ```
5. **Sync the server** in Dust UI (or wait for automatic sync)
6. **Verify the fix**: 
   - OLD behavior (bug): You'd see both `search_documentation` (low stake) and `search_stripe_documentation` (high stake)
   - NEW behavior (fixed): You should only see `search_stripe_documentation` with high stake, and `search_documentation` metadata should be deleted

## Example Session

```bash
$ node cli/test-mcp-server.js

=== Test MCP Server ===
Commands:
  add <name> <description>  - Add a new tool
  remove <name>             - Remove a tool
  list                      - List all tools
  rename <oldName> <newName> - Rename a tool (simulates tool update)
  help                      - Show this help
========================

[CLI] Added tool: search_documentation
[CLI] Added tool: get_status

[CLI] Current tools:
  - search_documentation: Search through documentation (will be renamed to test sync)
  - get_status: Get server status

[Server] Test MCP Server running on stdio
list
[CLI] Current tools:
  - search_documentation: Search through documentation (will be renamed to test sync)
  - get_status: Get server status

rename search_documentation search_stripe_documentation
[CLI] Removed tool: search_documentation
[CLI] Added tool: search_stripe_documentation

add new_tool This is a new tool
[CLI] Added tool: new_tool
```

## Integrating with Dust

To use this with Dust, you'll need to set it up as a remote MCP server. The exact method depends on your setup, but typically:

1. Run the test server
2. In Dust, add a new remote MCP server pointing to this server
3. Use the interactive commands to modify tools
4. Trigger sync and observe the behavior

