import esbuild from "esbuild";

import {
  BUILD_TARGETS,
  type BuildTarget,
  getBaseBuildOptions,
} from "./esbuild.shared";

function getProductionBuildOptions(target: BuildTarget): esbuild.BuildOptions {
  return {
    ...getBaseBuildOptions(target),
    sourcemap: true,
    minifyWhitespace: true,
    minifySyntax: true,
    legalComments: "none",
  };
}

async function buildTarget(target: BuildTarget) {
  console.log(`Building ${target.name} with esbuild...`);
  const result = await esbuild.build(getProductionBuildOptions(target));

  const output = result.metafile?.outputs[target.outfile];
  const sizeMb = output
    ? `${(output.bytes / 1024 / 1024).toFixed(2)} MB`
    : "unknown";
  console.log(`✅ ${target.name} built (${sizeMb})`);

  if (result.warnings.length > 0) {
    console.log(
      `⚠️  ${result.warnings.length} warning(s) while building ${target.name}`
    );
  }
}

async function buildAll() {
  try {
    await Promise.all(BUILD_TARGETS.map(buildTarget));
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
