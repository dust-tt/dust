# [Dust](https://dust.tt)

Build Sparkle before starting or building Viz, from the repository root:

```sh
npm -w sparkle run build
npm -w viz run dev
```

Sparkle is used by Viz's own UI. Generated Frames continue to use the existing runtime imports.
Import individual components through Sparkle's exported `dist/esm/*` paths to avoid unrelated CSS side effects from the package entry point. The slideshow icons use Viz's existing styles. Styled components such as Document will require a separate integration of Sparkle's theme, which changes typography and colors used by saved Frames.
