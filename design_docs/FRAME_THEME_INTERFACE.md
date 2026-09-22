# Frame themes through existing Tailwind tokens

Date: 2026-09-22
Status: selected after local authoring trials, implemented on `flav/frame-theme-authoring`.

## Decision

Pass the theme to the content's root. Pages and dashboards use `FrameRoot` from `@dust/frame`. Presentations use `Slideshow` from `@dust/slideshow/v2`. Both accept the same optional `FrameTheme`, with ordinary CSS variables consumed by existing semantic Tailwind classes.

```ts
import type { FrameTheme } from "@dust/frame";

export const theme = {
  "--primary": "#315b8c",
  "--primary-foreground": "#ffffff",
  "--font-serif": "Georgia, 'Times New Roman', serif",
  "--radius": "0.75rem",
} satisfies FrameTheme;
```

For a page:

```tsx
import { FrameRoot } from "@dust/frame";
import { theme } from "./theme";

export default function App() {
  return (
    <FrameRoot theme={theme} className="space-y-6 p-8">
      <h1 className="font-serif text-4xl">Quarterly report</h1>
      <p className="text-primary">A clearer path to launch.</p>
    </FrameRoot>
  );
}
```

For a presentation:

```tsx
import { Slideshow, Slide } from "@dust/slideshow/v2";
import { theme } from "./theme";

export default function App() {
  return (
    <Slideshow theme={theme}>
      <Slide><h1 className="font-serif text-4xl">Quarterly report</h1></Slide>
      <Slide>Next steps</Slide>
    </Slideshow>
  );
}
```

This is one theme interface on two existing content roots. The skill teaches one recipe per content type. It does not offer a competing wrapper recipe for decks or ask the model to wire each color through `var(...)`.

## Runtime behavior

`FrameTheme` accepts custom-property names beginning with `--` and string or number values. Values override variables within the root's subtree. Omitted variables inherit from ancestors, including the host's light or dark defaults. Themes compose with ordinary object spreads and nested scopes.

`FrameRoot` adds the baseline `bg-background font-sans text-foreground` classes, without padding, sizing or typography hierarchy. Its ordinary `className` and `style` props remain available. Explicit style values override theme entries.

Slideshow applies the theme to its existing root in both interactive and PDF modes. It adds no wrapper, changes no viewport sizing and preserves the native fullscreen target. Its existing navigation controls keep their own styling. Without a theme prop, its appearance is unchanged.

The existing color, border, radius, shadow and chart variables already power semantic utilities. The font utilities now also consume `--font-sans`, `--font-serif` and `--font-mono`. Their default values preserve the previous utility font stacks. The CSS build explicitly includes `font-serif` so it remains available without any local component or story using it. Fixed palette classes such as `bg-red-500` continue to use their fixed colors.

The source file is explicitly imported. There is no filename autoload, manifest field, provider or preset catalog. A theme file is optional unless source imports it. The skill mounts a small editable `theme.ts` example. It is stored as `theme.ts.txt` in Front because its type import belongs to the sandbox's Viz declarations, not Front's TypeScript project.

## Why the navigation moved

The reported draft placed `Slideshow`, which already has viewport height, below a page header inside a padded `main`. The controls remained correctly positioned at the bottom of that taller page, below the initial viewport.

An isolated reproduction at a 700px viewport confirmed the same geometry with and without `FrameRoot`: the slideshow started at 52px, its controls ended at 728px, and the document was 804px tall. With a root slideshow, it started at 0px and controls ended at 676px.

The skill now places every presentation header, footer and layout inside a Slide. It passes the theme directly to Slideshow. FrameRoot does not attempt to repair arbitrary page layout or move navigation using offsets.

## Authoring experiment

Six independent Codex drafts attempted the same three-slide product review, with a warm paper theme, serif headings, a header and footer, two metrics and next steps. Three APIs were compared across two rounds:

| Variant | Authoring form | Result |
| --- | --- | --- |
| Wrapper | `FrameRoot theme` around `Slideshow` | Correct API and root composition in both drafts |
| Direct theme | `Slideshow theme` | Correct API and root composition in both drafts |
| Native style | `Slideshow style` | Correct API and root composition in both drafts |

The first round included explicit composition and Tailwind constraints. The second used shorter API examples. All six drafts passed TypeScript checks against their corresponding implementation and bundled with the existing Frame builder.

All three guided drafts passed the existing Tailwind validator. All three shorter-prompt drafts used forbidden arbitrary utilities and would need repair before publishing. Preserve the normal utility restrictions whichever theme API is chosen. The validator failure counts are not evidence that one theme API is superior.

Browser checks covered three slides at desktop and mobile widths for each draft, six native fullscreen checks, and three PDF rendering-mode stories. Navigation remained within the viewport and theme variables and heading fonts were inherited. These checks do not establish polished layout: visual inspection still found content overlapping navigation or the preview trigger, and layouts degraded by unsupported utilities. The drafts were preserved without repairs.

This small qualitative experiment shows all three APIs are learnable. It does not establish a statistical reliability winner or predict production-agent performance. Direct theme is selected because it keeps the existing presentation root and avoids introducing a second layout container. A general `style` prop would expose arbitrary root layout changes when the intended operation is applying theme variables.

Local evidence, drafts and comparison previews are under `/private/tmp/dust-slideshow-theme-api` and `http://localhost:6030`. The isolated reproduction is in `/private/tmp/dust-slideshow-layout-results.json`. These temporary harnesses are not application dependencies.

## Naming and prior experiments

An earlier generated entry named `Frame` returned `<Frame theme={theme}>` without importing a wrapper, recursively rendering itself. `FrameRoot` separates the public wrapper from that common entry name. The skill names its entry `App`. The declaration tests cover the observed mistakes, without pretending to prohibit all recursive React components.

The art-director prototype at `653b994081` on `flav/frame-slideshow-art-director` explicitly imported `theme.ts` and passed it to `Deck`. It did not autoload a filename. Its preset catalog is deliberately excluded here.

An earlier separate-token prototype required repeated manual variable consumption. Using the existing semantic utilities removed that repetitive wiring in later authoring trials. No new parallel `--frame-*` palette is introduced.

## Validation and limits

Focused tests cover sandbox declarations, rejected theme values, import allowlists, bundling, skill attachment, unchanged slideshow roots, removal of a theme, PDF page breaks and existing fullscreen/navigation behavior. All 72 focused tests pass. All 15 isolated browser stories pass against freshly compiled Viz CSS, including the selected implementation and the authoring drafts. The new production font assertions also pass in a clean browser page. The full existing style script was not run because the local dev server has no production coverage report.

Front type checking passes. Viz type checking passes with an ES2020 target, matching the sandbox declarations. The repository's unchanged Viz configuration defaults to ES5 and has two pre-existing target errors in `transformEditableText.test.ts`. Contract tooling is unavailable locally, so applicable contracts were reviewed manually.

Themes do not compile new Tailwind classes, load fonts, choose heading sizes, guarantee contrast or style portals mounted outside their subtree. Full product sharing and PDF download were not exercised by the local browser harness. The tests of PDF mode verify rendering and page-break structure only.

This change is independent of Document rendering, file revisions and collaboration. Future document styling can consume the same semantic variables and add specific roles only where needed.

Deploy Viz before Front advertises the new import and prop. Once Frames use the new API, keep the Viz runtime exports available even if the skill guidance is rolled back.
