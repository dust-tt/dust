import esbuild from "esbuild";

// ESM-only packages that Node 22 cannot correctly `require()` at runtime
// (it wraps the default export in `{ default: ... }`, breaking the
// library's internal validation). Bundle these via esbuild instead of
// externalizing them, so CJS/ESM interop is resolved at build time.
//
// Add new entries here as we discover them during migration.
const ESM_ONLY_PACKAGES = ["libphonenumber-js"];

// Externalize every node_modules import (`bare specifier`, i.e. doesn't
// start with `.` or `/`) by default, except for the packages above which
// esbuild bundles inline. This replaces the broader `packages: "external"`
// option which had no way to opt specific packages back into bundling.
const bundleEsmPlugin: esbuild.Plugin = {
  name: "bundle-esm-packages",
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      // Path aliases (`@app/*`, `@front-api/*`) point at source code we want
      // to bundle, not at node_modules. Skip them so esbuild's alias
      // resolution applies and the resolved path gets bundled normally.
      if (
        args.path.startsWith("@app/") ||
        args.path.startsWith("@front-api/")
      ) {
        return;
      }
      const pkg = args.path.startsWith("@")
        ? args.path.split("/").slice(0, 2).join("/")
        : args.path.split("/")[0];
      if (ESM_ONLY_PACKAGES.includes(pkg)) {
        return;
      }
      return { external: true };
    });
  },
};

async function buildServer() {
  try {
    console.log("Building front-api server with esbuild...");

    const result = await esbuild.build({
      entryPoints: ["server.ts"],
      bundle: true,
      platform: "node",
      target: "node22",
      outfile: "dist/server.js",
      alias: {
        "@app": "../front",
      },
      plugins: [bundleEsmPlugin],
      logLevel: "info",
      metafile: true,
    });

    console.log("✅ Server built successfully!");
    console.log(
      `📦 Bundle size: ${(result.metafile.outputs["dist/server.js"].bytes / 1024 / 1024).toFixed(2)} MB`
    );

    if (result.warnings.length > 0) {
      console.log(`⚠️  ${result.warnings.length} warning(s) during build`);
    }
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

buildServer().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
