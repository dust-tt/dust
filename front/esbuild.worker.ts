import esbuild from "esbuild";
import fs from "fs";

async function buildWorker() {
  try {
    console.log("Building worker with esbuild...");

    const result = await esbuild.build({
      entryPoints: ["start_worker.ts"],
      bundle: true,
      platform: "node",
      target: "node22",
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

    fs.writeFileSync("dist/meta.json", JSON.stringify(result.metafile));

    // Check for forbidden imports in worker bundle
    const forbiddenPackages = ["@dust-tt/sparkle"];
    const violations: string[] = [];
    for (const [file, info] of Object.entries(result.metafile.inputs)) {
      for (const imp of info.imports) {
        if (forbiddenPackages.includes(imp.path)) {
          violations.push(`${file} imports ${imp.path}`);
        }
      }
    }
    if (violations.length > 0) {
      console.error("❌ Worker bundle must not import forbidden packages:");
      violations.forEach((v) => console.error(`  ${v}`));
      process.exit(1);
    }

    // Log any warnings
    if (result.warnings.length > 0) {
      console.log(`⚠️  ${result.warnings.length} warning(s) during build`);
    }
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

buildWorker().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
