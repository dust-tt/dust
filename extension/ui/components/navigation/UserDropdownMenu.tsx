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
import { useTheme } from "@extension/ui/hooks/useTheme";

export const UserDropdownMenu = () => {
  const { theme, updateTheme } = useTheme();
  const { user, workspace, handleLogout, handleSelectWorkspace } =
    useExtensionAuth();

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
        {workspace && (
          <>
            <DropdownMenuLabel label="Workspace" />
            <DropdownMenuRadioGroup value={workspace.sId}>
              {user.workspaces.map((w) => {
                return (
                  <DropdownMenuRadioItem
                    key={w.sId}
                    onClick={() => void handleSelectWorkspace(w)}
                    label={w.name}
                    value={w.sId}
                  />
                );
              })}
            </DropdownMenuRadioGroup>
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
                onClick={() => void updateTheme("light")}
              />
              <DropdownMenuRadioItem
                value="dark"
                label="Dark"
                onClick={() => void updateTheme("dark")}
              />
              <DropdownMenuRadioItem
                value="system"
                label="System"
                onClick={() => void updateTheme("system")}
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
