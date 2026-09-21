# Viz styles

`app/layout.tsx` loads `globals.css` for Frames and both slideshow versions. The global entry point uses the Tailwind V4 PostCSS plugin and imports `tailwind-v3-compat.css` for the 133 missing V3 utility names. `tailwind-v3-safelist.css` retains the generated V3 vocabulary, including classes absent from the repository: saved Frame source is only available at runtime.

The reset, palette, blur/ring defaults, and container scales retain Viz's V3 values. Slideshow styles share the utilities layer and precede built-in utilities so their old specificity and source ordering still work. The container query theme holds compile-time thresholds while base variables retain the different V3 width/column scale. The animation plugin remains `tailwindcss-animate`.

The opacity bridge is guarded by the matching legacy opacity classes. Its divider selectors follow V4's divider widths so the restored color is applied to the visible border. This does not restore every V3 behavior: V4's generic spacing/divider edges and hidden-child selection, individual transforms and transform resets, outline semantics, logical axes, hover gating, and gradient interpolation still apply. Test representative saved content before rolling out this migration. Sparkle's separate stylesheet and theme are not integrated here.

The compatibility stylesheet and safelist are intentionally checked in. Their baseline is the Tailwind 3.4.19 output documented in [the audit PR](https://github.com/dust-tt/dust/pull/32850). Do not trim them based only on local component usage. The reset is the V3.4.19 preflight generated with Viz's configuration. There is no V3 compiler in the application dependency tree.

To validate the actual production styles, from the repository root:

```sh
NODE_ENV=production npm run build --workspace viz
npm run start --workspace viz -- --port 3007
# In another terminal, after installing Playwright Chromium if needed:
npm run test:styles --workspace viz -- http://localhost:3007
```

The browser check exercises every legacy opacity value, all seven aliases, slash/base color ordering, visible divider borders, hover colors, responsive classes, dark mode, and slideshow sizing/centering against the served build. It does not scan persisted Frames or prove equivalence across all class combinations or browsers.
