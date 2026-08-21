# Inactivity Seed

Seeds a workspace whose answer to "which agents would automatic archival take?" is known in advance,
so the preview endpoint can be checked by hand.

## What it creates

Five agents. At a 30-day threshold, two are archivable and the other three are each spared by a
different rule:

| Agent | Setup | At 30 days |
| --- | --- | --- |
| `Idle Agent` | created 90d ago, never mentioned | **eligible** |
| `Recently Used Agent` | created 90d ago, mentioned yesterday | not a candidate |
| `Scheduled Agent` | created 90d ago, unmentioned, enabled schedule | `active_schedule` |
| `Fresh Agent` | created today, never mentioned | `recent_creation` |
| `Edited Agent` | first version 90d ago, edited today, unmentioned | **eligible** |

`Recently Used Agent` is spared without a skip reason: the candidates query filters on the same
cutoff, so a recently mentioned agent never reaches the rules to be counted by them.

`Edited Agent` is the interesting one: upgrading an agent inserts a new row, so its active row looks
young. Reading that date instead of the first version's would let editing an agent postpone its
archival forever.

## Prerequisites

- `dust-hive` seed must have run, for the workspace and its admin.
- Temporal must be reachable: creating the enabled schedule starts a workflow. Its cron is yearly, so
  the seeded agent will not actually run.

## Usage

```bash
npx tsx scripts/seed/inactivity/seed.ts --execute
```

Then enable the `archive_inactive_agents` feature flag on the workspace through Poke and call:

```
POST /api/w/<wId>/assistant/agent_configurations/archive_inactive/preview  { "thresholdDays": 30 }
```

Expect `eligibleCount: 2` and `skippedCountByReason: { active_schedule: 1, recent_creation: 1 }`.

To target a different workspace:

```bash
DEV_WORKSPACE_SID=MyWorkspace npx tsx scripts/seed/inactivity/seed.ts --execute
```

Idempotent: re-running skips the agents, the mention conversation, the trigger and the edit.
