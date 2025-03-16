import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Label,
} from "@dust-tt/sparkle";

import { usePersistedNavigationSelection } from "@app/hooks/usePersistedNavigationSelection";
import type { LightWorkspaceType, UserTypeWithWorkspaces } from "@app/types";

interface WorkspacePickerProps {
  onWorkspaceUpdate: (w: LightWorkspaceType) => void;
  user: UserTypeWithWorkspaces;
  workspace: LightWorkspaceType;
}

export default function WorkspacePicker({
  onWorkspaceUpdate,
  user,
  workspace,
}: WorkspacePickerProps) {
  const { setNavigationSelection } = usePersistedNavigationSelection();

  return (
    <div className="flex flex-row items-center gap-1 px-3 py-2">
      <Label className="text-xs text-muted-foreground">Workspace:</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            label={workspace ? workspace.name : "Select workspace"}
            variant="ghost"
            size="xs"
            isSelect
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value={workspace.name}>
            {user.workspaces.map((w) => {
              return (
                <DropdownMenuRadioItem
                  key={w.sId}
                  onClick={async () => {
                    await setNavigationSelection({ lastWorkspaceId: w.sId });
                    void onWorkspaceUpdate(w);
                  }}
                  value={w.name}
                >
                  {w.name}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
