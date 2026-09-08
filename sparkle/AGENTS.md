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

`./build_icons.sh` deletes `src/icons/v2-stroke` and `src/logo/dust` outright, clears the
generated files in `src/logo/platforms` individually so hand-authored `registry.ts` survives,
then regenerates each from its SVG source directory and runs `biome check --write`. Any generated
module without a matching SVG source is therefore destroyed by a build. Before running it, confirm
every export in `src/icons/v2-stroke/index.ts` has a source file — several icons have historically
been hand-written TSX with no SVG, and they must be exported from Figma first.

# Platform logos

The design source of truth is the Figma file
[Sparkle Assets](https://www.figma.com/design/wh2qXEXuhncAbbhTAbrjDS/Sparkle-Assets), page
`Platforms`, section `Used`. Unlike the icon file the relationship is exact in both directions:
every export in `src/logo/platforms/index.ts` has a component in `Used` and every component in
`Used` has an export, so an audit can compare the two sets directly. Scope any export, sync or
audit tooling to that section — `Not Exported / Not used` on the same page is the holding area
for retired art.

Two components in `Used` are exceptions: `platforms/Logos/Alma` and `platforms/Logos/Anthropic`
are wordmark lockups at arbitrary widths rather than 24×24 marks, and are not exported. Skip the
`platforms/Logos/` prefix when auditing.

## Naming

Names are PascalCase in Figma and stay PascalCase the whole way through — the opposite of the
kebab-case v2-stroke convention:

```
Figma component  platforms/Name
SVG source       src/logo/src/platforms/Name.svg
generated module src/logo/platforms/Name.tsx
export           export { default as NameLogo } from "./Name"
```

The `Logo` suffix is appended by `svgr-platform-template.js`, not by SVGR. SVGR pascal-cases the
source filename, so multi-word acronyms lose their casing on the way through: `GooglePDF.svg` can
only ever produce `GooglePdfLogo`. Name the Figma component to produce the export you want rather
than patching the output, and keep the Figma name, the SVG filename and the export stem identical
— drift between the three is invisible at build time and expensive to audit later.

## Colours

Platform logos are brand marks: a fixed ink colour on a coloured or light chip. They must never
resolve to `currentColor`. `svgr.config.js` rewrites black to `currentColor`, which is right for
stroke icons and the two Dust mono logos but would leave these marks invisible against their own
chip in dark mode, so the platforms line in `build_icons.sh` passes `--no-runtime-config` and
repeats that config's other options explicitly. Do not drop the flag, and do not add a
`replaceAttrValues` entry covering platforms.

This is also why the `White` and `Mono` cuts of Github, Linear and Zendesk were retired: a
chip-backed mark renders identically in both themes, so a per-theme variant has nothing to do.

## registry.ts

`src/logo/platforms/registry.ts` is hand-authored and no build touches it, but it sits inside the
generated directory — which is why `build_icons.sh` clears that directory file-by-file instead of
with `rm -rf`, and why `index.ts` re-exports it from the template rather than by hand.

It holds `PLATFORM_LOGOS`, the only supported way to resolve a logo from a string
(`getPlatformLogo`). `index.ts` is generated and picks up a new logo automatically;
`PLATFORM_LOGOS` does not, so add the entry by hand or the logo stays invisible to every dynamic
caller. `front`, `marketing` and `sdks` each ship an allowlist of these names
(`resources_icon_names.ts`, `mcp_icon_types.ts`) whose values are persisted in Postgres and frozen
into the public SDK enum — the same add-only rule as `ActionIcons.ts`.

## Retiring a logo

Every export is public API of a published package, so deleting the SVG source is not enough: the
export vanishes on the next build and breaks consumers silently. Delete the source, then add a
`@deprecated` alias in `registry.ts` pointing at the replacement plus a matching `PLATFORM_LOGOS`
entry so stored payloads still resolve, and remove both on the following publish. `GithubMonoLogo`,
`GithubWhiteLogo`, `LinearWhiteLogo`, `ZendeskWhiteLogo` and `OutlookLogo` are the live examples.

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
