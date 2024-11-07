import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ExternalLinkIcon,
  LogoHorizontalColorLogo,
  LogoutIcon,
} from "@dust-tt/sparkle";
import type { ProtectedRouteChildrenProps } from "@extension/components/auth/ProtectedRoute";
import { ConversationContainer } from "@extension/components/conversation/ConversationContainer";

export const MainPage = ({
  user,
  workspace,
  handleLogout,
}: ProtectedRouteChildrenProps) => {
  return (
    <>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 pb-6">
          <LogoHorizontalColorLogo className="h-4 w-16" />
          <Button
            icon={ExternalLinkIcon}
            variant="ghost"
            href="https://dust.tt"
            target="_blank"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <>
              <span className="sr-only">Open user menu</span>
              <Avatar
                size="md"
                visual={
                  user.image
                    ? user.image
                    : "https://gravatar.com/avatar/anonymous?d=mp"
                }
                onClick={() => {
                  "clickable";
                }}
              />
            </>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              icon={LogoutIcon}
              label="Sign out"
              onClick={handleLogout}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="h-full w-full pt-28">
        <ConversationContainer
          owner={workspace}
          conversationId={null}
          user={user}
        />
      </div>
    </>
  );
};
