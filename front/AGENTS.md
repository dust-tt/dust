Dust is a platform to build and operate agents for work. `front` holds the business logic, the
React components and the background workers behind it. It is a library workspace, not a running
server: HTTP handlers live in `front-api` (Hono) and the browser app in `front-spa`. `front-api`
imports `front` through the `@app/*` path alias, `front-spa` through the `@dust-tt/front/*`
workspace exports. The dependency is one-way — `front` never imports from `front-api` or
`front-spa`.

# Tech Stack

- **Language**: TypeScript (strict mode)
- **UI**: React 18 with Sparkle Design System (shadcn/ui + Tailwind + Radix)
- **Styling**: Tailwind CSS 4.x
- **Database**: PostgreSQL via Sequelize ORM (with Resources abstraction)
- **State Management**: SWR for data fetching
- **Background jobs**: Temporal workers (`start_worker.ts`, `temporal/`)

# Codebase structure

```
front/
├── components/ # React components (rendered by front-spa)
├── hooks/ # SWR hooks
├── lib/ # Core business logic
│ ├── api/ # API layer (interfaces between routes and resources)
│ ├── resources
│ └── swr/ # SWR hooks for data fetching (migrating to hooks/)
├── logger/ # Logger and request logging helpers
├── poke/ # Poke (internal admin) hooks and workflows
├── types/ # TypeScript type definitions
├── tests/ # Test utilities and factories
├── temporal/ # Temporal workflows for background jobs
├── migrations/ # Database migrations
├── admin/ # Local helpers and scripts
├── styles/ # Global styles
└── public/ # Static assets
```

API handlers are **not** here — they live in `front-api/routes/`, one file per URL. See
`front-api/CODING_RULES.md` before adding or changing an endpoint.

# Development setup

- Use `npx tsgo --noEmit` to type-check the front project.
- Use `npm run format:changed` (from the repo root) to format and lint changed files.
- For changes related to Temporal, LLM, MCP servers, Elasticsearch, audit events, and webhook sources, and for testing, use the corresponding skills.

# Running tests
- Use `npm run test -- filetotest` directly, it will automatically use a test environment (db, redis..)

@CODING_RULES.md

@AGENTS.local.md
