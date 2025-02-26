import {
  Avatar,
  BarHeader,
  Button,
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
import { AssistantFavorites } from "@extension/components/assistants/AssistantFavorites";
import { useAuth } from "@extension/components/auth/AuthProvider";
import type { ProtectedRouteChildrenProps } from "@extension/components/auth/ProtectedRoute";
import { ConversationContainer } from "@extension/components/conversation/ConversationContainer";
import { ConversationsListButton } from "@extension/components/conversation/ConversationsListButton";
import { FileDropProvider } from "@extension/components/conversation/FileUploaderContext";
import { DropzoneContainer } from "@extension/components/DropzoneContainer";
import { InputBarProvider } from "@extension/components/input_bar/InputBarContext";
import { getTheme, saveTheme } from "@extension/lib/storage";
import { useEffect, useState } from "react";
export type Theme = "light" | "dark" | "system";

export const MainPage = ({
  user,
  workspace,
  handleLogout,
}: ProtectedRouteChildrenProps) => {
  const { handleSelectWorkspace } = useAuth();

  const isMac = /macintosh|mac os x/i.test(navigator.userAgent);
  const shortcut = isMac ? "⇧⌘E" : "⇧+Ctrl+E";

  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const loadTheme = async () => {
      const savedTheme = await getTheme();
      setTheme(savedTheme as Theme);
    };
    void loadTheme();
  }, []);

  return (
    <>
      <BarHeader
        title={""}
        tooltip={"Conversation"}
        leftActions={
          <div className="flex flex-col gap-2">
            {user.workspaces.length > 1 && (
              <div className="flex flex-row items-center gap-2">
                <p className="text-sm text-slate-500 dark:text-slate-500-night">
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
                        onClick={() => {
                          void saveTheme("light");
                        }}
                      />
                      <DropdownMenuRadioItem
                        value="dark"
                        label="Dark"
                        onClick={() => {
                          void saveTheme("dark");
                        }}
                      />
                      <DropdownMenuRadioItem
                        value="system"
                        label="System"
                        onClick={() => {
                          void saveTheme("system");
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
          </div>
        }
      />
      <div className="flex items-start justify-between">
        <div className="fixed bottom-0 right-0 z-10 p-2 text-sm element">
          <p className="text-sm font-normal text-element-700 dark:text-element-700-night">
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
