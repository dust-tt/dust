import {
  Button,
  NewDropdownMenu,
  NewDropdownMenuContent,
  NewDropdownMenuItem,
  NewDropdownMenuTrigger,
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
    <div className="flex flex-row items-center gap-2">
      <p className="text-sm text-slate-500">Workspace:</p>
      <NewDropdownMenu>
        <NewDropdownMenuTrigger asChild>
          <Button
            label={workspace ? workspace.name : "Select workspace"}
            variant="ghost"
            isSelect
          />
        </NewDropdownMenuTrigger>

        <NewDropdownMenuContent>
          {user.workspaces.map((w) => {
            return (
              <NewDropdownMenuItem
                key={w.sId}
                onClick={() => void onWorkspaceUpdate(w)}
                label={w.name}
              />
            );
          })}
        </NewDropdownMenuContent>
      </NewDropdownMenu>
    </div>
  );
}
