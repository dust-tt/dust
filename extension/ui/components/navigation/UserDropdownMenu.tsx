import type { StoredUser } from "@app/shared/services/auth";
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
