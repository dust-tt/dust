# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dust is a custom AI agent platform consisting of a monorepo with multiple services written in TypeScript (Next.js frontend, Node.js services) and Rust (core API).

## Monorepo Structure

- **front/** - Next.js web application (main user interface)
- **connectors/** - External data source connectors (Slack, Notion, Google Drive, etc.)
- **core/** - Rust-based core API for document processing and embeddings
- **sparkle/** - Design system and React component library
- **sdks/js/** - JavaScript/TypeScript SDK for Dust API
- **cli/** - Command-line interface tools
- **extension/** - Browser extension
- **types/** - Shared TypeScript types (deprecated, being migrated to front/types)

## Shell Command Best Practices

When running commands via the Bash tool:

1. **Always use `npx` for locally-installed Node.js tools**
   - ✅ `npx tsc` (not `tsc`)
   - ✅ `npx vitest` (not `vitest`)
   - ✅ `npx eslint` (not `eslint`)

2. **Always use `npm run` for package.json scripts**
   - ✅ `npm run build`
   - ✅ `npm run test`
   - ✅ `npm run lint`

3. **Never assume tools are globally installed**
   - Local tools live in `node_modules/.bin/`
   - `npx` automatically finds them

4. **Verify working directory before running commands**
   - Check you're in the correct package directory (front/, connectors/, etc.)
   - Use absolute paths when possible

## Development Commands

### Frontend (front/)

```bash
# Development
cd front
npm run dev              # Start Next.js dev server
npm run dev:all          # Start types watcher + SDK + Next.js + worker
npm run dev:worker       # Start Temporal worker separately

# Testing
npm run test             # Run Vitest tests
npm run test:ci          # Run tests in CI mode with JUnit output

# Build & Type Checking
npm run build            # Production build
npm run tsc              # Type check

# Linting & Formatting
npm run lint             # Run ESLint (includes custom filename checks)
npm run format           # Format with Prettier
npm run format:check     # Check formatting

# Database
npm run initdb           # Initialize database
npm run create-db-migration  # Create new migration file
```

### Connectors (connectors/)

```bash
cd connectors
npm run start            # Start both server and worker
npm run start:web        # Start server only (port 3002)
npm run start:worker     # Start Temporal worker only
npm run build            # Build TypeScript
npm run test             # Run tests
npm run cli              # Access connector CLI tools
```

### Core (core/)

```bash
cd core
cargo build              # Build all binaries
cargo run --bin core-api # Run core API server
cargo test               # Run tests
cargo fmt                # Format code
cargo clippy             # Lint code

# Useful binaries
cargo run --bin init_db  # Initialize database
cargo run --bin elasticsearch_create_index
cargo run --bin qdrant_create_collection
```

### Sparkle (sparkle/)

```bash
cd sparkle
npm run build            # Build library
npm run storybook        # Run Storybook dev server
npm run build-storybook  # Build Storybook
```

## Development Environment Setup

### Required Services (via Docker Compose)

```bash
docker-compose up        # Start all services:
                         # - PostgreSQL (5432)
                         # - Redis (6379)
                         # - Qdrant (6333, 6334)
                         # - Elasticsearch (9200)
                         # - Kibana (5601)
                         # - Apache Tika (9998)
```

### Database Initialization

```bash
# Frontend database
cd front && npm run initdb

# Connectors database
cd connectors && npm run initdb

# Core database
cd core && cargo run --bin init_db
```

## Architecture

### Frontend Architecture

The frontend follows a strict layering pattern:

1. **Pages** (`pages/`) - Next.js API routes and page components
2. **API Layer** (`lib/api/`) - Business logic, should NOT use Sequelize models directly
3. **Resources** (`lib/resources/`) - Abstraction layer over Sequelize models
4. **Models** (`lib/models/`) - Sequelize database models (internal to Resources)

**Key principles:**
- API routes should interact with `lib/api/*` interfaces, not models directly
- `lib/api/*` should use Resources, not Sequelize models
- Resources abstract all database operations and expose both `sId` (string) and `id` (ModelId)
- Never expose ModelId in URLs or API endpoints - use `sId` instead

### Data Fetching Pattern

All network operations use SWR hooks in `lib/swr/*`:
- Fetching uses `useSWR` hooks
- Mutations use colocated hooks (e.g., `useCreateFolder`)
- Success/failure notifications handled in hooks, not components
- Return empty arrays via `emptyArray()` for loading/error states

### Temporal Workflows

Temporal is used for background job processing:
- Worker code in `front/temporal/` and `connectors/temporal/`
- Start workers with `npm run dev:worker` or `npm run start:worker`
- Workflows organized by domain (agent_loop, data_retention, upsert_queue, etc.)

### Connectors Architecture

Connectors sync external data sources:
- Each connector in `connectors/src/connectors/`
- API server (`start_server.ts`) handles HTTP requests
- Worker (`start_worker.ts`) processes Temporal workflows
- Resources pattern similar to frontend

### Core (Rust) Architecture

Core provides high-performance document processing:
- REST API server (`bin/core_api.rs`)
- Document chunking and embedding
- Elasticsearch and Qdrant integration
- SQLite worker for sandboxed queries

## Testing

### Frontend Testing

- Tests use Vitest and Testing Library
- Focus on functional/endpoint-level tests, not unit tests
- Test setup uses factories (in `tests/`)
- Factories should return Resources when possible
- Run tests: `cd front && npm run test`

### Connectors Testing

- Similar patterns to frontend
- Run tests: `cd connectors && npm run test`

### Core Testing

- Rust tests with `cargo test`
- Functional API tests: `./functional_api_tests.sh`

## Coding Standards

### TypeScript/JavaScript

Key rules from `front/CODING_RULES.md` and `connectors/` patterns:

1. **Types over Enums** - Use `type Color = "red" | "blue"` instead of enums
2. **No `as` casting** - Use typeguards instead (unless type-safe like `as const`)
3. **No parameter mutation** - Return new instances, don't modify parameters
4. **Use app logger** - Never use `console.log`, always use logger
5. **Result pattern for errors** - Don't throw/catch your own errors, return `Result<>`
6. **ConcurrentExecutor** - Use instead of `PQueue` or `Promise.all` on dynamic arrays
7. **Component props** - Always use `interface` for React component props
8. **Query parameters** - Extract with `const { foo } = req.query` then check with `isString`
9. **Sort imports** - Always sort imports alphabetically in files

### Rust

From `core/CODING_RULES.md`:

1. **Never use `unwrap()`** - Use `?` operator or match statements instead

### Security

- No sensitive data in URLs or query strings (use HTTP body/headers)
- Never expose ModelId in URLs (use sId)
- All endpoints need proper authentication checks

## Key Files

- `front/CODING_RULES.md` - Detailed coding standards for frontend
- `core/CODING_RULES.md` - Rust coding standards
- `docker-compose.yml` - Local development services
- `front/middleware.ts` - Next.js middleware for auth
- `front/lib/api/` - Core business logic
- `front/lib/resources/` - Database resource abstractions
- `connectors/src/connectors/` - External connector implementations
- `core/src/` - Rust core implementation

## Common Tasks

### Running a Single Test

```bash
# Frontend
cd front && npm run test -- path/to/test.test.ts

# Connectors
cd connectors && npm run test -- path/to/test.test.ts

# Core
cd core && cargo test test_name
```

### Creating a Database Migration

```bash
# Frontend
cd front && npm run create-db-migration

# Connectors
cd connectors && npm run create-db-migration
```

### Debugging

Frontend supports Datadog profiler:
```bash
cd front && npm run debug:profiler
```

### Building Sparkle Locally

When developing Sparkle alongside frontend:
```bash
cd sparkle && npm run sparkle:dev  # From front directory
```
