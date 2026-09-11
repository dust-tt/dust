import dotenv from "dotenv";
import fs from "fs";

/** Parses a `.env` file, tolerating its absence. */
export function parseEnvFile(envPath: string): Record<string, string> {
  return fs.existsSync(envPath)
    ? dotenv.parse(fs.readFileSync(envPath, "utf8"))
    : {};
}

/**
 * Reads `key` from the given `.env` file, falling back to the ambient
 * environment and then to an empty string.
 */
export function resolveEnvVar(
  fileVars: Record<string, string>,
  key: string
): string {
  return fileVars[key] ?? process.env[key] ?? "";
}

// The shared `front` `CellContext` resolves the API base URL from
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
  return getImportMetaEnvFromVars(parseEnvFile(envPath));
}

/**
 * As `getImportMetaEnv`, for callers that have already resolved their variables
 * (e.g. layered a platform-specific override over the base `.env` file).
 */
export function getImportMetaEnvFromVars(
  fileVars: Record<string, string>
): Record<string, string> {
  const resolve = (key: string): string => resolveEnvVar(fileVars, key);

  const usUrl = resolve("DUST_API_URL_US");
  const euUrl = resolve("DUST_API_URL_EU");
  const cell00002Url = resolve("DUST_API_URL_CELL_00002");

  return {
    VITE_DUST_API_URL: usUrl,
    VITE_DUST_API_URL_US: usUrl,
    VITE_DUST_API_URL_EU: euUrl,
    VITE_DUST_API_URL_CELL_00002: cell00002Url,
    VITE_DUST_REGION: "us-central1",
  };
}
