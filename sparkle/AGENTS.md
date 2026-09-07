Sparkle is Dust's design system: a published npm package (`@dust-tt/sparkle`) of React
components, icons, and logos, documented and tested through Storybook.

# Layout

```
sparkle/
├── src/
│   ├── components/ # Hand-written components
│   ├── hooks/, lib/ # Hand-written support code
│   ├── icons/, logo/ # Generated SVG modules (see Icons below and build_icons.sh)
│   ├── stories/ # ALL Storybook stories live here — never colocate next to components
│   └── styles/ # Tailwind 4 CSS config (theme.css holds the design tokens)
├── .storybook/ # Storybook config (main.ts, preview.ts, manager.ts)
├── scripts/ # Build and maintenance scripts
└── vitest.config.ts # Story test runner (browser mode)
```

Stories must live in `src/stories/`, not next to components: `package.json` `files` publishes
`src/` but excludes only `src/stories/`, so colocated stories would ship in the npm tarball.

# Icons

The design source of truth is the Figma file
[Sparkle Icons](https://www.figma.com/design/VI4wJUjAzkaQ3EOanVGIW8/Sparkle-Icons). Only two of its
six pages are relevant: `Custom Icons` (29 components) and `Shelve Icons` (189 components). Together
they are canonical — every export in `src/icons/v2-stroke/index.ts` maps to a component on one of
those two pages — so any export, sync or audit tooling must be scoped to them.

Always ignore the `WIP` page. It holds drafts and explorations, and nine of its component names
deliberately duplicate icons already published on `Custom Icons` / `Shelve Icons` (`list-select`,
`shapes`, `tag-block`, `dot`, `fire`, `list-add`, `shapes-plus`, `intersect-dust`, `folder-table`),
so including it yields duplicate names and draft artwork. Several of its names are also still
off-convention (`actionStore`, `RobotIcon`, `folderOpen`). `Playground`, `OldIcons` and `Cover` hold
no components at all.

Two icons on the canonical pages are deliberately **not** exported, so the canonical relationship
only holds one way: every repo export has a Figma component, but not every Figma component has a
repo export. `x` was retired in favour of `x-close` (same glyph, one unit larger on each extreme)
and `fingerprint-04` in favour of `fingerprint-03`. Do not re-add either from Figma, and skip them
when auditing or bulk re-exporting.

`src/icons/src/**` holds the SVG sources; `src/icons/**` holds the TSX modules SVGR generates from
them. Never hand-edit a file under `src/icons/v2-stroke/` — edit or add the SVG source and
regenerate with `./build_icons.sh`.

`src/icons/ActionIcons.ts` is the one exception: it is hand-authored and no build touches it. It
maps the icons users can pick to label skills, and its keys are not component names but identifiers
persisted in Postgres (`skill.icon`, `remote_mcp_server.icon`, `webhook_sources_view.icon`) and
frozen into the public SDK enum `MCPInternalActionIconSchema`. Keys may only ever be added; renaming
or removing one breaks stored rows and the public API. The values are ordinary v2-stroke components
and are free to change. `resources_icons.tsx` in both `front` and `marketing` asserts at compile
time that the map still covers every persisted name, so a dropped key fails their builds. This map
replaced the retired filled `actions` icon set, which no longer exists.

Keep that file `.ts`, never `.tsx`. `reactDocgen: "react-docgen-typescript"` in `.storybook/main.ts`
only transforms `.tsx`, and on a `.tsx` file it appends `displayName` and `__docgenInfo` to the
exported object. Anything iterating the map with `Object.entries` then hits those two extra keys and
tries to render a string and an object as components. The Storybook vitest project does not run
docgen, so the story tests pass while the dev server throws — the only reliable check is loading the
story in a browser.

## Naming

Names are kebab-case in Figma and stay kebab-case in the exported SVG filename. Casing is converted
during the SVG → TSX step, so nothing needs renaming by hand at any point:

```
Figma layer      icon-name
SVG source       src/icons/src/v2-stroke/icon-name.svg
generated module src/icons/v2-stroke/IconName.tsx
export           export { default as IconName } from "./IconName"
```

Two consequences worth knowing. Multi-word acronyms and single letters lose their intended casing —
`t-shirt` becomes `TShirt` and `mail-ai` becomes `MailAi` — so name the Figma layer to produce the
export you want rather than patching the output. And `container.svg` is re-exported as
`ContainerIcon` because `Container` collides with an existing Sparkle component export; that
exception lives in `svgr-v2-stroke-icon-template.js`.

## Regenerating

`./build_icons.sh` starts by deleting `src/icons/v2-stroke`, `src/logo/platforms` and
`src/logo/dust`, then regenerates each from its SVG source directory and
runs `biome check --write`. Any generated module without a matching SVG source is therefore
destroyed by a build. Before running it, confirm every export in `src/icons/v2-stroke/index.ts` has
a source file — several icons have historically been hand-written TSX with no SVG, and they must be
exported from Figma first.

# Storybook

- `npm run storybook` — dev server on :6006. A static build is deployed as the prod instance.
- `npm run build-storybook` — static build; also the cheapest way to catch story compile errors.
- Addons: themes, docs, a11y, vitest, mcp, tag-badges. Suite packages are pinned to one exact
  version (no `^`) because Storybook addons peer-lock to the exact core version; bump them all
  together, and only to versions older than the repo `.npmrc` `min-release-age` cooldown.

# AI manifests & MCP

`@storybook/addon-mcp` generates AI-consumable manifests and serves an MCP endpoint:

- Manifests: `/manifests/components.json` and `/manifests/docs.json` (dev server and static
  build); debugger UI at `/manifests/components.html`.
- MCP endpoint: `http://localhost:6006/mcp` (dev server only). Register it in an agent with
  `npx mcp-add --type http --url "http://localhost:6006/mcp" --scope project`.
- Curation is tag-driven: stories or files tagged `"!manifest"` are excluded (asset catalogs,
  token tables, design-review galleries, interaction tests, deprecated components). The
  `"deprecated"` tag renders a sidebar badge. Keep meta `tags: [...]` on one line — the a11y
  sync script parses it textually.
- Story conventions that feed the manifest: JSDoc with `@summary` on every story export,
  intent-bearing story names, args-driven CSF3 (a `render` must spread its args), `fn()` from
  `storybook/test` for callbacks, component-level JSDoc in `src/components/` (picked up by
  react-docgen-typescript). `src/stories/Button.stories.tsx` is the model file.

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
