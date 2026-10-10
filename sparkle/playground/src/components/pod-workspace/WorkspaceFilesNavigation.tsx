import { Building01, Tree, User01, Users01 } from "@dust-tt/sparkle";

import { fileIcons } from "./ResourceRow";
import { isContainer } from "./model";
import type { FileScope, WorkspaceFile, WorkspaceLocation } from "./model";

const scopes = [
  "My files",
  "Workspace files",
  "Shared with me",
] satisfies FileScope[];
export const scopeIcons = {
  "My files": User01,
  "Workspace files": Building01,
  "Shared with me": Users01,
};

export function WorkspaceFilesNavigation({
  files,
  location,
  onNavigate,
}: {
  files: WorkspaceFile[];
  location: WorkspaceLocation | null;
  onNavigate: (location: WorkspaceLocation) => void;
}) {
  const children = new Map<string, WorkspaceFile[]>();
  for (const file of files) {
    if (!isContainer(file)) {
      continue;
    }
    const key = file.parentId ?? file.scope;
    const siblings = children.get(key) ?? [];
    siblings.push(file);
    children.set(key, siblings);
  }
  const renderFolders = (key: string) =>
    (children.get(key) ?? []).map((folder) => (
      <Tree.Item
        key={folder.id}
        label={folder.name}
        visual={fileIcons[folder.kind]}
        type={children.has(folder.id) ? "node" : "leaf"}
        isSelected={location?.folderId === folder.id}
        onItemClick={() =>
          onNavigate({ scope: folder.scope, folderId: folder.id })
        }
      >
        <Tree variant="navigator">{renderFolders(folder.id)}</Tree>
      </Tree.Item>
    ));
  return (
    <nav aria-label="Files">
      <Tree variant="navigator">
        {scopes.map((scope) => (
          <Tree.Item
            key={scope}
            label={scope}
            visual={scopeIcons[scope]}
            defaultCollapsed={true}
            isSelected={location?.scope === scope && location.folderId === null}
            onItemClick={() => onNavigate({ scope, folderId: null })}
          >
            <Tree variant="navigator">{renderFolders(scope)}</Tree>
          </Tree.Item>
        ))}
      </Tree>
    </nav>
  );
}
