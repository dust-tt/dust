import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { CATALOG_LOCALES, DEFAULT_LOCALE } from "@app/types/locale";
import { getCatalogs } from "@lingui/cli/api";
import { getConfig } from "@lingui/conf";

const FRONT_DIR = path.resolve(__dirname, "../..");

/**
 * @cc [owner:sfriquet,label:architecture] no-empty-catalogs
 * After extraction, a catalog whose `DEFAULT_LOCALE` file has no message MUST be deleted for every
 * `CATALOG_LOCALES` entry, so that no `.po` file without messages exists under `locales/`.
 */
async function main() {
  execSync("npx lingui extract --clean", { cwd: FRONT_DIR, stdio: "inherit" });
  for (const catalog of await getCatalogs(getConfig({ cwd: FRONT_DIR }))) {
    const messages = await catalog.read(DEFAULT_LOCALE);
    if (messages && Object.keys(messages).length === 0) {
      for (const locale of CATALOG_LOCALES) {
        rmSync(catalog.getFilename(locale), { force: true });
      }
    }
  }
}

void main();
