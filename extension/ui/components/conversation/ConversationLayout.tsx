import { FileDropProvider } from "@app/components/assistant/conversation/FileUploaderContext";
import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  ArrowLeftIcon,
  BarHeader,
  Button,
  MenuIcon,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import type React from "react";
import { useContext } from "react";
import { useNavigate } from "react-router-dom";

interface ConversationLayoutProps {
  title: string;
  backHref?: string;
  rightActions?: React.ReactNode;
  children: React.ReactNode;
}

export const ConversationLayout = ({
  title,
  backHref,
  rightActions,
  children,
}: ConversationLayoutProps) => {
  const { workspace: owner } = useAuth();
  const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);
  const navigate = useNavigate();

  return (
    <FileDropProvider>
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
          <div className="flex flex-row">
            <Button
              variant="ghost"
              icon={MenuIcon}
              onClick={() => setSidebarOpen(true)}
            />
            {backHref && (
              <Button
                variant="ghost"
                icon={ArrowLeftIcon}
                onClick={() => navigate(backHref)}
                tooltip="Go back to project homepage"
              />
            )}
          </div>
        }
        rightActions={rightActions}
      />
      <div className="h-full w-full pt-16">{children}</div>
    </FileDropProvider>
  );
};
