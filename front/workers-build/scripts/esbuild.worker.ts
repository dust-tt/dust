import esbuild from "esbuild";
import { writeFile } from "fs/promises";
import path from "path";

async function buildWorker() {
  try {
    console.log("Building worker with esbuild...");

    const result = await esbuild.build({
      entryPoints: ["../start_worker.ts"],
      bundle: true,
      platform: "node",
      target: "node20",
      outfile: "dist/start_worker.js",
      alias: {
        "@app": "..",
      },
      packages: "bundle",
      logLevel: "info",
      metafile: true,
      external: [
        "@temporalio/worker",
        "@temporalio/common",
        "blake3",
        "dd-trace",
        "isomorphic-dompurify",
        "tsconfig-paths-webpack-plugin",
        "pg-hstore",
        "sequelize",
        "pg",
      ],
    });

    console.log("✅ Worker built successfully!");
    console.log(
      `📦 Bundle size: ${(result.metafile.outputs["dist/start_worker.js"].bytes / 1024 / 1024).toFixed(2)} MB`
    );

    // Write metafile to meta.json
    const metaPath = path.join(__dirname, "../dist/meta.json");
    await writeFile(metaPath, JSON.stringify(result.metafile, null, 2));
    console.log(`📄 Metafile written to ${metaPath}`);

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
