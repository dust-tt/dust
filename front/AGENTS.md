Dust is a platform to build and operate agents for work. `front` is our main service and web application.

# Tech Stack

- **Framework**: Vite + React 18 (single-page app; the HTTP API is served by the `front-api` Hono service)
- **Language**: TypeScript (strict mode)
- **UI**: React 18 with Sparkle Design System (shadcn/ui + Tailwind + Radix)
- **Styling**: Tailwind CSS 3.x
- **Database**: PostgreSQL via Sequelize ORM (with Resources abstraction)
- **State Management**: SWR for data fetching

# Codebase structure

```
front/
├── components/ # React components
├── hooks/ # SWR hooks
├── lib/ # Core business logic
│ ├── api/ # API layer (interfaces between routes and resources)
│ ├── resources
│ └── swr/ # SWR hooks for data fetching (migrating to hooks/)
├── types/ # TypeScript type definitions
├── tests/ # Test utilities and factories
├── temporal/ # Temporal workflows for background jobs
├── migrations/ # Database migrations
├── admin/ # Local helpers and scripts
└── public/ # Static assets
```

# Development setup

- Use `npx tsgo --noEmit` to type-check the front project.
- Use `npm run format:changed` (from the repo root) to format and lint changed files.
- For changes related to Temporal, LLM, MCP servers, Elasticsearch, audit events, and webhook sources, and for testing, use the corresponding skills.

# Running tests
- Use `npm run test -- filetotest

@CODING_RULES.md

@AGENTS.local.md
