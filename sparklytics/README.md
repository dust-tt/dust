# Sparkle Analytics

Internal analytics platform for tracking [`@dust-tt/sparkle`](../sparkle) design system usage.

## Overview

| Part | What it does |
|---|---|
| `scanner/` | CLI that scans a codebase and produces a JSON report |
| `dashboard/` | Next.js app that reads reports and displays analytics |

---

## Quick Start

### 1. Build the scanner

```bash
cd sparklytics/scanner
npm install
npm run build
```

### 2. Run a scan

From the `sparklytics/scanner/` directory:

```bash
# Scan the front/ app and output report to dashboard/reports/
node dist/index.js scan \
  --target-dir ../../front \
  --output ../dashboard/reports \
  --verbose
```

Or use the `sparkle.config.json` in `sparklytics/` (set `targetDir` first):

```bash
node dist/index.js scan
```

The scanner outputs `sparkle-report-{timestamp}.json` to the configured output directory.

### 3. Start the dashboard

```bash
cd sparklytics/dashboard
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scanner CLI

```
Usage: sparkle-scan <command> [options]

Commands:
  scan     Scan a target directory and produce a JSON report
  tokens   Print the active token registry as JSON

Options for `scan`:
  --target-dir <path>   Path to the codebase to scan
  --package <name>      Design system package name (default: @dust-tt/sparkle)
  --exclude <dirs...>   Directories to exclude from scan
  --tokens <path>       Path to custom sparkle-tokens.json
  --output <dir>        Output directory for the report
  --verbose             Show detailed progress
```

---

## Configuration

`sparkle.config.json` (place in the directory where you run the scanner):

```json
{
  "packageName": "@dust-tt/sparkle",
  "excludeDirs": ["node_modules", ".next", "dist", "coverage"],
  "outputDir": "../dashboard/reports",
  "sparkleTokensPath": null
}
```

Set `sparkleTokensPath` to a custom `sparkle-tokens.json` if you want to override the built-in token registry.

---

## Token Registry

`sparkle-tokens.json` defines the valid Sparkle design tokens:

- **colors**: hex values for the Sparkle color palette (gray, golden, blue, green, rose, etc.)
- **fontSizes**: valid font sizes (12px–80px)
- **fontFamilies**: Geist, Geist Mono
- **fontWeights**: 100–900
- **lineHeights**: valid line heights
- **spacingScale**: valid spacing values
- **componentNames**: all exported component names

---

## Dashboard Pages

| Route | Description |
|---|---|
| `/overview` | Health score, trends, insights, leaderboard |
| `/adoption` | Adoption funnel, forecast, goals |
| `/components` | Full component list with usage stats |
| `/components/[name]` | Per-component props breakdown and file locations |
| `/tokens` | Color / typography / spacing compliance |
| `/reports` | All scan reports with diff comparison |

---

## Report Format

Reports are immutable JSON files named `sparkle-report-{ISO_TIMESTAMP}.json`. Drop them in `dashboard/reports/` to include them in the dashboard.

---

## Architecture Notes

- **Scanner** uses `@typescript-eslint/parser` for AST-based TSX/TS analysis and `postcss` for CSS/SCSS.
- **Dashboard** uses Next.js 14 App Router with Server Components reading reports directly from disk — no database required.
- Both packages are isolated from the root monorepo (not in npm workspaces, not covered by root Biome config).
