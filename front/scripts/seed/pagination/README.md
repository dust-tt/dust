# Pagination Seed

Creates many agents and skills to test the search-backed Manage Agents and Manage Skills pages
(pagination, sorting, name search):

- 100 agents named `<Topic><Role>` (e.g. `SalesAssistant`); one in five is unpublished
- 100 skills named `<Topic> <Action>` (e.g. `Sales Report`); one in five is editor-only

Names share words (`Sales…`, `…Report`) so name search returns several pages. Re-runs skip
existing entries and re-queue their search indexation.

## How to use ?

```
npx tsx scripts/seed/pagination/seed.ts --execute
```

Use `--count <n>` (at most 100) to create fewer of each.
