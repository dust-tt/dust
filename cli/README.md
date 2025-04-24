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

The Dust CLI allows you to manage your Dust authentication session (no features yet).

```bash
dust <command> [options]
```

### Commands

- **`login`**: Authenticate with your Dust account.
  - `dust login`
  - `dust login --force`: Force re-authentication even if already logged in.
- **`status`**: Check your current authentication status.
  - `dust status`
- **`logout`**: Log out from your Dust account.
  - `dust logout`
- **`agents-mcp`**: Select Dust agents and launch a Model Context Protocol server (via SSE transport) to interact with them.
  - `dust agents-mcp`
  - Optional: `--port <number>` or `-p <number>` to specify the listening port (defaults to auto-selection)
  - Optional: `--sId <sId>` or `-s <sId>` to specify the agent sId to use directly (can be repeated)
- **`help`**: Display help information.
  - `dust help`

### Options

- **`-v`, `--version`**: Display the installed CLI version.
- **`-f`, `--force`**: Used with the `login` command to force re-authentication.
- **`--help`**: Display help information for the CLI.

## Examples

- `dust login`
- `dust agents-mcp`
- `dust agents-mcp --port 8080`
- `dust agents-mcp --sId 1234567890`
- `dust help`

## Development

To set up the development environment:

1. Make sure you have the right version of Node.js installed (`nvm use` in the CLI directory).
2. Install dependencies: `npm install`
3. Build the CLI: `npm run build` or `npm run build:dev` (or `npm run dev` for hot-reloading)
4. Run the CLI locally: `node dist/index.js <command>`
