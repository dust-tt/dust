# Frame runtime types

`npm run build:runtime-types` generates the declarations for the libraries exposed to Frame UI
source. Viz runs it before production builds and when starting the development server.

The public entry point is `/frame-runtime/manifest.json`. It identifies a compressed archive
by checksum, records the TypeScript version used to emit the declarations, and lists the public
runtime module names. `id` hashes the extracted files and remains stable across identical builds.
`tarballSha256` verifies the downloaded bytes, whose archive metadata may vary between builds.

`tsup` generates a single `index.d.ts` for Viz's public types using TypeScript's declaration emit
and Rollup's declaration bundler. The build reads `createFrameRuntimeImports`, the helper used by
`react-runner`, to generate the entry point and map Frame module names to their declarations.
Bound Dust hook signatures and the legacy Pod aliases come from that same helper.

The archive includes the bundle, small Frame module aliases, and the installed dependencies'
original declarations and package metadata. It also contains `runtime.json` and `tsconfig.json`.
Keeping dependency declarations separate preserves React's namespace and CommonJS types.
The archive contains no executable checker or Frame source and needs no dependency installation
after extraction.

After extraction, a consumer can extend the supplied configuration:

```json
{
  "extends": "/path/to/cached/frame-types/tsconfig.json",
  "files": ["index.tsx"]
}
```

Use the consumer's installed TypeScript compiler or type-aware linter. The configuration supports
TSX, JavaScript, browser globals and dynamic Dust file references. A linter must receive every
UI source file to report diagnostics inside imported files.

Consumers must restrict runtime imports to the names in `runtime.json`, relative UI files and
supported Dust file references. Dependency declarations also include packages used internally
by Viz that are not exposed to Frame code.

This is the Viz artifact only. Sandbox installation, caching, lint configuration and publishing
integration are separate changes.
