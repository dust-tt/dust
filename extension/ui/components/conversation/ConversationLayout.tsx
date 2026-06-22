import { FileDropProvider } from "@app/components/assistant/conversation/FileUploaderContext";
import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { SidebarBanners } from "@app/components/navigation/AppStatusBanner";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  ArrowLeft,
  BarHeader,
  Button,
  Menu01,
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
  centerActions?: React.ReactNode;
  rightActions?: React.ReactNode;
  children: React.ReactNode;
}

export const ConversationLayout = ({
  title,
  backHref,
  centerActions,
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
          className="flex w-full max-w-72 flex-1 bg-app-background dark:bg-app-background-night"
        >
          <SheetHeader className="bg-muted-background p-0" hideButton>
            <SheetTitle className="hidden" />
          </SheetHeader>
          <SidebarBanners />
          <div className="flex flex-col grow p-1">
            <AgentSidebarMenu owner={owner} hideActions hideInAppBanner />
          </div>
        </SheetContent>
      </Sheet>
      <BarHeader
        title={title}
        tooltip={title}
        className="justify-between"
        size="sm"
        leftActions={
          <div className="flex flex-row">
            {backHref ? (
              <Button
                variant="ghost"
                icon={ArrowLeft}
                onClick={() => navigate(backHref)}
                tooltip="Go back to Pod homepage"
              />
            ) : (
              <Button
                variant="ghost"
                icon={Menu01}
                onClick={() => setSidebarOpen(true)}
              />
            )}
          </div>
        }
        centerActions={centerActions}
        rightActions={rightActions}
      />
      <div className="h-full w-full pt-16">{children}</div>
    </FileDropProvider>
  );
};
