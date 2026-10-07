import config from "@app/lib/api/config";
import { useAppRouter } from "@app/lib/platform";
import { isDevelopment } from "@app/types/shared/env";
import type {
  LightWorkspaceType,
  UserTypeWithWorkspaces,
} from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Label,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

interface WorkspacePickerRadioGroupProps {
  user: UserTypeWithWorkspaces;
  workspace: Pick<LightWorkspaceType, "sId" | "name">;
  onSelectOrganization?: (organizationId: string) => void;
  onSelectWorkspace?: (workspaceId: string) => void;
}

export const WorkspacePickerRadioGroup = ({
  user,
  workspace,
  onSelectOrganization,
  onSelectWorkspace,
}: WorkspacePickerRadioGroupProps) => {
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
                value={org.externalId || ""}
                onClick={async () => {
                  if (org.externalId && org.externalId !== workspace.sId) {
                    if (onSelectOrganization) {
                      onSelectOrganization(org.id);
                    } else {
                      await router.push(
                        `${config.getApiBaseUrl()}/api/workos/login?organizationId=${org.id}`
                      );
                    }
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
                      if (onSelectWorkspace) {
                        onSelectWorkspace(ws.sId);
                      } else {
                        await router.push(`/w/${ws.sId}/`);
                      }
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
  workspace: Pick<LightWorkspaceType, "sId" | "name">;
}

export default function WorkspacePicker({
  user,
  workspace,
}: WorkspacePickerProps) {
  const { t } = useLingui();
  return (
    <div className="flex flex-row items-center gap-1 px-3 py-2">
      <Label className="text-xs text-muted-foreground">
        <Trans>Workspace:</Trans>
      </Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            label={workspace ? workspace.name : t`Select workspace`}
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
