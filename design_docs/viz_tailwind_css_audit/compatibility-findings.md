# Generated global compatibility CSS for Viz's 133 missing names

This is a research artifact for a future Tailwind V4 migration. It is not imported into the current V3 renderer, and no production files were changed.

## Reproduction

Run `audit.mjs` and `compare.mjs`, then `generate-compat.mjs REPO PROTOTYPE_OUTPUT AUDIT_OUTPUT` and `verify-compat.mjs REPO PROTOTYPE_OUTPUT`, as shown in the [README](README.md#reproduction). The generator writes `tailwind-v3-compat.css`, its standalone `aliases.css` and `opacity-bridge.css` parts, and `compatibility-generation.json`. The verifier writes compiled V4 CSS and `compatibility-browser.json`.

The installed versions are Tailwind V3.4.19 and V4.3.0. The source uses V4's [custom utility API](https://tailwindcss.com/docs/adding-custom-styles#adding-custom-utilities) for zero blur, the two missing column sizes, and the three negative named-order utilities.

## Opacity bridge

Restoring the six old opacity-variable setters alone does not work because V4 colors do not consume them. The bridge selects V3 color and opacity declarations from the actual generated baseline, keeps their order and enclosing at-rules, and activates them only on elements carrying one of the inventoried legacy opacity classes for that family. Zero-specificity `:where()` guard wrappers and nested selectors preserve the original selector relationships, including divide children and placeholder pseudo-elements. The rules reside in the `utilities` layer.

Only the six alpha variables are renamed to private `--viz-legacy-*-opacity` names. `--tw-ring-color` is retained so V4's ring composition consumes the restored color. The extraction contains no `!important` declarations, reset stylesheet, global property registrations, or copied layout/typography utility families.

Copying only declarations that reference an alpha variable is insufficient. A competing slash-opacity or raw-variable color can otherwise lose to the newly copied base color rule. This prototype therefore includes the relevant competing color declarations in the same original V3 order. It preserves V3's raw semantic-color behavior, including combinations in which a separate opacity class had no effect.

## Validation and limits

Headless Chromium tested 158 fixtures. All supported comparisons passed; no-opacity V4 controls were unchanged. Coverage includes all 21 opacity values in each of the six families, base plus slash-color combinations, semantic variable colors, hover color changes that reset opacity, slash colors on hover, directional border colors, divide selection around hidden children, placeholders, the seven aliases, and ring opacity's no-op behavior when no explicit ring color is present.

This does **not** establish general V3/V4 equivalence. The supported target is the exact missing-name inventory and its tested interactions. For example, `hover:bg-opacity-50` is absent from that inventory and remains unsupported; the browser results explicitly record that case. New arbitrary color classes absent from the baseline, arbitrary opacity values, and additional opacity variants require generation/scanning support and further tests. The complete Sparkle component catalog and portal behavior were not tested.

The emitted source is approximately **6.98 MB raw / 570 KB gzip**, with 85,579 selected color/opacity rules. Directional border colors account for 49,242 rules because Viz's V3 safelist emits a very broad vocabulary. The 53 guard wrappers are shared rather than repeated per rule. This is a correctness reference and a reviewable migration artifact; it is too large to call a negligible-cost patch. Trim against the real supported vocabulary or pursue a separately validated compact implementation before shipping.

A compact functional-hook experiment also exposed ordering failures, so no compact replacement is claimed here. The seven small aliases can be reviewed independently while the opacity bridge's footprint and supported vocabulary are decided.
