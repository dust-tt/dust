import esbuild from "esbuild";
import { writeFile } from "fs/promises";
import path from "path";

const entryPoint = "src/index.ts";
const outDir = "dist";

interface BuildTarget {
  name: string;
  format: "esm" | "cjs";
  outfile: string;
  production?: boolean;
}

const buildTargets: BuildTarget[] = [
  {
    name: "ESM",
    format: "esm",
    outfile: path.join(outDir, "client.esm.js"),
  },
  {
    name: "CJS Development",
    format: "cjs",
    outfile: path.join(outDir, "client.cjs.development.js"),
    production: false,
  },
  {
    name: "CJS Production",
    format: "cjs",
    outfile: path.join(outDir, "client.cjs.production.min.js"),
    production: true,
  },
];

async function buildTarget(target: BuildTarget) {
  try {
    console.log(`Building ${target.name} bundle...`);

    const result = await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      platform: "node",
      target: "node20",
      format: target.format,
      outfile: target.outfile,
      minify: target.production ?? false,
      sourcemap: true,
      // Define NODE_ENV to enable dead code elimination
      // Development: keeps dev-only code, Production: strips it
      define: {
        "process.env.NODE_ENV": target.production
          ? '"production"'
          : '"development"',
      },
      // Externalize regular dependencies, but bundle @modelcontextprotocol/sdk
      // which is in bundledDependencies
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
    throw error;
  }
}

async function build() {
  console.log("🔨 Building @dust-tt/client...\n");

  // Build all targets
  for (const target of buildTargets) {
    await buildTarget(target);
  }

  // Create CJS entry point that conditionally requires prod or dev build
  const cjsEntryPoint = path.join(outDir, "index.js");
  const cjsEntryContent = `if (process.env.NODE_ENV === 'production') {
  module.exports = require('./client.cjs.production.min.js');
} else {
  module.exports = require('./client.cjs.development.js');
}
`;

  await writeFile(cjsEntryPoint, cjsEntryContent, "utf-8");
  console.log("✅ Created CJS entry point (dist/index.js)\n");

  console.log("\n✅ All builds completed successfully!");
}

build().catch((error) => {
  console.error("❌ Build failed:", error);
  process.exit(1);
});
