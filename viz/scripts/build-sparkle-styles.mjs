import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { scopeSparkle } from "./scope-sparkle.mjs";

const require = createRequire(import.meta.url);
const source = require.resolve("@dust-tt/sparkle/dist/sparkle.css");
const output = new URL(
  "../app/styles/sparkle-scoped.generated.css",
  import.meta.url
);
const css = await readFile(source, "utf8");
await writeFile(output, scopeSparkle(css));
