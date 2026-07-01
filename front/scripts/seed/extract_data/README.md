# Extract Data Seed

Creates a small CRM data source and an agent configured with the Extract Data
tool, including a pre-configured JSON schema and time frame.

## Usage

```bash
npx tsx scripts/seed/extract_data/seed.ts --execute
```

To target a different workspace:

```bash
DEV_WORKSPACE_SID=MyWorkspace npx tsx scripts/seed/extract_data/seed.ts --execute
```

With dust-hive:

```bash
dust-hive warm json-not-enforced
dust-hive feed json-not-enforced extract_data
```
