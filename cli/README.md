# Dust CLI

A command-line interface for interacting with Dust.

## Installation

To install the Dust CLI globally, run:

```bash
npm install -g @dust-tt/dust-cli
```

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
- **`help`**: Display help information.
  - `dust help`

### Options

- **`-v`, `--version`**: Display the installed CLI version.
- **`-f`, `--force`**: Used with the `login` command to force re-authentication.
- **`--help`**: Display help information for the CLI.

## Development

To set up the development environment:

1. Make sure you have the right version of Node.js installed (`nvm use` in the CLI directory).
2. Install dependencies: `npm install`
3. Build the CLI: `npm run build` or `npm run build:dev` (or `npm run dev` for hot-reloading)
4. Run the CLI locally: `node dist/index.js <command>`
