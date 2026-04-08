import { slugify } from "@app/types/shared/utils/string_utils";

export function uriToSlug(uri: string): string {
  try {
    const url = new URL(uri);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const last = pathParts.at(-1) ?? url.hostname;
    return slugify(last || url.hostname);
  } catch {
    // Not a valid URL, use as-is.
    return slugify(uri.split("/").at(-1) ?? uri);
  }
}

/**
 * Builds a tool output filename. The timestamp prefix is mandatory so that files are naturally
 * ordered when listing the tool_outputs/ folder and are never silently overwritten across runs.
 */
export function makeFileName({ ext, name }: { ext: string; name: string; }): string {
  return `${Date.now()}_${slugify(name)}${ext}`;
}
