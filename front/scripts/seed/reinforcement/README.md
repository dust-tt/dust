# Reinforcement Seed

Creates skills with conversations, feedbacks, Dust conversations with JIT skills for testing reinforcement. Enables the `reinforced_agents` feature flag and turns on the workspace's "Allow self-improving skills" setting (`allowReinforcement`), which self-improvement also requires.

## Usage

```bash
npx tsx scripts/seed/reinforcement/seed.ts --execute
```

To target a different workspace:

```bash
DEV_WORKSPACE_SID=MyWorkspace npx tsx scripts/seed/reinforcement/seed.ts --execute
```
