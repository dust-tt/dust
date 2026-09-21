# Viz styles

`app/layout.tsx` loads the shared global stylesheet for Frames and both slideshow versions. Tailwind V4 supplies its own preflight, palette, and utility behavior. Viz keeps its existing semantic theme and slideshow styles. There is no V3 compatibility adapter.

The default V4 theme is imported with `theme(inline)` so its values compile directly into utilities, avoiding repeated variable-color fallback rules across the broad safelist. Overriding default theme variables at runtime will not retheme those utilities. Viz's configured semantic colors still reference its live light/dark variables.

`tailwind-v3-safelist.css` retains the 151,563 candidates from the previous V3 build because Frame code arrives at runtime. V4 generates the candidates it recognizes, together with utilities found in Viz's local components. This is not an exhaustive catalog of V4 utilities. Frame instructions continue to require predefined utilities and the `style` prop for exact values.

Every production build compares the safelist with class selectors in the actual emitted CSS and writes `public/tailwind-coverage.json`. That generated report contains the missing classes, coverage counts, build ID, and stylesheet hashes. Run `npm run audit:tailwind --workspace viz` to regenerate it from an existing production build.

Rendered Frames fetch this small report and observe class usage, including nested Frames, portals, and later DOM updates. Each missing class is reported once per observer to the existing host logger, in batches of at most 50. Search Datadog for `Frame uses unavailable Tailwind classes`, with `classNames`, `fileId`, `workspaceId`, `conversationId`, and `buildId` fields. The host validates the message and checks its iframe source and identifier. Diagnostics never set the Frame's error state.

This measures usage of dropped safelisted V3 classes, not arbitrary unknown class names or visual changes to classes that still compile. Reports are skipped when unavailable or when their stylesheet hashes do not match the loaded page. An older host or a standalone Viz page without the host logger will not record events. Deploy the host receiver before Viz to collect rollout data.

A native V4 upgrade can change existing Frames even when every class name exists. Removed opacity utilities no longer work, while slash syntax such as `bg-black/80` does. Default colors, preflight, blur/ring scales, spacing/divider selectors, transforms, outlines, and hover behavior can differ. Review representative saved Frames and slideshows against [Tailwind's upgrade guide](https://tailwindcss.com/docs/upgrade-guide#changes-from-v3) before rollout. Sparkle integration remains separate.

To validate the production styles and runtime diagnostics, from the repository root:

```sh
NODE_ENV=production npm run build --workspace viz
ALLOWED_VISUALIZATION_ORIGIN=http://localhost:3007 npm run start --workspace viz -- --port 3007
# In another terminal, after installing Playwright Chromium if needed:
npm run test:styles --workspace viz -- http://localhost:3007
```

The browser check exercises slash opacity, V4's handling of removed opacity classes and hidden elements, slideshow typography/spacing/centering, gradients, hover, responsive classes, and dark mode. It also renders runtime code through the RPC wrapper, imports a child Frame, and checks diagnostic messages for initial and dynamically added classes without duplicates. It does not scan persisted Frames or prove visual equivalence across browsers.
