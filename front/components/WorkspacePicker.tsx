import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Label,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";

import { usePersistedNavigationSelection } from "@app/hooks/usePersistedNavigationSelection";
import type { LightWorkspaceType, UserTypeWithWorkspaces } from "@app/types";

interface WorkspacePickerRadioGroupProps {
  user: UserTypeWithWorkspaces;
  workspace: LightWorkspaceType;
}

export const WorkspacePickerRadioGroup = ({
  user,
  workspace,
}: WorkspacePickerRadioGroupProps) => {
  const { setNavigationSelection } = usePersistedNavigationSelection();
  const router = useRouter();

  return (
    <DropdownMenuRadioGroup value={workspace.sId}>
      {user.organizations &&
        user.organizations.map((org) => {
          return (
            <DropdownMenuRadioItem
              key={org.id}
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              value={org.externalId || ""}
              onClick={async () => {
                if (org.externalId && org.externalId !== workspace.sId) {
                  await setNavigationSelection({
                    lastWorkspaceId: org.externalId,
                  });
                  await router.push(
                    `/api/workos/login?organizationId=${org.id}`
                  );
                }
              }}
            >
              {org.name}
            </DropdownMenuRadioItem>
          );
        })}
    </DropdownMenuRadioGroup>
  );
};
interface WorkspacePickerProps {
  user: UserTypeWithWorkspaces;
  workspace: LightWorkspaceType;
}

export default function WorkspacePicker({
  user,
  workspace,
}: WorkspacePickerProps) {
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
          <WorkspacePickerRadioGroup user={user} workspace={workspace} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
