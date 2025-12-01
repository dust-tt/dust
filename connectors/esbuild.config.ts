import esbuild from "esbuild";
import path from "path";

interface BuildTarget {
  name: string;
  entryPoint: string;
  outfile: string;
}

const buildTargets: BuildTarget[] = [
  {
    name: "API Server",
    entryPoint: "src/start_server.ts",
    outfile: "dist/start_server.js",
  },
  {
    name: "CLI",
    entryPoint: "src/admin/cli.ts",
    outfile: "dist/cli.js",
  },
];

async function buildTarget(target: BuildTarget) {
  try {
    console.log(`Building ${target.name} with esbuild...`);

    const result = await esbuild.build({
      entryPoints: [target.entryPoint],
      bundle: true,
      platform: "node",
      target: "node20",
      outfile: target.outfile,
      alias: {
        "@connectors": path.resolve("./src"),
      },
      packages: "external",
      logLevel: "info",
      metafile: true,
    });

    console.log(`✅ ${target.name} built successfully!`);
    if (result.metafile) {
      const output = result.metafile.outputs[target.outfile];
      if (output) {
        console.log(
          `📦 Bundle size: ${(output.bytes / 1024 / 1024).toFixed(2)} MB`
        );
      }
    }

    if (result.warnings.length > 0) {
      console.log(
        `⚠️  ${result.warnings.length} warning(s) during ${target.name} build`
      );
    }
  } catch (error) {
    console.error(`❌ ${target.name} build failed:`, error);
    process.exit(1);
  }
}

async function build() {
  console.log("🔨 Building all connectors components...\n");

  // Build all targets in parallel
  await Promise.all(buildTargets.map(buildTarget));

  console.log("\n🎉 All builds completed successfully!");
}

build().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
