import { trackEvent, TRACKING_AREAS } from "@app/shared/lib/tracking";
import type { StoredUser } from "@app/shared/services/auth";
import { useAuth } from "@app/ui/components/auth/AuthProvider";
import { useTheme } from "@app/ui/hooks/useTheme";
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

interface UserDropdownMenuProps {
  handleLogout: () => void;
  user: StoredUser;
}

export const UserDropdownMenu = ({
  user,
  handleLogout,
}: UserDropdownMenuProps) => {
  const { theme, updateTheme } = useTheme();
  const { workspace, handleSelectWorkspace } = useAuth();

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
                onClick={() => {
                  trackEvent({
                    area: TRACKING_AREAS.SETTINGS,
                    object: "theme_change",
                    action: "select",
                    extra: {
                      theme: "light",
                    },
                  });
                  void updateTheme("light");
                }}
              />
              <DropdownMenuRadioItem
                value="dark"
                label="Dark"
                onClick={() => {
                  trackEvent({
                    area: TRACKING_AREAS.SETTINGS,
                    object: "theme_change",
                    action: "select",
                    extra: {
                      theme: "dark",
                    },
                  });
                  void updateTheme("dark");
                }}
              />
              <DropdownMenuRadioItem
                value="system"
                label="System"
                onClick={() => {
                  trackEvent({
                    area: TRACKING_AREAS.SETTINGS,
                    object: "theme_change",
                    action: "select",
                    extra: {
                      theme: "system",
                    },
                  });
                  void updateTheme("system");
                }}
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
