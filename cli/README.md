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
- **`skill:init`**: Install the dust skill for coding CLIs (Claude Code, Codex).
  - `dust skill:init`
- **`chat`**: Chat with a Dust agent (default command).
  - `dust chat` or simply `dust`
  - Optional: `--sId <sId>` or `-s <sId>` to specify the agent sId to use directly
  - Optional: `--auto` to automatically accept all file edit operations without prompting
- **`help`**: Display help information.
  - `dust help`

### Headless Authentication

The Dust CLI supports headless authentication for automated workflows and CI/CD environments. This allows you to authenticate without interactive prompts by providing credentials via environment variables or command-line arguments.

#### Usage

**Method 1: Environment Variables (Recommended)**

Set the following environment variables:

```bash
export DUST_API_KEY="sk_your_api_key_here"
export DUST_WORKSPACE_ID="ws_abc123"
```

Then run any command normally:

```bash
dust [command]
```

**Method 2: Command-line Arguments**

Pass both required parameters with any command:

```bash
dust [command] --workspaceId <workspace-id> --key <your-api-key>
```

#### Parameters

- `DUST_API_KEY` (env) or `--api-key` (flag): Your API key for authentication
- `DUST_WORKSPACE_ID` (env) or `--wId` (flag): Your workspace ID

**Note:** Command-line flags take precedence over environment variables. If both are set, the command line flags will be used.

#### Examples

**Using Environment Variables:**

```bash
# Set environment variables once
export DUST_API_KEY="sk_your_api_key_here"
export DUST_WORKSPACE_ID="ws_abc123"

# Chat with headless auth
dust chat

# Install the dust skill
dust skill:init

# Use with specific agent
dust chat --sId 1234567890
```

**Using Command-line Arguments:**

```bash
# Chat with headless auth
dust chat --wId ws_abc123 --api-key sk_your_api_key_here

# Install the dust skill with headless auth
dust skill:init --wId ws_abc123 --api-key sk_your_api_key_here

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

- **Use environment variables** instead of command-line flags when possible, as command-line arguments may be visible in process lists
- Store API keys securely and avoid committing them to version control
- Consider using secrets management tools for production deployments
- Use `.env` files locally and proper secrets management in CI/CD environments

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
- `dust skill:init`
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
