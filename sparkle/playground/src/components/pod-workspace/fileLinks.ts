import type { WorkspaceFile } from "./model";

export function workspaceFileUrl(
  fileId: string,
  base = window.location.href
): string {
  const url = new URL(base);
  url.search = "";
  url.searchParams.set("file", fileId);
  url.hash = "Pod_Workspace";
  return url.toString();
}

export function linkedFileIds(text: string, files: WorkspaceFile[]): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>]+/g)) {
    try {
      const url = new URL(match[0]);
      const id = url.searchParams.get("file");
      if (
        url.hash === "#Pod_Workspace" &&
        id &&
        files.some((file) => file.id === id && file.kind !== "link")
      ) {
        ids.add(id);
      }
    } catch {
      continue;
    }
  }
  return [...ids];
}

export function fileChip(file: WorkspaceFile): string {
  const label = file.name.replace(/[\[\]{}\\]/g, "");
  return `:file[${label}]{type="document" id="${encodeURIComponent(file.id)}"}`;
}

export function linkifiedMessage(text: string, files: WorkspaceFile[]): string {
  return text.replace(/https?:\/\/[^\s<>]+/g, (value) => {
    const id = linkedFileIds(value, files)[0];
    const file = files.find((entry) => entry.id === id);
    return file ? fileChip(file) : value;
  });
}
