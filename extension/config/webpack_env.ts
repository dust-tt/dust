import dotenv from "dotenv";
import fs from "fs";

// The shared `front` `RegionContext` resolves the API base URL from
// `import.meta.env.VITE_DUST_API_URL*`. Vite injects those in the SPA build, but
// the extension is built with webpack, which only exposes `process.env.*`. As a
// result `import.meta.env` is undefined in the extension bundle, the resolved
// base URL is "", and `/api/*` calls fall back to the extension origin
// (`chrome-extension://<id>/api/...` → ERR_FILE_NOT_FOUND), logging the user out
// on every reopen.
//
// We mirror the VITE_* values webpack needs here, mapping them from the
// extension's DUST_API_URL_US / DUST_API_URL_EU config (loaded from
// .env.{development,production}), so `import.meta.env` resolves the same way it
// does in the SPA.
export function getImportMetaEnv(envPath: string): Record<string, string> {
  const fileVars = fs.existsSync(envPath)
    ? dotenv.parse(fs.readFileSync(envPath, "utf8"))
    : {};

  const resolve = (key: string): string =>
    fileVars[key] ?? process.env[key] ?? "";

  const usUrl = resolve("DUST_API_URL_US");
  const euUrl = resolve("DUST_API_URL_EU");

  return {
    VITE_DUST_API_URL: usUrl,
    VITE_DUST_API_URL_US: usUrl,
    VITE_DUST_API_URL_EU: euUrl,
    VITE_DUST_REGION: "us-central1",
  };
}
