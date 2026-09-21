# Viz V3 → V4 compatibility mappings

Researched and compiler-probed 2026-09-21. This companion covers compatibility mechanisms and local fit, not the complete CSS diff or browser validation. Production files were not changed.

## Main finding

A single V4 build with Viz's existing theme deserves testing. Compatibility should be driven by the actual V3.4.19 → V4.3.0 output diff, not a wholesale implementation of the V4.0 upgrade-guide table. Several supposedly removed names are accepted by the installed V4.3 compiler, and Viz already overrides some theme scales that the generic guide changes.

There are three different mapping tasks:

1. Preserve configured values through `@config`/theme values. This fixes many differences without class aliases.
2. Restore truly missing standalone utilities with `@utility` or a legacy plugin, including their variants.
3. Repair compositional semantics—opacity plus colors, child spacing, transforms, and cascade layers—which cannot be made faithful by renaming one utility in isolation.

## Native mechanisms

`@config` and `@plugin` are explicitly supported compatibility APIs. They can coexist with CSS-first `@theme`/`@utility`; CSS definitions can take precedence. JavaScript `safelist`, `corePlugins`, and `separator` are not supported. `@apply` inlines existing utility declarations and is useful for aliases. [Functions/directives](https://tailwindcss.com/docs/functions-and-directives#compatibility)

`@utility` registers custom utilities that receive responsive/state variants. Functional utilities accept theme, bare, and arbitrary values via `--value()`, with modifier support via `--modifier()`. Complex utilities can contain nested selectors. These are suitable building blocks, but the documentation does not promise that a same-name custom utility replaces a built-in one. [Custom utilities](https://tailwindcss.com/docs/adding-custom-styles#adding-custom-utilities)

Theme values can be overridden directly. When a theme token references another variable, `@theme inline` avoids resolving the intermediary variable at the wrong ancestor. This matters for Viz's semantic colors, Geist fonts, and radius/shadow variables. Do not blindly generate a non-inline `--shadow-sm: var(--shadow-sm)` self-reference while translating its config. [Theme overrides and variable references](https://tailwindcss.com/docs/theme#referencing-other-variables)

Safelisting remains supported through `@source inline()` with variants and brace-expanded ranges. For a faithful first comparison, feed V4 the actual V3-emitted class vocabulary. That avoids treating a changed scanning/safelist configuration as a compiler behavior change. [Safelisting](https://tailwindcss.com/docs/detecting-classes-in-source-files#safelisting-specific-utilities)

## Local configuration: simpler than the generic guide suggests

Sources inspected: `viz/tailwind.config.ts` and `viz/app/styles/globals.css`.

The config already customizes `rounded-sm/md/lg/xl`, every shadow size, Geist font families, semantic colors, two additional stone shades, dark mode, animation/container-query plugins, and radial/conic backgrounds. Therefore default-guide mappings such as `rounded-sm → rounded-xs` or `shadow-sm → shadow-xs` must not be applied indiscriminately: they can replace intentional Viz values.

Compiler probe results using unchanged `@config`:

| Candidate | V3.4.19 and V4.3.0 output relationship |
| --- | --- |
| `rounded` | Both use `0.25rem`. |
| `rounded-sm` | Both use `calc(var(--radius) - 4px)`. |
| `rounded-md` | Both use `calc(var(--radius) - 2px)`. |
| `rounded-lg` / `rounded-xl` | Both retain their configured `var(--radius)` expressions. |
| `font-sans` / `font-mono` | Both retain Geist variable plus generic fallback. |
| `bg-background` | Both directly use `var(--background)`. |
| `dark:bg-background` | Both use the `.dark` ancestor relationship. V4 represents it with nesting before optimization. |
| `shadow`, `shadow-sm`, `shadow-md` | Both retain the same `var(--shadow*)` payload. V4 changes shadow composition internals; these are not textual equivalents and still need browser tests with rings/colored shadows. |

This probe compiles utility declarations; it does not prove equivalence of base styles, loaded font values, inheritance, or combined controls.

## Version-specific surprises verified locally

Without any compatibility shim, V4.3.0 accepts `flex-grow`, `flex-grow-0`, `flex-shrink`, `flex-shrink-0`, `overflow-ellipsis`, `decoration-slice`, `decoration-clone`, and `bg-gradient-to-r`. It also accepts bare `blur` and `backdrop-blur`. The V4.0 [upgrade guide](https://tailwindcss.com/docs/upgrade-guide#removed-deprecated-utilities) lists several of the first names as removed. Use actual installed compiler output as evidence for the version being considered; do not implement redundant aliases.

The `bg-gradient-to-r` name survives, but its emitted gradient position includes `in oklab`, so accepted syntax does not imply unchanged interpolation. A name inventory alone cannot prove visual compatibility.

The probe's six separate opacity-family candidates (`bg/text/border/divide/ring/placeholder-opacity-50`) emit no rules in unmodified V4.3.0.

## Same-name `@utility` is additive: a real mapping trap

The following plausible mapping was tested against V4.3.0:

```css
@utility shadow-sm {
  @apply shadow-xs;
}
```

It emits **two** `.shadow-sm` rules. The custom smaller shadow comes first and the built-in larger shadow comes afterward; the intended mapping loses. `hover:shadow-sm` duplicates too. Likewise `@utility outline-none { @apply outline-hidden; }` duplicates the built-in name; the later `outline-style: none` can defeat the forced-colors restoration.

For scale values, the better native mapping is the theme token itself. A probe changing `--shadow-sm` emitted one correct `.shadow-sm`, preserved `hover:shadow-sm`, and left `shadow-lg` independent. For Viz, the unchanged config already provides the intended shadow token, so an extra alias is unnecessary.

For semantic primitives without a suitable theme token, a targeted emitted-rule replacement or a carefully scoped CSS override is a possible solution. Neither has been validated here. Avoid a universal later compatibility layer or blanket `!important`: a base-class override can then outrank unrelated state/responsive utilities and introduce new breakage. Prefer replacing the affected rule at its original variant/cascade position if an override is required.

Maintainer context: Tailwind sorts custom utilities according to property counts so broad component utilities remain overridable. Source order of custom declarations is therefore not an override contract. [Adam Wathan's explanation](https://github.com/tailwindlabs/tailwindcss/discussions/14363)

## Removed opacity APIs require coordinated rules

This functional utility compiles and gets hover variants:

```css
@utility bg-opacity-* {
  --legacy-bg-opacity: calc(--value(integer) / 100);
}
```

However, it does not restore `bg-red-500 bg-opacity-50`: V4 emits `background-color: var(--color-red-500)`, which never reads that variable. V3's separate opacity utility worked because the color rule consumed `--tw-bg-opacity`. A faithful shim must coordinate the color rule and the opacity variable, including reset/inheritance behavior, not just restore the missing variable-setting class. The relevant first-party implementations are [V3 core plugins](https://github.com/tailwindlabs/tailwindcss/blob/v3.4.19/src/corePlugins.js) and [V4 utilities](https://github.com/tailwindlabs/tailwindcss/blob/v4.3.0/packages/tailwindcss/src/utilities.ts).

Recommended cases: ordinary palette color + separate opacity; alpha-bearing color; slash-opacity color + separate opacity; hover-only opacity; nested text colors; border/divide/placeholder targets; and semantic raw-variable colors. Viz's `var(--background)` colors did not necessarily participate in the V3 opacity-variable mechanism, so preserving compatibility means checking the old result rather than making every combination newly work.

## Local CSS needs layer repair, not saved-source rewrites

Viz puts `.responsive-text .text-*`, `.gap-*`, `.p-*`, `.mt-*`, and related overrides in `@layer components`. V3's synthetic layers compile away, allowing their higher selector specificity to beat regular utilities. In V4, native `utilities` outranks `components` independently of selector specificity. Merely changing the Tailwind import can disable responsive slideshow typography/spacing.

Move these deliberate utility overrides to a layer where the existing specificity relationship works, then verify state/responsive interactions. This is a finite local CSS fix. Separately, move `leading-96p/103p/123p/140p` definitions from the old synthetic utilities block into top-level `@utility` declarations so `.slide-heading*` can keep applying them. A probe confirmed `@utility leading-96p { line-height: 0.96; }` supports both `@apply leading-96p` and `md:leading-96p`.

The existing responsive `space-y-*` rules set top margins while V4's built-ins use bottom margins. Even after fixing layer placement, mixed top/bottom declarations can double spacing unless the old family is replaced coherently. This is a priority interaction test, not an argument for rewriting every Frame. [Space-selector change](https://tailwindcss.com/docs/upgrade-guide#space-between-selector), [cascade-layer precedence](https://drafts.csswg.org/css-cascade-5/#layer-order)

Viz's base `* { @apply border-border; }` already replaces the generic border default for elements. Its semantic border should therefore be tested before adding the guide's gray-200 fallback indiscriminately. Pseudo-elements and file inputs require separate coverage.

## Highest-value browser checks

1. Existing responsive-text slideshow at narrow/wide viewport and in print: text size, line height, gaps, padding, space-y.
2. Configured radius and shadows in light/dark themes, including rings and shadow colors.
3. Existing gradient endpoints and interpolation, ordinary palette versus semantic colors. V4's default palette was modernized, so preserving Viz's extensions alone does not pin unmodified V3 palette shades. [V4 palette change](https://tailwindcss.com/blog/tailwindcss-v4#modernized-p3-color-palette)
4. Opacity combinations described above; confirm expected unsupported/no-op old combinations too.
5. Outline restoration with forced colors, focused/unfocused state, and explicit width/color overrides.
6. Space/divide children including hidden children, explicit child margins/borders, and inline children.
7. Transform reset and custom transitions, plus named/unnamed container-query variants and animation plugins.

## Reproduction artifacts

`probe-utility-mappings.mjs REPO OUTPUT` runs compiler-only probes. It writes `utility-mapping-observations.json` and `probe-*.css` to the output directory. Installed versions: V3.4.19 and V4.3.0. See the [reproduction commands](README.md#reproduction).

No conclusion here depends on accessing or rewriting the persisted corpus. The full vocabulary diff and representative browser comparisons determine the actual compatibility work remaining.

## Follow-up: shared container namespace is not faithfully imported

The earlier `@config` examples prove preservation of those particular theme values, not all V3 scales. V4 uses `--container-*` for both size utilities and container-query thresholds. Viz's V3 `maxWidth`/`columns` scales and its container-query plugin's `containers` scale intentionally differ. The V4 documentation shows the shared namespace in [max-width](https://tailwindcss.com/docs/max-width), [columns](https://tailwindcss.com/docs/columns), and [container-query customization](https://tailwindcss.com/docs/responsive-design#using-custom-container-sizes).

Local compiler results:

| Candidate | Viz V3.4.19 | V4.3.0 + unchanged Viz `@config` |
| --- | --- | --- |
| `max-w-lg` | `32rem` | `64rem` |
| `columns-lg` | `32rem` | `64rem` |
| `@lg:bg-red-500` | Minimum container width `64rem` | Minimum container width `32rem` |
| `@lg/main:bg-red-500` | Named query at `64rem` | Named query at `32rem` |
| `columns-2xs`, `columns-3xs` | `18rem`, `16rem` | No output |

Both directions change: importing the old extension affects size tokens while the retained plugin sees a different threshold scale. Overriding `--container-lg: 32rem` or explicitly copying V3's `theme.maxWidth` repairs sizes but still leaves the wrong container query. This is a local configuration migration task; it does not require changing saved Frame classes.

A compiler prototype removed `theme.extend.containers` and the old container-query plugin, retained the remaining Viz configuration, and registered the resolved V3 thresholds as literal values with `matchVariant`. Native V4 `@container`, `@container/main`, and `@container-normal` continued to compile. Size utilities then regained their V3 values, including `columns-2xs/3xs` automatically. These two names are therefore config fallout, not removed V4 utilities.

**Ordering caveat:** replacing the existing `@` variant with `matchVariant('@', …)` restored threshold values but did not fully restore their cascade. It emitted `@2xl` (`42rem`) after `@xl` (`80rem`). In V4.3.0, replacing an existing variant retains its original order group; the native group's comparator continues to use the size-token scale instead of the replacement plugin's sorting callback. See the first-party [variant registry implementation](https://github.com/tailwindlabs/tailwindcss/blob/v4.3.0/packages/tailwindcss/src/variants.ts) and [legacy container plugin ordering](https://github.com/tailwindlabs/tailwindcss-container-queries/blob/main/src/index.ts).

A second prototype successfully restored values **and the probed query ordering** by registering a distinct internal `legacy-container` variant, translating compiler candidates into that variant, and restoring the original emitted selector class names afterward with a selector parser. This preserves saved source. It is a proof of a possible compiler compatibility adapter, not a production implementation: the probe handles only its known simple candidates; a real adapter must parse stacked/arbitrary variants correctly, preserve group/peer selectors, and test ordering against other variant families. A coherent emitted-rule transformation is another option. A single theme override or one same-name plugin declaration is not a complete fix.

## Follow-up: mappings for the seven other missing names

After fixing the container-scale import, only five of the seven non-opacity names require aliases in this probe:

```css
@utility blur-0 { @apply blur-[0px]; }
@utility backdrop-blur-0 { @apply backdrop-blur-[0px]; }
@utility -order-first { order: 9999; }
@utility -order-last { order: -9999; }
@utility -order-none { order: 0; }
```

All five and their `md:` variants compiled successfully. The negative-order values exactly match V3's declarations. Do not alias them to V4 `order-last/first`: V4 now uses infinite endpoint values, which differ when mixed with arbitrary order values beyond `9999`. [Current order utility values](https://tailwindcss.com/docs/order)

For zero blur, `@apply blur-none` is a tempting but less faithful mapping: V4 removes that filter function, while V3 emitted `blur(0)`. A non-`none` filter creates a containing block and stacking context even when visually neutral. The tested `blur-[0px]` aliases preserve a zero-valued filter function and participate in V4's filter composition. Browser checks with fixed-position children and combined filters are still required. [Filter effects specification](https://www.w3.org/TR/filter-effects-1/#FilterProperty)

Reproduce with `node design_docs/viz_tailwind_css_audit/probe-container-mappings.mjs REPO OUTPUT` from the repository root. Evidence is in `container-mapping-observations.json` and `container-*.css`; `splitContainers` demonstrates the ordering defect, `splitContainersAlias` demonstrates the bounded corrected output, and `faithfulMissingMappings` demonstrates the five aliases plus automatically restored column sizes. These are compiler experiments, not an integrated migration.
