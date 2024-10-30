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

export default function WorkspacePicker({
  user,
  workspace,
  onWorkspaceUpdate,
}: {
  user: UserTypeWithWorkspaces;
  workspace: LightWorkspaceType | null;
  readOnly: boolean;
  onWorkspaceUpdate: (w: LightWorkspaceType) => void;
}) {
  return (
    <NewDropdownMenu>
      <NewDropdownMenuTrigger asChild>
        <Button
          label={workspace ? workspace.name : "Select workspace"}
          variant="ghost"
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
  );
}
