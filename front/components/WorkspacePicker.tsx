import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import type {
  LightWorkspaceType,
  UserTypeWithWorkspaces,
} from "@dust-tt/types";

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
  return (
    <div className="flex flex-row items-center gap-1 px-3 py-2">
      <p className="text-xs text-muted-foreground">Workspace:</p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            label={workspace ? workspace.name : "Select workspace"}
            variant="ghost"
            isSelect
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent>
          {user.workspaces.map((w) => {
            return (
              <DropdownMenuItem
                key={w.sId}
                onClick={() => void onWorkspaceUpdate(w)}
                label={w.name}
              />
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
