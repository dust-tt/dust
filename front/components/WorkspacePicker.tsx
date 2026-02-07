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
import { getApiBaseUrl } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import type { LightWorkspaceType, UserTypeWithWorkspaces } from "@app/types";
import { isDevelopment } from "@app/types";

interface WorkspacePickerRadioGroupProps {
  user: UserTypeWithWorkspaces;
  workspace: LightWorkspaceType;
}

export const WorkspacePickerRadioGroup = ({
  user,
  workspace,
}: WorkspacePickerRadioGroupProps) => {
  const { setNavigationSelection } = usePersistedNavigationSelection();
  const router = useAppRouter();

  const organizations = user.organizations;
  const hasOrganizations = organizations && organizations.length > 0;

  return (
    <DropdownMenuRadioGroup value={workspace.sId}>
      {hasOrganizations
        ? organizations.map((org) => {
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
                      `${getApiBaseUrl()}/api/workos/login?organizationId=${org.id}`
                    );
                  }
                }}
              >
                {org.name}
              </DropdownMenuRadioItem>
            );
          })
        : isDevelopment()
          ? user.workspaces.map((ws) => {
              return (
                <DropdownMenuRadioItem
                  key={ws.sId}
                  value={ws.sId}
                  onClick={async () => {
                    if (ws.sId !== workspace.sId) {
                      await setNavigationSelection({
                        lastWorkspaceId: ws.sId,
                      });
                      await router.push(`/w/${ws.sId}/`);
                    }
                  }}
                >
                  {ws.name}
                </DropdownMenuRadioItem>
              );
            })
          : null}
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
