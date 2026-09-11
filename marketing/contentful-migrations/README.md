# Contentful migrations

Content-model changes for the marketing site, as re-runnable scripts rather than
clicks in the Contentful UI — so `master` and any sandbox environment can be
brought to the same shape, and so the model is reviewable in a PR.

## Running one

You need a **Content Management API** token (Contentful → Settings → API keys →
Content management tokens). This is *not* the delivery token the site uses at
build time, and it must not be committed or added to the app's env.

```bash
cd marketing
export CONTENTFUL_SPACE_ID=...            # same space id the site reads
export CONTENTFUL_MANAGEMENT_TOKEN=...    # personal CMA token, keep out of git

npm run contentful:migrate -- --environment-id master contentful-migrations/01-logo-bars.cjs
```

The CLI prints the plan and asks for confirmation before writing. Dry-run it on
a sandbox environment first if the space has one:

```bash
npm run contentful:migrate -- --environment-id sandbox contentful-migrations/01-logo-bars.cjs
```

Migrations are **not** idempotent: `createContentType` fails if the type already
exists. Add a new numbered file to change an existing type; don't edit a file
that has already been run.

## 01-logo-bars

Creates the two types behind the "Trusted by …" logo bars:

- **Customer logo** (`customerLogo`) — one entry per company: name, logo asset,
  and an optional link to its case study. Unpublishing an entry removes that
  logo from every bar it appears in.
- **Logo bar** (`logoBar`) — one entry per bar on the site, identified by
  `barSlug`, holding an ordered list of Customer logo references. Drag order in
  Contentful is the display order on the site.

Field ids match `CustomerLogoFields` / `LogoBarFields` in
`lib/contentful/types.ts`; the site reads them by id, so renaming a field in the
UI breaks the bar.

### After running it

Nothing changes on the site until entries are published — every bar keeps
rendering the hardcoded fallback in `lib/logo_bars.ts`. To hand a bar over to
GTM:

1. Create a **Customer logo** entry per company (upload the logo in original
   brand colours; the site applies the gray treatment itself).
2. Create a **Logo bar** entry, pick its `barSlug` from the dropdown, add the
   logos in the order they should appear, publish.

That bar switches to Contentful on the next revalidation (15 min), one bar at a
time. The `barSlug` dropdown lists every slug the site asks for:

| Slug | Where it renders |
| --- | --- |
| `home-trusted-default` / `-gb` / `-fr` | `/home` hero, by visitor geo |
| `trusted-by-default-us` / `-eu` | Most solution pages |
| `trusted-by-landing-us` / `-eu` | `/home/chrome-extension`, `/home/frames` |
| `trusted-by-b2b-saas-*`, `-marketplace-*`, `-finance-*`, `-insurance-*`, `-retail-*` | Industry pages (not yet wired up — phase 2) |
