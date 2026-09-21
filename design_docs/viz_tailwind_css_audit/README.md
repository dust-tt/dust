# Viz V3 → V4 CSS audit and missing-class prototype

2026-09-21. Installed compilers: Tailwind 3.4.19 and 4.3.0. Sparkle source and the active Viz renderer are unchanged.

## Context

Viz renders saved Frames and both slideshow versions with Tailwind V3. We want to use Sparkle inside that existing content without changing Sparkle or rewriting saved Frame source. Sparkle ships Tailwind V4 CSS with overlapping utility names and global registrations. Its ESM JavaScript entry does not isolate these CSS effects or establish the integration payload size.

Loading both stylesheets together breaks existing gradients and applies some transforms twice. The [coexistence investigation](../VIZ_TAILWIND_COEXISTENCE_RESEARCH.md) covers those reproductions and existing upstream tools. This audit evaluates the other route: one V4 renderer with central compatibility rules for existing V3 content.

## Result

A global compatibility stylesheet can restore the **133 missing class names** in the current generated Viz vocabulary. The checked-in prototype is `tailwind-v3-compat.css`, with a generator to reproduce it. It must be compiled by Tailwind V4; it is not an additional V3 runtime.

The small part is seven width/order/zero-blur mappings. The substantial part is six old separate-opacity APIs: their color utilities must also consume the old alpha values. The prototype copies only the relevant color declarations, preserving existing ordering and applying them only to elements carrying a matching legacy opacity class. Normal V4 elements do not match these guards. Private alpha variable names avoid changing native Tailwind variables; the ring color variable remains shared because V4 consumes it.

**This is a migration prototype, not a completed V4 upgrade.** It is not imported by the active app. It preserves a finite emitted vocabulary; it does not promise arbitrary newly constructed variants, all saved Frames, or all Sparkle components are compatible.

## Complete emitted-class inventory

The V3 build uses Viz's current `tailwind.config.ts`, source globs, broad safelist, and `globals.css`. The V4 candidate uses the same JavaScript configuration via `@config`, a V4 import, and the exact class names found in the V3 output. Four local `leading-*p` definitions move to `@utility` so existing `@apply` calls compile. No other compatibility repair is included in the initial diff.

| Outcome | Class names |
| --- | ---: |
| Matching normalized rule text, ignoring layer placement | 2,077 |
| Changed normalized selectors, conditions or declarations | 149,609 |
| Missing from V4 | 133 |
| Invalid in the baseline normalizer, valid in V4 | 1 |
| Total | **151,820** |

Of these, 151,563 have V3 generated-candidate metadata; 257 are other selector names, including group/peer anchors and custom selectors. The inventory is exhaustive for this compilation, not the persisted Frame corpus. Layer changes are recorded separately even for matching rule text. A text difference is not automatically a visual regression, and matching text does not establish equivalent cascade behavior.

`classes.csv` lists every name/status/family. `class-diff.jsonl.gz` includes every class's before/after rules, declarations, conditions and layers. `globals.json` retains non-class rules, registrations, keyframes and other global at-rules. Raw and normalized complete stylesheets are included in the generated audit output directory.

Normalization uses Lightning CSS to lower nesting and canonicalize syntax. It records 56 V3 warnings: imported V4-only animation directives and one invalid `--spacing()` declaration. The latter is explicitly classified instead of silently counted as a match. Unmodified raw outputs are retained as the reference. The V3 animation CSS import is expanded as the bundler would include it; V3 leaves that package's unknown build-time directives uninterpreted, while V4 activates them.

## All missing names

| Group | Count | Compatibility approach |
| --- | ---: | --- |
| `bg-opacity-*`, `text-opacity-*`, `border-opacity-*`, `divide-opacity-*`, `placeholder-opacity-*`, `ring-opacity-*` | 126 | 21 values per family: 0 through 100 in increments of 5. Restore alpha setters **and** affected color rules. |
| `blur-0`, `backdrop-blur-0` | 2 | `@utility` + `@apply blur-[0px]` / `backdrop-blur-[0px]`; keeps a zero filter rather than removing the filter. |
| `-order-first`, `-order-last`, `-order-none` | 3 | Exact V3 constants: 9999, -9999, 0. |
| `columns-2xs`, `columns-3xs` | 2 | Exact widths 18rem and 16rem. These also return when the container configuration is correctly migrated. |

The V4.0 upgrade guide is not an exact inventory of V4.3 behavior. Our installed V4.3 already emits `flex-grow`, `flex-shrink`, `overflow-ellipsis`, `decoration-slice`/`clone`, and directional `bg-gradient-to-*`. Do not add redundant aliases based solely on that guide.

## What the difference review found beyond missing names

| Family/change | Observed consequence | Appropriate repair |
| --- | --- | --- |
| Custom radius, shadow and semantic color tokens | The existing `@config` retains their declarations; no blanket default-theme renames needed. | Preserve Viz's theme and runtime variables. |
| Native cascade layers | At a 400px viewport, `.responsive-text .text-3xl.p-4.gap-4` changes from 18px/6px/6px to 30px/16px/16px. | Move legacy component declarations before built-in utilities **within the same utility layer**. The probe restores all three values. |
| Shared container namespace | `columns-lg` and `max-w-lg` change from 512px to 1024px. Legacy `@lg` query threshold changes the other way, from 64rem to 32rem. | Separate legacy container-query thresholds from size tokens; preserve query sorting too. A same-name plugin override alone does not preserve that ordering. |
| Default palette | `bg-red-500` changes from sRGBA 239/68/68/255 to 251/44/54/255. | Preserve resolved V3 palette values for legacy content if unchanged appearance is required. |
| Separate opacity APIs | `bg-red-500 bg-opacity-50` loses alpha without the bridge. | Coordinate color declarations and alpha setters. Slash colors, raw semantic variables, hover resets, dividers and placeholders need their existing ordering. |
| Gradients | Linear gradients still render, with palette/stop changes. Viz's configured radial/conic gradients become `none`. | Update the configured gradient declarations for V4 stop internals; also compare gradient variants and interpolation. |
| Space/divide families | Margins/borders move to different child edges; hidden-child behavior differs. | Legacy selector/declaration compatibility, not a renamed class. Include responsive `space-y-*` combinations. |
| Transform/reset/transition | Centering remains correct under V4 alone; `transform-none` no longer cancels a separate scale. | Restore old reset/transition behavior where relied on; never solve this by loading both unisolated engines. |
| Logical spacing properties | `px-4` moves from left/right padding to top/bottom in vertical writing mode. | Decide whether legacy physical-axis semantics must be retained. Normal horizontal spacing probes match. |
| Ring/outline/filter defaults | Ring defaults, `outline-none`, and `blur-sm` differ. | Scoped legacy defaults/theme values or explicit overrides. Same-name `@utility` aliases are additive, so a naive override may lose to a built-in rule. |
| Preflight | Button cursors, placeholders and `[hidden]` precedence differ. | Small central legacy base rules after reviewing actual desired behavior. |
| Variant selectors/conditions | Hover media gating, group/peer specificity, responsive units and variant ordering differ. | Compare interaction states and breakpoints; do not label equivalent based only on equal declarations. |
| Animation imports | Both `tailwindcss-animate` and `tw-animate-css` participate after the port, creating duplicate definitions. | Choose a deliberate animation implementation and compare existing enter/exit timing. |
| Matching/static/value rewrites | Many layout rules match, or replace constants with variables/calc/fallbacks/vendor prefixes. | Retain global cascade checks; no shim merely to reproduce emitted text. |

Each of the 182 inventory families is listed in `family-review.md`, including its status counts and review category. The full data remains available for individual-rule review.

## Browser verification and limits

The full-stylesheet probe covers 35 focused fixtures for layout, typography, gradients, opacity, layers, effects, hidden content and animation. It does not exercise complete saved Frames or slideshow UI, interaction portals, print output, or every combination of classes. Its font-family fixture omits Next's generated font variables, so that result is not treated as a migration regression.

The missing-class prototype has 158 browser fixtures. Supported cases had no mismatches; ordinary V4 control fixtures had no changes. Coverage includes all 126 alpha values across six families, slash/base collisions, raw-variable colors, hover color resets, directional borders, hidden divider children, placeholders, ring color/no-color behavior, and all seven mappings. `hover:bg-opacity-50` is explicitly unsupported because it is absent from the original emitted vocabulary. The probe records that example rather than claiming generic variant coverage. `compatibility-browser.json` contains the measurements.

This is Chromium-only verification (installed headless Chromium 143), not a cross-browser guarantee or a guarantee for every Sparkle component.

### Large stylesheet caveat

The raw V3 output is 13.4 MB; the raw V4 candidate is 40.6 MB. These are pre-production-optimization bytes, **not transfer-size estimates**. V4's normalized output has 297,105 style rules versus 151,912 for V3. The single huge V4 sheet caused this Chromium build to ignore late styles/registrations: even root `--radius` was unavailable. Splitting utility rules into separate stylesheets restored those values. Browser measurements distinguish the raw single-sheet case from the split case so this is not misreported as a radius/theme migration failure. The test did not perform a complete Next production build.

Chromium's rule representation uses an 18-bit position field; this is consistent with the observed large-sheet failure. [Chromium source](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/css/rule_set.h) A production implementation must verify the final optimized/chunked output against target browsers.

### Compatibility stylesheet footprint

The complete guarded prototype is 6,984,904 bytes raw and 569,952 bytes gzipped. Directional border colors account for 49,242 of its roughly 85,000 extracted rules. Copying only alpha-consuming rules is smaller but breaks combinations where a slash-opacity or raw-variable color should win. A separate compact functional-hook experiment also failed a slash/base ordering case because V4 sorts custom utilities by declaration count. Neither shortcut is represented as a correct replacement.

This proves that a global stylesheet is feasible; it does not establish that this full snapshot is the preferred production payload. A smaller implementation needs a deliberate supported vocabulary or a tested compiler integration. None of these files is imported into active Viz.

## Reproduction

From the repository root, with installed workspace dependencies and Playwright Chromium (`npx playwright install chromium` if needed):

```sh
viz_audit_dir="$(mktemp -d)"
viz_compat_dir="$(mktemp -d)"
node --max-old-space-size=6144 design_docs/viz_tailwind_css_audit/audit.mjs "$PWD" "$viz_audit_dir"
node --max-old-space-size=6144 design_docs/viz_tailwind_css_audit/compare.mjs "$PWD" "$viz_audit_dir"
node --max-old-space-size=6144 design_docs/viz_tailwind_css_audit/probe.mjs "$PWD" "$viz_audit_dir"
node --max-old-space-size=6144 design_docs/viz_tailwind_css_audit/generate-compat.mjs "$PWD" "$viz_compat_dir" "$viz_audit_dir"
node --max-old-space-size=6144 design_docs/viz_tailwind_css_audit/verify-compat.mjs "$PWD" "$viz_compat_dir"
```

The two output directories contain the full per-class diff and generated source/compiled compatibility CSS. The complete 7 MB compatibility source stylesheet is checked in and marked as generated, alongside its generator, seven small aliases, and measured results. Raw audit stylesheets and the compressed full diff are regenerated instead of committed. `manifest.json` records the source revision, compiler versions, vocabulary hash, and configuration/global-style hashes. Counts can change as Viz sources or installed dependencies change. The committed results were reproduced from a clean checkout of the recorded revision.

For the smaller compiler experiments:

```sh
viz_probe_dir="$(mktemp -d)"
node design_docs/viz_tailwind_css_audit/probe-utility-mappings.mjs "$PWD" "$viz_probe_dir"
node design_docs/viz_tailwind_css_audit/probe-container-mappings.mjs "$PWD" "$viz_probe_dir"
```

The two coexistence probes require a built `sparkle/dist/sparkle.css` in addition to those dependencies:

```sh
node design_docs/viz_tailwind_css_audit/verify-gradient.mjs "$PWD" "$viz_probe_dir"
node design_docs/viz_tailwind_css_audit/verify-upgrade-effects.mjs "$PWD" "$viz_probe_dir"
```

## Primary references

- [V4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide#changes-from-v3)
- [V4 custom utilities](https://tailwindcss.com/docs/adding-custom-styles#adding-custom-utilities)
- [V4 config/plugin compatibility](https://tailwindcss.com/docs/functions-and-directives#compatibility)
- [V4 source detection and safelisting](https://tailwindcss.com/docs/detecting-classes-in-source-files#safelisting-specific-utilities)
- [V3.4.19 core implementation](https://github.com/tailwindlabs/tailwindcss/blob/v3.4.19/src/corePlugins.js)
- [V4.3.0 utilities implementation](https://github.com/tailwindlabs/tailwindcss/blob/v4.3.0/packages/tailwindcss/src/utilities.ts)

The companion `compatibility-research.md` contains the detailed compiler probes and container-query ordering findings.

## Contract validation

The local `CONTRACTS` file was reviewed manually; the `cc-check` executable is unavailable in this environment. Generated CSS contains no `!important`.
