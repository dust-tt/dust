# Sparkle

Dust's design system, published as `@dust-tt/sparkle` and documented through Storybook.

## Build icons

```
./build_icons.sh
```

`src/icons/actions/index.ts` is not generated: it aliases the legacy `Action*Icon` names to
v2-stroke icons, using the map in `src/icons/actionIconAliases.ts`.

## Storybook

```
npm run storybook        # dev server on http://localhost:6006
npm run build-storybook  # static build (what gets deployed)
```

Stories live in `src/stories/` and run as real browser tests via the testing widget at the
bottom of the Storybook sidebar (dev server only), or from the CLI:

```
npx playwright install chromium                # one-time setup per machine
npx vitest run --project=storybook             # full suite, ~2 minutes
```

## Accessibility

Every story has an axe-core Accessibility panel. Components with known violations carry an
`a11y-issues` tag, shown as a red "A11y" badge in the sidebar. The tags are maintained by a
script — after fixing (or changing) components, refresh them and commit the diff:

```
npm run a11y:sync
```

See `AGENTS.md` for the full workflow and conventions.
