# Triggers Seed

Seeds webhook sources, schedule triggers, and webhook triggers for agents created by the `basics` seed.

## What it creates

- 3 webhook sources (GitHub, Linear, custom)
- 3 schedule triggers (daily, weekly, hourly) attached to basics agents
- 3 webhook triggers linked to the webhook sources above
- All triggers are created with `status: "disabled"` to avoid temporal workflow side effects

## Prerequisites

Depends on agents from `basics/` seed. The script will create them if they don't already exist.

## Usage

```bash
npx tsx scripts/seed/triggers/seed.ts --execute
```
