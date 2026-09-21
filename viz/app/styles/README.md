# Viz styles

`app/layout.tsx` loads `globals.css` for Frames and both slideshow versions. The global entry point uses the Tailwind V4 PostCSS plugin. `tailwind-v3-compat.css` defines seven aliases and six functional opacity utilities, with the same 21 opacity values per family emitted by the frozen safelist.

`postcss/tailwind-v3-compat.cjs` runs after Tailwind. It adapts the existing opaque color declarations to consume legacy alpha variables, retaining their selectors and cascade position. Color rules reset alpha so hover and other color variants still override a base opacity class. Explicit slash colors, raw semantic variables, and colors without a legacy opacity class retain their normal behavior. The adapter handles both nested development output and optimized production output, including merged base/slash selector lists. Its private CSS marker is removed during the build, and unrelated stylesheets are left alone.

`tailwind-v3-safelist.css` retains 151,563 generated V3 candidates, including classes absent from the repository: saved Frame source is only available at runtime. This broad vocabulary already existed under V3 and still produces a large global stylesheet. The adapter removes the duplicated compatibility color rules, without reducing that existing coverage.

The [Frame authoring instructions](../../../front/lib/api/actions/servers/interactive_content/instructions_v2.ts) require predefined Tailwind utilities and the React `style` prop for exact values. The frozen safelist preserves this authoring model under V4. It does not cover every new V4 utility or support arbitrary values in generated Frames. Add newly supported utilities to the safelist explicitly so runtime content can use them without depending on local source detection.

The reset, palette, blur/ring defaults, and container scales retain Viz's V3 values. Slideshow styles share the utilities layer and precede built-in utilities so their old specificity and source ordering still work. The container query theme holds compile-time thresholds while base variables retain the different V3 width/column scale. The animation plugin remains `tailwindcss-animate`.

This does not restore every V3 behavior: V4's generic spacing/divider edges and hidden-child selection, individual transforms and transform resets, outline semantics, logical axes, hover gating, and gradient interpolation still apply. Test representative saved content before rolling out this migration. Sparkle's separate stylesheet and theme are not integrated here.

The baseline is the Tailwind 3.4.19 output documented in [the audit PR](https://github.com/dust-tt/dust/pull/32850). Do not trim the safelist based only on local component usage. The reset is the V3.4.19 preflight generated with Viz's configuration. There is no V3 compiler in the application dependency tree.

To validate the production styles, from the repository root:

```sh
npm run test --workspace viz -- postcss/tailwind-v3-compat.test.ts
NODE_ENV=production npm run build --workspace viz
npm run start --workspace viz -- --port 3007
# In another terminal, after installing Playwright Chromium if needed:
npm run test:styles --workspace viz -- http://localhost:3007
```

The browser check exercises every legacy opacity value, all seven aliases, slash/base color ordering, semantic and palette-token colors, visible divider borders, directional borders, child opacity isolation, hover colors, responsive classes, dark mode, and slideshow sizing/centering against the served build. It does not scan persisted Frames or prove equivalence across all class combinations or browsers.
