import { DropdownMenu } from "@dust-tt/sparkle";
import { UserType, WorkspaceType } from "@dust-tt/types";

export default function WorkspacePicker({
  user,
  workspace,
  onWorkspaceUpdate,
}: {
  user: UserType;
  workspace: WorkspaceType | null;
  readOnly: boolean;
  onWorkspaceUpdate: (w: WorkspaceType) => void;
}) {
  return (
    <DropdownMenu className="flex">
      <DropdownMenu.Button
        label={workspace ? workspace.name : "Select workspace"}
      />

      <DropdownMenu.Items origin="topLeft">
        {user.workspaces.map((w) => {
          return (
            <DropdownMenu.Item
              key={w.sId}
              onClick={() => void onWorkspaceUpdate(w)}
              label={w.name}
            />
          );
        })}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
