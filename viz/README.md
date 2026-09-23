# [Dust](https://dust.tt)

Build Sparkle before starting or building Viz, from the repository root:

```sh
npm -w sparkle run build
npm -w viz run dev
```

Sparkle is used by Viz's own UI. Generated Frames continue to use the existing runtime imports.
Import individual components through Sparkle's exported `dist/esm/*` paths to avoid unrelated CSS side effects from the package entry point. The slideshow icons use Viz's existing styles. Styled components such as Document will require a separate integration of Sparkle's theme, which changes typography and colors used by saved Frames.

Embedded Frames receive Dust's resolved theme through `?theme=light|dark`, but keep the previous light defaults unless their outer `FrameRoot` or v2 `Slideshow` receives a `theme` prop. Passing `theme={{}}` opts into the host appearance with default colors; other theme objects also supply scoped CSS variable overrides. Nested roots only override their local variables and never change the document's mode. The document-level theme also covers portals, and unmounting the outer root restores light defaults.

Changing Dust's theme reloads the iframe and resets its local state. Missing or invalid theme values and PDF rendering use light mode. Theme support uses Viz's existing semantic colors and emitted dark variants. Before opting in, ensure authored foreground and background pairs work in both modes: fixed colors are not automatically converted.
