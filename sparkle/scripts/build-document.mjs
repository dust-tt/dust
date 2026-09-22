import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const packageJSON = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8")
);

await Promise.all(
  [
    { format: "esm", outfile: "dist/esm/document.mjs" },
    { format: "cjs", outfile: "dist/cjs/document.js" },
  ].map((output) =>
    build({
      entryPoints: ["dist/esm/components/Document/content.js"],
      bundle: true,
      platform: "node",
      target: "es2020",
      external: Object.keys(packageJSON.dependencies),
      sourcemap: true,
      ...output,
    })
  )
);
