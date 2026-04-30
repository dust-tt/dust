import type { ZipEntry } from "@app/lib/api/skills/detection/zip/types";

/**
 * Strips the common top-level directory prefix that many ZIP archives include
 * (e.g. "repo-main/skills/foo/SKILL.md" -> "skills/foo/SKILL.md"). If the
 * archive has no single common prefix the entries are returned unchanged.
 * If the common top-level directory is itself a skill directory, it is kept so
 * that the generic skill scanner does not treat its SKILL.md as root-level.
 */
export function stripCommonZipPrefix(entries: ZipEntry[]): ZipEntry[] {
  const fileEntries = entries.filter((e) => !e.isDirectory);
  if (fileEntries.length === 0) {
    return entries;
  }

  const firstPath = fileEntries[0].path;
  const firstSlash = firstPath.indexOf("/");
  if (firstSlash === -1) {
    return entries;
  }
  const prefix = firstPath.slice(0, firstSlash + 1);

  const allSharePrefix = fileEntries.every((e) => e.path.startsWith(prefix));
  if (!allSharePrefix) {
    return entries;
  }

  const prefixContainsSkillMd = fileEntries.some((e) => {
    const relativePath = e.path.slice(prefix.length);

    return (
      !relativePath.includes("/") && relativePath.toLowerCase() === "skill.md"
    );
  });
  if (prefixContainsSkillMd) {
    return entries;
  }

  return entries
    .map((e) => ({ ...e, path: e.path.slice(prefix.length) }))
    .filter((e) => e.path.length > 0);
}
