import esbuild from "esbuild";

import {
  BUILD_TARGETS,
  type BuildTarget,
  getBaseBuildOptions,
} from "./esbuild.shared";
import { checkBundleContents } from "./lib/build-checks";
import { type BundleSize, reportBundleSizes } from "./lib/bundle-metrics";

function getProductionBuildOptions(target: BuildTarget): esbuild.BuildOptions {
  return {
    ...getBaseBuildOptions(target),
    sourcemap: true,
    minifyWhitespace: true,
    minifySyntax: true,
    legalComments: "none",
  };
}

async function buildTarget(target: BuildTarget): Promise<BundleSize> {
  console.log(`Building ${target.name} with esbuild...`);
  const result = await esbuild.build(getProductionBuildOptions(target));

  const output = result.metafile?.outputs[target.outfile];
  if (!output) {
    throw new Error(`esbuild produced no metafile output for ${target.name}`);
  }
  const sizeMb = `${(output.bytes / 1024 / 1024).toFixed(2)} MB`;
  console.log(`✅ ${target.name} built (${sizeMb})`);

  if (target.name === "server" && result.metafile) {
    const problems = checkBundleContents(result.metafile);
    if (problems.length > 0) {
      console.error("❌ Bundle check failed:");
      for (const problem of problems) {
        console.error(`   - ${problem}`);
      }
      process.exit(1);
    }
  }

  if (result.warnings.length > 0) {
    console.log(
      `⚠️  ${result.warnings.length} warning(s) while building ${target.name}`
    );
  }

  return { name: target.name, bytes: output.bytes };
}

async function buildAll() {
  try {
    const bundleSizes = await Promise.all(BUILD_TARGETS.map(buildTarget));
    await reportBundleSizes({ bundleSizes });
    console.log("🎉 All front-api targets built successfully!");
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

buildAll().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
