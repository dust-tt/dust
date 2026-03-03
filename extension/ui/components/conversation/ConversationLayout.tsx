import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
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
import { FileDropProvider } from "@extension/ui/components/conversation/FileUploaderContext";
import type React from "react";
import { useContext } from "react";

interface ConversationLayoutProps {
  title: string;
  rightActions?: React.ReactNode;
  children: React.ReactNode;
}

export const ConversationLayout = ({
  title,
  rightActions,
  children,
}: ConversationLayoutProps) => {
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
          title={title}
          tooltip={title}
          className="justify-between"
          leftActions={
            <Button
              variant="ghost"
              icon={MenuIcon}
              onClick={() => setSidebarOpen(true)}
            />
          }
          rightActions={rightActions}
        />
        <div className="h-full w-full pt-16">{children}</div>
      </ActionValidationProvider>
    </FileDropProvider>
  );
};
