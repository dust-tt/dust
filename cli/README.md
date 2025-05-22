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
  - `dust agents-mcp` (launches with SSE transport and interactive agent selection)
  - Optional: `--port <number>` or `-p <number>` to specify the listening port for SSE transport (defaults to auto-selection)
  - Optional: `--sId <sId>` or `-s <sId>` to specify the agent sId to use directly (can be repeated)
  - Optional: `--transport <type>` or `-t <type>` to specify transport type:
    - `sse` (default): HTTP server with Server-Sent Events, supports multiple clients
    - `stdio`: Standard input/output transport, requires at least one `--sId`, bypasses interactive UI
- **`chat`**: Chat with a Dust agent (default command).
  - `dust chat` or simply `dust`
  - Optional: `--sId <sId>` or `-s <sId>` to specify the agent sId to use directly
- **`help`**: Display help information.
  - `dust help`

### Options

- **`-v`, `--version`**: Display the installed CLI version.
- **`-f`, `--force`**: Used with the `login` command to force re-authentication.
- **`-p`, `--port`**: Specify the port for the MCP server (SSE transport only).
- **`-s`, `--sId`**: Specify agent sId(s) to use directly (can be repeated).
- **`-t`, `--transport`**: Specify transport type for agents-mcp: `sse` (default) or `stdio`.
- **`--help`**: Display help information for the CLI.

## Examples

- `dust` (starts a chat with a Dust agent)
- `dust login`
- `dust agents-mcp` (interactive agent selection with SSE transport)
- `dust agents-mcp --port 8080` (SSE transport on specific port)
- `dust agents-mcp --sId 1234567890` (SSE transport with specific agent)
- `dust agents-mcp --transport stdio --sId 1234567890` (stdio transport with specific agent)
- `dust agents-mcp --transport stdio --sId agent1 --sId agent2` (stdio transport with multiple agents)
- `dust chat`
- `dust chat --sId 1234567890`
- `dust help`

## Development

To set up the development environment:

1. Make sure you have the right version of Node.js installed (`nvm use` in the CLI directory).
2. Install dependencies: `npm install`
3. Build the CLI: `npm run build` or `npm run build:dev` (or `npm run dev` for hot-reloading)
4. Run the CLI locally: `node dist/index.js <command>`
