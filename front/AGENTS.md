Dust is a platform to build and operate agents for work. `front` is our main service and web application.

# Tech Stack

- **Framework**: Next.js 14 (Pages Router with SSR)
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
├── pages/ # Next.js pages and API routes
│ ├── api/ # API endpoints
│ ├── api/v1/ # Public API endpoints
│ └── [other]/ # Page components
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
- Use the corresponding `.claude/skills` workflows on demand for testing, Temporal, LLM, MCP servers, Elasticsearch, audit events, and webhook sources.

# Running tests
- Use `npm run test -- filetotest

@CODING_RULES.md

@AGENTS.local.md
