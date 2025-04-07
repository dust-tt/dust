import { AssistantFavorites } from "@app/ui/components/assistants/AssistantFavorites";
import { useAuth } from "@app/ui/components/auth/AuthProvider";
import type { ProtectedRouteChildrenProps } from "@app/ui/components/auth/ProtectedRoute";
import { ConversationContainer } from "@app/ui/components/conversation/ConversationContainer";
import { ConversationsListButton } from "@app/ui/components/conversation/ConversationsListButton";
import { FileDropProvider } from "@app/ui/components/conversation/FileUploaderContext";
import { DropzoneContainer } from "@app/ui/components/DropzoneContainer";
import { InputBarProvider } from "@app/ui/components/input_bar/InputBarContext";
import { UserDropdownMenu } from "@app/ui/components/navigation/UserDropdownMenu";
import {
  BarHeader,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

export const MainPage = ({
  user,
  workspace,
  handleLogout,
}: ProtectedRouteChildrenProps) => {
  const { handleSelectWorkspace } = useAuth();

  const isMac = /macintosh|mac os x/i.test(navigator.userAgent);
  const shortcut = isMac ? "⇧⌘E" : "⇧+Ctrl+E";

  return (
    <>
      <BarHeader
        title={""}
        tooltip={"Conversation"}
        leftActions={
          <div className="flex flex-col gap-2">
            {user.workspaces.length > 1 && (
              <div className="flex flex-row items-center gap-2">
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Workspace:
                </p>
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
                          onClick={() => void handleSelectWorkspace(w)}
                          label={w.name}
                        />
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        }
        rightActions={
          <div className="flex flex-row items-right space-x-1">
            <ConversationsListButton size="sm" />
            <UserDropdownMenu user={user} handleLogout={handleLogout} />
          </div>
        }
      />
      <div className="flex items-start justify-between">
        <div className="fixed bottom-0 right-0 z-10 p-2 text-sm element">
          <p className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            {shortcut}
          </p>
        </div>
      </div>
      <div className="h-full w-full pt-28 max-w-4xl mx-auto flex justify-center">
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
              <AssistantFavorites user={user} />
            </InputBarProvider>
          </DropzoneContainer>
        </FileDropProvider>
      </div>
    </>
  );
};
