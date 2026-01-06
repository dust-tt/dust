Dust is a platform to build and operate agents for work. `front` is our main service and web application.

## Tech Stack

- **Framework**: Next.js 14 (Pages Router with SSR)
- **Language**: TypeScript (strict mode)
- **UI**: React 18 with Sparkle Design System (shadcn/ui + Tailwind + Radix)
- **Styling**: Tailwind CSS 3.x
- **Database**: PostgreSQL via Sequelize ORM (with Resources abstraction)
- **State Management**: SWR for data fetching

## Codebase structure

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

## Development setup

- Assume a dev-server is hot-reloaded and running at http://localhost:3000
- You can use `./admin/check.ts` to run all checks (lint, type-check, format) concurrently.
  - Use `npx prettier --check/--write` to check or format code based on our local configuration.
  - Use `npx tsgo --noEmit` to type-check the front project.
  - Use `npm run lint` to run ESLint
- Read `runbooks/TEST.md` for all things related to testing.

### Runbooks

Runbooks for various typical development tasks are located under `runbooks/`:

`ELASTICSEARCH.md`: add a new Elasticsearch index for search in front.
`NEW_LLM.md`: add support for a new provider/model.
`NEW_MCP_SERVER.md`: add a new MCP server to Dust.
`NEW_WEBHOOK_SOURCE.md`: add a new webhook source to Dust.
`TEMPORAL.md`: create a new temporal workflow.
`TEST.md`: running tests in front.

Read these files on-demand when working on tasks.

---

@CODING_RULES.md

---

Possibly empty user specific instructions:

@AGENTS.local.md
