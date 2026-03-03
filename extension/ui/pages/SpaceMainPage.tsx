import { FileDropProvider } from "@app/components/assistant/conversation/FileUploaderContext";
import { InputBarProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { SpaceConversationsPage } from "@app/components/pages/conversation/SpaceConversationsPage";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  BarHeader,
  Button,
  MenuIcon,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { ActionValidationProvider } from "@extension/ui/components/conversation/ActionValidationProvider";
import { useContext } from "react";

export const SpaceMainPage = () => {
  const { workspace: owner } = useAuth();
  const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);

  return (
    <FileDropProvider>
      <ActionValidationProvider>
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent
            side="left"
            className="flex w-full max-w-72 flex-1 bg-muted-background dark:bg-muted-background-night"
          >
            <SheetHeader className="bg-muted-background p-0" hideButton>
              <SheetTitle className="hidden" />
            </SheetHeader>
            <div className="flex flex-col grow p-1">
              <AgentSidebarMenu owner={owner} hideActions hideInAppBanner />
            </div>
          </SheetContent>
        </Sheet>
        <BarHeader
          className="justify-between"
          leftActions={
            <Button
              variant="ghost"
              icon={MenuIcon}
              onClick={() => setSidebarOpen(true)}
            />
          }
        />
        <div className="h-full w-full pt-16">
          <InputBarProvider origin="extension">
            <SpaceConversationsPage />
          </InputBarProvider>
        </div>
      </ActionValidationProvider>
    </FileDropProvider>
  );
};
