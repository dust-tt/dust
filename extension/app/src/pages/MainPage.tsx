import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  LogoHorizontalColorLogo,
  LogoutIcon,
} from "@dust-tt/sparkle";
import { useAuth } from "@extension/components/auth/AuthProvider";
import type { ProtectedRouteChildrenProps } from "@extension/components/auth/ProtectedRoute";
import { ConversationContainer } from "@extension/components/conversation/ConversationContainer";
import { ConversationsListButton } from "@extension/components/conversation/ConversationsListButton";
import { FileDropProvider } from "@extension/components/conversation/FileUploaderContext";
import { Link } from "react-router-dom";

export const MainPage = ({
  user,
  workspace,
  handleLogout,
}: ProtectedRouteChildrenProps) => {
  const { handleSelectWorkspace } = useAuth();

  return (
    <>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2 pb-6">
          <Link to="https://dust.tt" target="_blank">
            <LogoHorizontalColorLogo className="h-4 w-16" />
          </Link>
          {user.workspaces.length > 1 && (
            <div className="flex flex-row items-center gap-2">
              <p className="text-sm text-slate-500">Workspace:</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    label={workspace ? workspace.name : "Select workspace"}
                    variant="ghost"
                    isSelect
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {user.workspaces.map((w) => {
                    return (
                      <DropdownMenuItem
                        key={w.sId}
                        onClick={() => void handleSelectWorkspace(w.sId)}
                        label={w.name}
                      />
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ConversationsListButton size="md" />
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
      </div>
      <div className="h-full w-full pt-28">
        <FileDropProvider>
          <ConversationContainer
            owner={workspace}
            conversationId={null}
            user={user}
          />
        </FileDropProvider>
      </div>
    </>
  );
};
