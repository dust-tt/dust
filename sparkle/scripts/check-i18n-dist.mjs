import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Checks the built ESM output after `npm run build`: the Lingui macros must be compiled away, and
// every message descriptor must keep its English `message`, which the provider-less fallback
// renders. A leftover macro import throws at runtime; a stripped message renders an id.
// Usage: `npm run check:i18n`.
//
// use-application-logger note: console is used deliberately — this is a standalone Node script
// where the app logger is not available, matching the sibling build-cjs.mjs.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist/esm");

const MACRO_IMPORT = /from\s*["']@lingui\/(core|react)\/macro["']/;
// Descriptors the macro generates start with their id; `message` follows when it is kept.
const DESCRIPTOR_WITHOUT_MESSAGE = /\bid:\s*"[^"]*"(?!,\s*message:)/;

function listJsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listJsFiles(entryPath);
    }
    return entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

const errors = [];
let translatedFileCount = 0;
for (const file of listJsFiles(distDir)) {
  const source = fs.readFileSync(file, "utf8");
  const relativePath = path.relative(distDir, file);
  if (MACRO_IMPORT.test(source)) {
    errors.push(`${relativePath}: leftover Lingui macro import`);
  }
  if (!/from\s*["'][./]*lib\/i18n["']|from\s*["']\.\/i18n["']/.test(source)) {
    continue;
  }
  translatedFileCount++;
  if (DESCRIPTOR_WITHOUT_MESSAGE.test(source)) {
    errors.push(`${relativePath}: message descriptor without its English message`);
  }
}

if (translatedFileCount === 0) {
  errors.push("no file imports the Sparkle Lingui runtime: the macros did not run");
}

if (errors.length > 0) {
  console.error(`Sparkle i18n build check failed:\n${errors.join("\n")}`);
  process.exit(1);
}
console.log(`Sparkle i18n build check passed (${translatedFileCount} files).`);
