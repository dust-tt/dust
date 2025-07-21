# Dust CLI

A command-line interface for interacting with Dust.

## Installation

To install the Dust CLI globally, run:

```bash
npm install -g @dust-tt/dust-cli
```

### Linux

Dust CLI depends on [`keytar`](https://www.npmjs.com/package/keytar) for storing credentials. On
Linux, `keytar` requires `libsecret` to be installed.

Depending on your distribution, you will need to run the following command:

- Debian/Ubuntu: `sudo apt-get install libsecret-1-dev`
- Red Hat-based: `sudo yum install libsecret-devel`
- Arch Linux: `sudo pacman -S libsecret`

## Usage

The Dust CLI allows you to manage your Dust authentication session and chat with Dust agents.

```bash
dust [command] [options]
```

When no command is provided, the `chat` command will be used by default.

### Commands

- **`login`**: Authenticate with your Dust account.
  - `dust login`
  - `dust login --force`: Force re-authentication even if already logged in.
- **`status`**: Check your current authentication status.
  - `dust status`
- **`logout`**: Log out from your Dust account.
  - `dust logout`
- **`agents-mcp`**: Select Dust agents and launch a Model Context Protocol server to interact with them.
  - `dust agents-mcp`
  - Optional: `--port <number>` or `-p <number>` to specify the listening port for HTTP transport (defaults to auto-selection)
  - Optional: `--sId <sId>` or `-s <sId>` to specify the agent sId or name to use directly (can be repeated)
  - Optional: `--stdio` to use STDIO transport for AI clients (default: HTTP transport)
- **`chat`**: Chat with a Dust agent (default command).
  - `dust chat` or simply `dust`
  - Optional: `--sId <sId>` or `-s <sId>` to specify the agent sId to use directly
- **`help`**: Display help information.
  - `dust help`

### Options

- **`-v`, `--version`**: Display the installed CLI version.
- **`-f`, `--force`**: Used with the `login` command to force re-authentication.
- **`--help`**: Display help information for the CLI.

## Examples

- `dust` (starts a chat with a Dust agent)
- `dust login`
- `dust agents-mcp` (HTTP transport, default)
- `dust agents-mcp --port 8080` (HTTP transport on specific port)
- `dust agents-mcp --stdio` (STDIO transport for AI clients)
- `dust agents-mcp --sId "Claude 4 Sonnet" --stdio` (specific agent by name with STDIO)
- `dust agents-mcp --sId 1234567890 --stdio` (specific agent by sId with STDIO)
- `dust chat`
- `dust chat --sId 1234567890`
- `dust help`

### MCP Transport Types

The `agents-mcp` command supports two transport mechanisms:

- **HTTP Transport** (default): 
  - Uses HTTP with Server-Sent Events (SSE) for communication
  - Accessible via web browsers or HTTP clients
  - Runs a local HTTP server (default or specified port)
  - Use when you want a URL to connect MCP clients to
  
- **STDIO Transport** (`--stdio`):
  - Uses standard input/output for communication
  - Perfect for AI clients like Claude Desktop, Cursor, or other MCP-enabled applications
  - The server runs in the foreground and communicates via stdin/stdout
  - Use when integrating directly with MCP-compatible AI clients

### Using with AI Clients

For AI clients like Claude Desktop or Cursor, use the STDIO transport:

```bash
# In Claude Desktop configuration:
{
  "mcpServers": {
    "dust-agents": {
      "command": "dust",
      "args": ["agents-mcp", "--stdio", "--sId", "Claude 4 Sonnet"]
    }
  }
}

# Or in Cursor MCP settings:
{
  "dust-agents": {
    "command": "dust",
    "args": ["agents-mcp", "--stdio"],
    "env": {}
  }
}
```

## Development

To set up the development environment:

1. Make sure you have the right version of Node.js installed (`nvm use` in the CLI directory).
2. Install dependencies: `npm install`
3. Build the CLI: `npm run build` or `npm run build:dev` (or `npm run dev` for hot-reloading)
4. Run the CLI locally: `node dist/index.js <command>`
