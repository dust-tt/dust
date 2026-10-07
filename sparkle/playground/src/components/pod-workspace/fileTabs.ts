import { canonicalFile, configurePod, type WorkspaceState } from "./engine";
import { createPodConfiguration } from "./fixtures";
import type { PodFileTab } from "./model";

export function podFileTabs(
  state: WorkspaceState,
  podId: string
): PodFileTab[] {
  return (
    state.configurations[podId].fileTabs ??
    createPodConfiguration(podId).fileTabs ??
    []
  );
}

export function setPodFileTabs(
  state: WorkspaceState,
  podId: string,
  tabs: PodFileTab[]
): WorkspaceState {
  const ids = new Set<string>();
  const fileTabs = tabs
    .flatMap((tab) => {
      const file = canonicalFile(state.files, tab.fileId);
      const title = tab.title.trim().slice(0, 64);
      if (
        !file ||
        !["frame", "document", "email"].includes(file.kind) ||
        !title ||
        ids.has(file.id)
      ) {
        return [];
      }
      ids.add(file.id);
      return [{ ...tab, fileId: file.id, title }];
    })
    .slice(0, 8);
  const configuration = state.configurations[podId];
  const linked = new Set(configuration.references.map((ref) => ref.fileId));
  return configurePod(state, podId, {
    ...configuration,
    fileTabs,
    references: [
      ...configuration.references,
      ...fileTabs
        .filter((tab) => !linked.has(tab.fileId))
        .map((tab) => ({ fileId: tab.fileId, role: "Reference" as const })),
    ],
  });
}
