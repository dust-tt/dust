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

npm run contentful:migrate -- --environment-id master contentful-migrations/01-logo-lists.cjs
```

The CLI prints the plan and asks for confirmation before writing.

### Running from a git worktree

`node_modules` in a worktree may be a symlink to the main checkout's tree (it is
in `dust-logo-bars`). `npm install` there would reconcile the *main* checkout's
installed packages against this branch's lockfile, breaking whatever is checked
out over there. Run the CLI through `npx` instead, which caches outside the
project:

```bash
npx --yes contentful-migration@5.1.0 \
  --space-id $CONTENTFUL_SPACE_ID \
  --management-token $CONTENTFUL_MANAGEMENT_TOKEN \
  --environment-id master \
  contentful-migrations/01-logo-lists.cjs
```

### Dry runs

Dry-run on a sandbox environment first if the space has one:

```bash
npm run contentful:migrate -- --environment-id sandbox contentful-migrations/01-logo-lists.cjs
```

Migrations are **not** idempotent: `createContentType` fails if the type already
exists. Add a new numbered file to change an existing type; don't edit a file
that has already been run.

## 01-logo-lists

Creates the two types behind the "Trusted by …" logo bars:

- **Customer logo** (`customerLogo`) — one entry per company: name, logo asset,
  and an optional link to its case study. Unpublishing an entry removes that
  logo from every list it appears in.
- **Logo list** (`logoList`) — one entry per *audience*, identified by `region`,
  holding an ordered list of Customer logo references. Drag order in Contentful
  is the display order on the site.

One list per audience, shared by every bar on every marketing page: a French
visitor sees the same lineup on `/home` as on `/home/solutions/sales`.

Field ids match `CustomerLogoFields` / `LogoListFields` in
`lib/contentful/types.ts`; the site reads them by id, so renaming a field in the
UI breaks the bar.

### After running it

Nothing changes on the site until a list is published — every bar keeps
rendering the hardcoded lineup in `lib/logo_bars.ts`, which reproduces today's
behaviour exactly, region by region. To hand an audience over to GTM:

1. Create a **Customer logo** entry per company (upload the logo in original
   brand colours; the site applies the gray treatment itself).
2. Create a **Logo list** entry, pick its audience, add the logos in the order
   they should appear, publish.

That audience switches to Contentful on the next revalidation (15 min). Every
other audience is untouched, so this rolls out one country at a time and is
reverted by unpublishing.

| Audience (`region`) | Who sees it |
| --- | --- |
| `france` | France |
| `united-kingdom` | The United Kingdom |
| `european-union` | The 27 EU countries — **not** the UK, Switzerland or Norway |
| `worldwide` | The United States and everywhere else |

### Who owns what

The set of audiences is **code-owned on purpose**, and the `region` field is a
dropdown rather than free text. A visitor's country arrives from IPinfo as an
ISO code and has to be mapped to an audience; that mapping lives in
`lib/logo_bars.ts`. A region invented in Contentful would match no visitor, and
its list would silently never render — which is why the field constrains the
values rather than trusting a typed one.

So:

| | Who | Deploy? |
| --- | --- | --- |
| Which markets exist | Engineering | Yes — a ~4-line PR |
| Logos in a market, their order, retiring one | Marketing | No |

Adding a market is deliberately small. The steps are listed in the comment
above `LOGO_LIST_REGIONS` in `lib/logo_bars.ts`; the important part is step 3,
picking the fallback bar so that merging the PR changes nothing on its own and
the new audience only goes live when marketing publishes its list.

Everything marketing actually does day to day — adding a logo, reordering a
bar, pulling a logo that's gone stale — needs none of this.

### Previewing

Marketing cannot see another country's bar from their own browser, so the
override params matter: `?geo=FR`, `?geo=GB`, `?geo=DE`, `?geo=US` on any of
the 13 pages. The older `?region=us|eu` still works on the solutions and
landing pages.

### Not covered

The industry pages (`/home/industry/*`) render sector-based bars
(`b2b-saas`, `finance`, `retail`, `insurance`, `marketplace`) that split by
sector rather than country, and they don't fetch logo lists. They stay
code-managed until someone adds a second axis.
