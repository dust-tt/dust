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
import { AssistantFavorites } from "@extension/components/assistants/AssistantFavorites";
import { useAuth } from "@extension/components/auth/AuthProvider";
import type { ProtectedRouteChildrenProps } from "@extension/components/auth/ProtectedRoute";
import { ConversationContainer } from "@extension/components/conversation/ConversationContainer";
import { ConversationsListButton } from "@extension/components/conversation/ConversationsListButton";
import { FileDropProvider } from "@extension/components/conversation/FileUploaderContext";
import { DropzoneContainer } from "@extension/components/DropzoneContainer";
import { InputBarProvider } from "@extension/components/input_bar/InputBarContext";
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
        <div className="fixed bottom-4 right-4">
          <Link to="https://dust.tt" target="_blank">
            <LogoHorizontalColorLogo className="h-6 w-24" />
          </Link>
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
      <div className="h-full w-full pt-28 max-w-4xl mx-auto flex justify-center">
        <div className="flex flex-col items-center">
          <FileDropProvider>
            <DropzoneContainer
              description="Drag and drop your text files (txt, doc, pdf) and image files (jpg, png) here."
              title="Attach files to the conversation"
            >
              <InputBarProvider>
                <ConversationContainer
                  owner={workspace}
                  conversationId={null}
                  user={user}
                />
                <AssistantFavorites />
              </InputBarProvider>
            </DropzoneContainer>
          </FileDropProvider>
        </div>
      </div>
    </>
  );
};
