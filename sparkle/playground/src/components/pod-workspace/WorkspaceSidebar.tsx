import type { WorkspaceFile, WorkspaceLocation } from "./model";
import { WorkspaceFilesNavigation } from "./WorkspaceFilesNavigation";

export function WorkspaceSidebar({
  files,
  location,
  onLocation,
}: {
  files: WorkspaceFile[];
  location: WorkspaceLocation | null;
  onLocation: (location: WorkspaceLocation) => void;
}) {
  return (
    <div onClick={(event) => event.stopPropagation()}>
      <WorkspaceFilesNavigation
        files={files}
        location={location}
        onNavigate={onLocation}
      />
    </div>
  );
}
