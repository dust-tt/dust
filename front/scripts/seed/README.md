# Seed Scripts

Scripts to populate the development environment with mock data.

Each folder contains a `seed.ts` file. Run with:

```bash
npx tsx scripts/seed/<folder>/seed.ts --execute
```

## Folders

- `basics/` - Creates a custom agent with skills and sample conversations
- `sidekick/` - Creates agents and conversations for testing the agent builder sidekick feature

## Shared Factories

The `factories/` folder contains reusable functions for creating seed data.
