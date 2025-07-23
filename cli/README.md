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
- **`agents-mcp`**: Select Dust agents and launch a Model Context Protocol server (via SSE transport) to interact with them.
  - `dust agents-mcp`
  - Optional: `--port <number>` or `-p <number>` to specify the listening port (defaults to auto-selection)
  - Optional: `--sId <sId>` or `-s <sId>` to specify the agent sId to use directly (can be repeated)
- **`chat`**: Chat with a Dust agent (default command).
  - `dust chat` or simply `dust`
  - Optional: `--sId <sId>` or `-s <sId>` to specify the agent sId to use directly
  - Optional: `--auto` to automatically accept all file edit operations without prompting
- **`help`**: Display help information.
  - `dust help`

### Headless Authentication

The Dust CLI supports headless authentication for automated workflows and CI/CD environments. This allows you to authenticate without interactive prompts by providing credentials directly via command-line arguments.

#### Usage

To use headless authentication, pass both required parameters with any command:

```bash
dust [command] --wId <workspace-id> --api-key <your-api-key>
```

#### Parameters

- `--wId`: Your workspace ID
- `--api-key`: Your API key for authentication

#### Examples

```bash
# Chat with headless auth
dust chat --wId ws_abc123 --api-key sk_your_api_key_here

# Launch agents-mcp with headless auth
dust agents-mcp --wId ws_abc123 --api-key sk_your_api_key_here --port 8080

# Use with specific agent
dust chat --sId 1234567890 --wId ws_abc123 --api-key sk_your_api_key_here
```

#### When to Use Headless Auth

Headless authentication is particularly useful for:
- Automated scripts and workflows
- CI/CD pipelines
- Server environments without interactive terminals
- Batch processing operations

#### Security Considerations

- Store API keys securely (use environment variables in production)
- Avoid committing API keys to version control
- Consider using secrets management tools for production deployments

### Options

- **`-v`, `--version`**: Display the installed CLI version.
- **`-f`, `--force`**: Used with the `login` command to force re-authentication.
- **`--auto`**: Automatically accept all file edit operations without prompting for approval (chat command only).
- **`--help`**: Display help information for the CLI.

### In-Chat Commands

While chatting with an agent, you can use these commands by typing them with a forward slash:

- **`/exit`**: Exit the chat session
- **`/switch`**: Switch to a different agent
- **`/attach`**: Open file selector to attach a file
- **`/clear-files`**: Clear any attached files
- **`/auto`**: Toggle auto-approval of file edits on/off

## Examples

- `dust` (starts a chat with a Dust agent)
- `dust login`
- `dust agents-mcp`
- `dust agents-mcp --port 8080`
- `dust agents-mcp --sId 1234567890`
- `dust chat`
- `dust chat --sId 1234567890`
- `dust chat --auto` (automatically accept all file edits)
- `dust help`

## Development

To set up the development environment:

1. Make sure you have the right version of Node.js installed (`nvm use` in the CLI directory).
2. Install dependencies: `npm install`
3. Build the CLI: `npm run build` or `npm run build:dev` (or `npm run dev` for hot-reloading)
4. Run the CLI locally: `node dist/index.js <command>`
