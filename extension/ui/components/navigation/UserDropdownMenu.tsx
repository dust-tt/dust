import { useTheme } from "@app/components/sparkle/ThemeContext";
import { WorkspacePickerRadioGroup } from "@app/components/WorkspacePicker";
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  LogOut01,
  Sun,
} from "@dust-tt/sparkle";
import { useExtensionAuth } from "@extension/ui/components/auth/AuthProvider";
import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

export const UserDropdownMenu = () => {
  const { t } = useLingui();
  const { theme, setTheme } = useTheme();
  const { user, workspace, handleLogout, handleSelectOrganization } =
    useExtensionAuth();

  const hasMultipleOrgs = useMemo(
    () => !!user?.organizations && user.organizations.length > 1,
    [user]
  );

  if (!user) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <div>
          <Avatar
            size="sm"
            visual={
              user.image
                ? user.image
                : "https://gravatar.com/avatar/anonymous?d=mp"
            }
            onClick={() => {
              "clickable";
            }}
            isRounded
          />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {hasMultipleOrgs && workspace && (
          <>
            <DropdownMenuLabel label={t`Workspace`} />
            <WorkspacePickerRadioGroup
              user={user}
              workspace={workspace}
              onSelectOrganization={handleSelectOrganization}
            />
          </>
        )}
        <DropdownMenuLabel label={t`Preferences`} />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger label={t`Theme`} icon={Sun} />
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme}>
              <DropdownMenuRadioItem
                value="light"
                label={t`Light`}
                onClick={() => setTheme("light")}
              />
              <DropdownMenuRadioItem
                value="dark"
                label={t`Dark`}
                onClick={() => setTheme("dark")}
              />
              <DropdownMenuRadioItem
                value="system"
                label={t`System`}
                onClick={() => setTheme("system")}
              />
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuLabel label={t`Account`} />
        <DropdownMenuItem
          icon={LogOut01}
          label={t`Sign out`}
          onClick={handleLogout}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
