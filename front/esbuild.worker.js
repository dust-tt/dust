const esbuild = require("esbuild");
const path = require("path");

async function buildWorker() {
  try {
    console.log("Building worker with esbuild...");

    const result = await esbuild.build({
      entryPoints: ["start_worker.ts"],
      bundle: true,
      platform: "node",
      target: "node20",
      outfile: "dist/start_worker.js",
      alias: {
        "@app": ".",
      },
      packages: "external",
      logLevel: "info",
      metafile: true,
    });

    console.log("✅ Worker built successfully!");
    console.log(
      `📦 Bundle size: ${(result.metafile.outputs["dist/start_worker.js"].bytes / 1024 / 1024).toFixed(2)} MB`
    );

    // Log any warnings
    if (result.warnings.length > 0) {
      console.log(`⚠️  ${result.warnings.length} warning(s) during build`);
    }
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

buildWorker();
