# Existing tools for mixing unchanged Sparkle/V4 with Viz/V3

Researched 2026-09-21. Scope: reusable packages and platform mechanisms; no production implementation. Sparkle cannot change; existing saved Frames/slideshows must keep working; new Sparkle controls must coexist within those documents.

The follow-up [CSS audit and global compatibility prototype](viz_tailwind_css_audit/README.md) measures the single-V4 route.

## Conclusion

I found established tools for **parts** of the problem, but no verified turnkey package that isolates an unchanged unprefixed V4 React library from an existing unprefixed V3 app, including globals, portals, and nested legacy content. Keeping both generated CSS versions would require a Viz-owned build/runtime adapter. This is an evidence-based assessment of the inspected tools, not a claim that no other solution exists.

After auditing the official upgrade guide, a single V4 renderer with preserved Viz theme values and targeted legacy compatibility also deserves a bounded proof before committing to dual-version infrastructure. The coexistence failures below do not prove that existing Frame source cannot run under V4. Neither route is yet validated against saved Frames and mixed Sparkle components.

The most promising light-DOM design is **two-way style boundaries**: keep V3 semantics outside explicit Sparkle roots, restrict processed Sparkle CSS to those roots, and include Sparkle portals in the same boundary scheme. Use existing PostCSS tooling for selector rewriting; consider native `@scope` only after checking Viz's browser floor. Namespace V4 internal registered properties and conflicting animation names in the consumed artifact if actual output contains collisions. These are implementation recommendations, not guarantees supplied by an upstream package.

## Available building blocks

| Tool/pattern | What it actually solves | Remaining gap here |
| --- | --- | --- |
| `postcss-prefix-selector` | Adds an ancestor selector to compiled CSS; replaces `html`, `body`, and `:root` with the namespace; exposes a custom transform. | Does not prevent existing V3 selectors from matching Sparkle descendants. Its implementation visits rules, not global registration names. Portals require explicit boundaries. |
| `postcss-prefixwrap` | Another established compiled-CSS wrapper, including root handling, file filters, and custom prefix transforms. | Same one-way protection. Native nesting needs explicit handling (`nested: "&"` is documented). |
| `tailwindcss-scoped-preflight` | Tailwind plugin that scopes the reset inside a root or excludes roots from it; supports nested exceptions. Maintainer now supports V4 with CSS-first configuration and retains separate V3 docs. | Only preflight. It requires replacing the global preflight import and therefore is not a drop-in transform of Sparkle's already-built CSS. Utilities, theme globals and portal behavior remain separate. |

Sources: package-maintained [prefix-selector README](https://github.com/RadValentin/postcss-prefix-selector), [prefix-selector implementation](https://github.com/RadValentin/postcss-prefix-selector/blob/master/index.js), [prefixwrap README](https://github.com/dbtedman/postcss-prefixwrap), and [scoped-preflight README](https://github.com/Roman86/tailwindcss-scoped-preflight). These are third-party tools, not Tailwind-owned compatibility layers.

Tailwind maintainer **Philipp Spiess** documents scoping generated V4 utilities by placing `@tailwind utilities` inside a selector. His example deliberately leaves theme and preflight as separate imports. That validates utility scoping as a supported technique, but does not provide complete isolation of a finished library or solve V3 ingress. The same discussion's recommendation of scoped-preflight is by a community contributor, not the maintainer. [Tailwind discussion #16325](https://github.com/tailwindlabs/tailwindcss/discussions/16325)

## Native `@scope`: useful, with two important limits

An upper/lower-bound scope can express “V3 applies from the document root until a Sparkle root”; a separate scope can apply Sparkle rules within that root. The boundary itself is excluded by the lower limit, and `:scope` can target the upper root. This avoids renaming component class strings and preserves selector specificity. However, scope proximity becomes an additional cascade tie-breaker, so wrapping existing styles is not automatically behavior-neutral. [CSS Cascade Level 6](https://drafts.csswg.org/css-cascade-6/#scope-atrule)

`@scope` limits selector matching, **not inheritance**. Inherited color/font/custom properties can cross the lower boundary. Each style root needs explicit baseline/theme decisions. [Chrome's implementation guide](https://developer.chrome.com/docs/css-ui/at-scope)

Globally named at-rules such as `@keyframes`, `@font-face`, and `@layer` retain their global names inside `@scope`. Wrapping the entire V4 stylesheet in `@scope` does not isolate those names. [CSS Cascade Level 6, nesting](https://drafts.csswg.org/css-cascade-6/#scope-nesting)

Browser floor matters: `@scope` shipped in [Chrome 118](https://developer.chrome.com/blog/new-in-chrome-118/), [Safari 17.4](https://webkit.org/blog/15063/webkit-features-in-safari-17-4/), and [Firefox 146](https://www.firefox.com/en-US/firefox/146.0/releasenotes/). This is stricter than Tailwind V4's documented Chrome 111 / Safari 16.4 / Firefox 128 baseline. Native scope should not silently replace V3 CSS for browsers where it would be ignored. [Tailwind compatibility](https://tailwindcss.com/docs/compatibility)

## Cascade layers do not isolate components

Layers choose which matching declaration wins. They do not restrict matching to component ownership. Unlayered normal declarations outrank normal declarations in explicit layers, even with lower selector specificity. Therefore loading layered V4 CSS after unlayered V3 CSS need not make V4 win. Conversely, making all V4 rules globally win can change legacy content. Names in at-rules also participate in layer ordering rather than acquiring private component namespaces. [CSS Cascade Level 5](https://drafts.csswg.org/css-cascade-5/#layer-order)

Practical inference: layers can organize the final isolated output but are insufficient as the sole compatibility mechanism. A selector wrapper's higher specificity also cannot overcome the unlayered-versus-layered ordering rule.

## Registered custom properties are a document-wide concern

The CSS Properties and Values API defines a **single registration map per Document**, including registrations declared in shadow trees. The registration changes the named property's syntax, initial value, and inheritance behavior wherever it is used. This applies independently of ordinary selector scoping. The specification recommends likely-unique names for private properties. [CSS Properties and Values API, Shadow DOM](https://drafts.css-houdini.org/css-properties-values-api/#shadow-dom)

Inference for a compiled-CSS adapter: if Sparkle's V4 CSS registers names that V3 also uses (for example `--tw-*`), isolating selectors alone cannot establish unchanged V3 behavior. Inspect collisions and, where needed, rewrite the V4 registration name **plus every declaration and reference**. Do not blindly rename external custom-property interfaces used by Radix or inline JavaScript.

This exact V3/V4 gradient collision has already occurred in production. WXT's Shadow Root UI extracted V4 registrations into the document; V4 registered `--tw-gradient-from` as `<color>`, but V3 assigns a composite color-plus-position value. The global type constraint rejects the V3 value. This report was filed by the affected Read Frog project's maintainer, rather than a Tailwind maintainer. [WXT issue #1955](https://github.com/wxt-dev/wxt/issues/1955)

Read Frog merged a targeted fix on 2025-10-27: a PostCSS plugin after Tailwind changes the `--tw-` prefix in registration parameters, custom-property definitions, and nested `var()` references. This is an existing implementation pattern for the global-variable problem. It was exported from their **private monorepo `@repo/ui` package**, not published as a standalone compatibility dependency. It does not solve selector collisions in a shared light-DOM document. [Merged PR #655](https://github.com/mengxi-ream/read-frog/pull/655), [package metadata at the merged commit](https://github.com/mengxi-ream/read-frog/blob/08a47a56066fc6fc2ad965b68221e56d4206859c/packages/ui/package.json)

The corresponding WXT framework options are **not shipped fixes**: live GitHub API checks on 2026-09-21 show both [PR #2005, `cssPropertyRename`](https://github.com/wxt-dev/wxt/pull/2005) and [PR #2446, scoped registered properties](https://github.com/wxt-dev/wxt/pull/2446) open and unmerged. Therefore do not recommend a WXT configuration switch as an available solution.

A focused local browser reproduction used Viz's installed V3 compiler/configuration and the current `sparkle/dist/sparkle.css` registrations in headless Chromium. The existing slideshow gradient changes from white/stone-50 to transparent/transparent after injecting only Sparkle's `@property` rules. Putting those rules inside `@scope(.sparkle-zone)` still breaks it even when no Sparkle subtree exists. Renaming the registration names in this focused experiment preserves the baseline. This validates the global collision and the need for name isolation; it does **not** validate full Sparkle component compatibility. The measured values were:

| Case | Existing V3 gradient |
| --- | --- |
| Baseline | `linear-gradient(rgb(255, 255, 255), rgb(250, 250, 249))` |
| Add only V4 registrations | `linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0))` |
| Put those registrations inside `@scope(.sparkle-zone)` | Same transparent gradient |
| Rename registration names to `--viz-sparkle-tw-*` | Matches baseline |

Font weight (500), radius (7.2px), and padding (16px) remained unchanged in this focused reproduction. No actual mixed Sparkle controls were exercised. The registration-only rename is an experimental control, not a complete fix: production would also need to update corresponding declarations/references in the V4 CSS. Reproduce with [verify-gradient.mjs](viz_tailwind_css_audit/verify-gradient.mjs). It writes `gradient-observations.json` to the chosen output directory. See the [reproduction commands](viz_tailwind_css_audit/README.md#reproduction).

## Shadow DOM is real isolation, but not transparent for this library family

Shadow roots isolate selector matching, but named CSS features have caveats. Google's browser-engine report specifically documents global `@property` semantics and implementations that ignore registrations inside shadow roots. It is a 2024 report, so treat it as an explanation of the risk; re-test current target engines rather than assuming every listed historical bug remains. [Chrome CSS names/shadow DOM report](https://developer.chrome.com/docs/css-ui/css-names)

Radix portals append to `document.body` by default; the primitive exposes a custom `container`. A Sparkle wrapper must actually expose/forward that API for Viz to use it. We cannot infer that from Radix alone. [Radix Portal documentation](https://www.radix-ui.com/primitives/docs/utilities/portal)

An upstream **user bug report**, still displayed open when checked, demonstrates Dialog focus trapping and scrolling failures after portalling into a shadow root. It reports Radix Dialog 1.1.2–1.1.4, React 17–18, Chrome 132, and points to `document.activeElement`; this is not maintainer confirmation that every current version fails. It is a strong targeted test case before choosing Shadow DOM for unchanged Sparkle. [Radix issue #3353](https://github.com/radix-ui/primitives/issues/3353)

## Suggested proof if keeping both versions

1. Preserve existing source and V3 compilation. Process CSS only at Viz's integration boundary; load V4 output separately from the V3 Tailwind processor.
2. Prove a Sparkle root with existing PostCSS selector tooling, plus a V3 exclusion boundary, before attempting full library exposure. Validate explicit V3 content nested in Sparkle slots too: a one-way “all descendants are Sparkle” rule is insufficient for arbitrary composition.
3. Inspect actual compiled `@property`, keyframes, root tokens, native layers, and nesting. Add only the transformations justified by observed collisions.
4. Verify normal and portalled controls, keyboard focus/scroll, light/dark state, and slide printing. Compare representative saved Frames/slideshows before/after; do not describe isolation as complete solely because a Button renders correctly.

The first proof should answer whether Viz can enforce component/portal boundaries without changing Sparkle. If it cannot, a CSS package alone will not remove that runtime integration requirement.


## Fit to the current repository

- [Viz's root layout](../viz/app/layout.tsx) imports one global V3 stylesheet for all render paths. [The V3 config](../viz/tailwind.config.ts) broadly safelists utilities because saved/generated Frame source is not available at app build time.
- [Slideshow controls](../viz/components/dust/slideshow/styles.ts) use `bg-gradient-to-b from-white to-stone-50`, the same gradient classes tested above. Both slideshow versions share those controls and Viz's stylesheet.
- [Nested Frame resolution](../viz/app/components/VisualizationWrapper.tsx) evaluates imported Frames as React modules within the same document; switching stylesheet by outer Frame version alone would not solve mixed legacy imports.
- [Sparkle packaging](../sparkle/package.json) provides an ESM entry and a separate compiled `dist/sparkle.css` export. Viz can process a consumed copy of that CSS without editing Sparkle source or its published package. This still creates a Viz-owned integration artifact; it is not loading Sparkle CSS byte-for-byte unchanged.
- Live Sparkle Storybook MCP was consulted for Button and Tooltip. Tooltip documents `mountPortalContainer`; this supports an explicit portal container for that component, but cannot be generalized to every Sparkle overlay.

No production source, dependencies, saved Frames, or Sparkle files were changed by this investigation. The next implementation must demonstrate unchanged representative V3 Frames and both slideshow versions, plus mixed controls and portals, before treating the approach as validated.

## Upgrade guide audit: single V4 versus keeping V3 CSS

The guide documents compatibility overrides for border/ring defaults, placeholders, button cursors, dialog margins and hover behavior. Bare shadow/radius/blur utilities and leading `!` remain supported. Semantic differences still include small scales, outlines, spacing/divider selectors, gradient variants, stacked variants, arbitrary-value syntax, hidden attributes and transform resets/transitions. These need targeted compatibility or source migration; the project upgrader cannot automatically reach separately stored Frames. [Official upgrade guide](https://tailwindcss.com/docs/upgrade-guide#changes-from-v3)

JavaScript configuration/plugins can be retained incrementally through `@config` and `@plugin`. [Compatibility directives](https://tailwindcss.com/docs/functions-and-directives#compatibility) Safelisting can use `@source inline()` with variants and brace ranges, so migrating Viz's existing broad safelist is engineering work, not an inherent blocker. A replacement must preserve the classes currently available to saved content; scanning just the checked-in components is insufficient. [Source detection and safelisting](https://tailwindcss.com/docs/detecting-classes-in-source-files#safelisting-specific-utilities)

Repository-specific observations narrow the generic migration list:

- Viz already defines custom shadow values, radius calculations, and a universal `border-border` base rule. Preserving these definitions matters more than blindly applying default-theme renames.
- Existing slideshow V1 uses `space-y-2` and `space-y-8`; the shared drawer uses `outline-none`. These are concrete selectors to compare, rather than hypothetical use of every deprecated utility.
- Both slideshow navigations use `left-1/2 -translate-x-1/2`. Their shared controls use the gradient already reproduced above.
- Sparkle's theme is independently different: in the local fixture, `text-3xl font-semibold` renders at 32px/550 with Sparkle CSS and 30px/600 with Viz CSS. A Tailwind engine upgrade alone does not reconcile those theme expectations.
- Current generated-Frame lint rejects arbitrary class values, reducing that issue for compliant new content. It does not establish the syntax used in historical saved content.

A second headless Chromium fixture used Viz's actual globals/config with only the unrelated `tw-animate-css` import removed, plus the current compiled Sparkle CSS. The 100px navigation element sits in a 400px parent. These are measured results, not an upgraded-Viz prototype:

| Stylesheets | Navigation left | Gradient |
| --- | --- | --- |
| Viz V3 only | 150px, centered | White to stone-50 |
| Viz V3 + raw Sparkle V4 | 100px, shifted left | Transparent |
| Viz V3 + Sparkle with private `--tw-*` names | 100px, shifted left | Original gradient restored |

The mixed output simultaneously has V3 `transform: matrix(..., -50, 0)` and V4 `translate: -50%`; the browser composes both. Renaming internal variables does not separate ordinary selectors. Sparkle-only CSS centers this fixture correctly, but changes its theme and does not supply all its legacy gradient colors. This reinforces two distinct conclusions: raw dual loading breaks real existing styles, while replacing V3 with V4 remains a separate option requiring its own compatibility proof.

Reproduce with [verify-upgrade-effects.mjs](viz_tailwind_css_audit/verify-upgrade-effects.mjs), which writes `upgrade-observations.json` to the chosen output directory.

Next step: compare representative saved Frames and both slideshow versions under a single V4 build preserving Viz's theme and class coverage; measure the required compatibility rules before choosing dual-version isolation. Mixed Sparkle roots must still preserve their own theme, and portal/slot composition still needs validation. No saved-Frame corpus or full migrated renderer was tested in this investigation.
