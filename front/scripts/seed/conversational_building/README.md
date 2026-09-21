# Conversational Building Seed

Seeds data for testing the conversational builder: how conversational skill suggestions render in a
conversation. Enables the `conversational_building` feature flag.

## How to use

Run:

```bash
npx tsx scripts/seed/conversational_building/seed.ts --execute
```

To target a different workspace:

```bash
DEV_WORKSPACE_SID=MyWorkspace npx tsx scripts/seed/conversational_building/seed.ts --execute
```
