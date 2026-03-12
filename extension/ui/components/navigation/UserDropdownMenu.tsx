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
  LightModeIcon,
  LogoutIcon,
} from "@dust-tt/sparkle";
import { useExtensionAuth } from "@extension/ui/components/auth/AuthProvider";
import { useMemo } from "react";

export const UserDropdownMenu = () => {
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
            <DropdownMenuLabel label="Workspace" />
            <WorkspacePickerRadioGroup
              user={user}
              workspace={workspace}
              onSelectOrganization={handleSelectOrganization}
            />
          </>
        )}
        <DropdownMenuLabel label="Preferences" />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger label="Theme" icon={LightModeIcon} />
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme}>
              <DropdownMenuRadioItem
                value="light"
                label="Light"
                onClick={() => setTheme("light")}
              />
              <DropdownMenuRadioItem
                value="dark"
                label="Dark"
                onClick={() => setTheme("dark")}
              />
              <DropdownMenuRadioItem
                value="system"
                label="System"
                onClick={() => setTheme("system")}
              />
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuLabel label="Account" />
        <DropdownMenuItem
          icon={LogoutIcon}
          label="Sign out"
          onClick={handleLogout}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
