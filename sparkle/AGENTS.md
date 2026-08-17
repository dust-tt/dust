Sparkle is Dust's design system: a published npm package (`@dust-tt/sparkle`) of React
components, icons, and logos, documented and tested through Storybook.

# Layout

```
sparkle/
├── src/
│   ├── components/ # Hand-written components
│   ├── hooks/, lib/ # Hand-written support code
│   ├── icons/, logo/ # Generated SVG modules (~2,900 files, see build_icons.sh)
│   ├── stories/ # ALL Storybook stories live here — never colocate next to components
│   └── styles/ # Tailwind 4 CSS config (theme.css holds the design tokens)
├── .storybook/ # Storybook config (main.ts, preview.ts, manager.ts)
├── scripts/ # Build and maintenance scripts
└── vitest.config.ts # Story test runner (browser mode)
```

Stories must live in `src/stories/`, not next to components: `package.json` `files` publishes
`src/` but excludes only `src/stories/`, so colocated stories would ship in the npm tarball.

# Storybook

- `npm run storybook` — dev server on :6006. A static build is deployed as the prod instance.
- `npm run build-storybook` — static build; also the cheapest way to catch story compile errors.
- Addons: themes, docs, a11y, vitest, tag-badges. Suite packages are pinned to one exact
  version (no `^`) because Storybook addons peer-lock to the exact core version; bump them all
  together, and only to versions older than the repo `.npmrc` `min-release-age` cooldown.

# Story tests

Stories run as real browser tests (vitest browser mode + Playwright Chromium), configured in
`vitest.config.ts`. One-time setup per machine: `npx playwright install chromium`.

- In-UI: the testing widget at the bottom of the Storybook sidebar (dev server only — it needs
  the local Vitest process, so it does not exist on the deployed instance).
- CLI: `npx vitest run --project=storybook [story file...]` — full suite takes ~2 minutes.
- Intentionally NOT wired into CI.
- Do not enable the widget's Coverage toggle on full-suite runs: it OOMs the dev-server
  process. Use the CLI with `--coverage` instead (coverage is scoped in `vitest.config.ts`
  because remapping the generated icon/logo modules exhausts the Node heap).

# Accessibility workflow

Every story gets an axe-core Accessibility panel (a11y addon). Violations are warnings, not
failures (`a11y: { test: "todo" }` in `.storybook/preview.ts`).

Components with known violations carry an `"a11y-issues"` tag on their story meta, rendered as
a red "A11y" sidebar badge (tag-badges addon, configured in `.storybook/manager.ts`).

These tags are maintained by a script — do not add or remove them by hand:

```
npm run a11y:sync
```

It re-runs the suite in strict mode (`VITE_A11Y_STRICT=1` makes violations fail), then adds the
tag to story files with violations and removes it from files that are now clean
(`scripts/sync-a11y-tags.mjs`). Run it after a11y fixes and commit the diff. The prod Storybook
only reflects the tags committed at build time, so keep them in sync.

To fix a badged component: open it in Storybook, read the violations in the Accessibility
panel, fix the component, then run the sync and commit the tag removal it produces.
