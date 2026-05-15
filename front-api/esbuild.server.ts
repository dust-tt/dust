import esbuild from "esbuild";

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
      packages: "external",
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
