import fs from "fs";

// Fails `build:esm` if Lingui JSX macros (`<Trans>`, `<Plural>`, ...) were not compiled. If JSX is
// compiled before the macro, the macro import is silently dropped and `<Trans>` crashes at render.
//
// use-application-logger note: console is used deliberately — standalone Node script.

const JSX_MACRO_IMPORT =
  /import\s*\{[^}]*\b(?:Trans|Plural|Select|SelectOrdinal)\b[^}]*\}\s*from\s*["']@lingui\/react\/macro["']/;
// What a compiled JSX macro imports (`runtimeConfigModule.Trans` in lingui.config.ts).
const RUNTIME_TRANS = "@sparkle/lib/i18n/Trans";

const broken = fs
  // 1. List the source modules.
  .globSync("src/**/*.{ts,tsx}")
  // 2. Keep those that use a JSX macro.
  .filter((src) => JSX_MACRO_IMPORT.test(fs.readFileSync(src, "utf-8")))
  // 3. Keep those whose built module does not import the runtime `Trans`.
  .filter((src) => {
    const built = src.replace(/^src\//, "dist/esm/").replace(/\.tsx?$/, ".js");
    return !fs.readFileSync(built, "utf-8").includes(RUNTIME_TRANS);
  });

// 4. Fail the build if any are left.
if (broken.length > 0) {
  console.error(
    `✗ Lingui JSX macros were not compiled in:\n  ${broken.join("\n  ")}`
  );
  process.exit(1);
}
