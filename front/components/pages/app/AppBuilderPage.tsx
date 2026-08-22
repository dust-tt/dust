import { AppBuilderShell } from "@app/components/app/AppBuilderShell";
import { AppConversationPane } from "@app/components/app/AppConversationPane";
import { AppFramePane } from "@app/components/app/AppFramePane";
import { EditPodTitleDialog } from "@app/components/pod/EditPodTitleDialog";
import { useActiveAppId } from "@app/hooks/useActiveAppId";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { Button, Pencil01, Spinner } from "@dust-tt/sparkle";
import { useState } from "react";

/**
 * The App builder: the App's single continuous conversation on the left, the running App on the
 * right. The conversation id is always known here, so `ConversationContainerVirtuoso` resumes that
 * thread instead of creating one and navigating away.
 */
export function AppBuilderPage() {
  const owner = useWorkspace();
  const { subscription, user } = useAuth();
  const appId = useActiveAppId();
  const [isRenaming, setIsRenaming] = useState(false);

  const { spaceInfo: app, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: appId ?? "",
  });

  if (isSpaceInfoLoading) {
    return (
      <AppBuilderShell owner={owner}>
        <div className="flex h-full w-full items-center justify-center">
          <Spinner />
        </div>
      </AppBuilderShell>
    );
  }

  if (!app || !app.isApp || !app.appConversationId) {
    return (
      <AppBuilderShell owner={owner}>
        <div className="flex h-full w-full items-center justify-center p-8 text-center">
          <p className="copy-base text-muted-foreground dark:text-muted-foreground-night">
            This App is no longer available.
          </p>
        </div>
      </AppBuilderShell>
    );
  }

  return (
    <AppBuilderShell
      owner={owner}
      header={
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate heading-sm text-foreground dark:text-foreground-night">
            {app.name}
          </span>
          {app.isEditor && (
            <Button
              size="xs"
              variant="ghost"
              icon={Pencil01}
              tooltip="Rename this App"
              onClick={() => setIsRenaming(true)}
            />
          )}
        </div>
      }
    >
      <div className="flex h-full min-h-0 w-full">
        <div className="flex h-full min-h-0 w-[40%] min-w-[360px] max-w-[560px] flex-col border-r border-border dark:border-border-night">
          <AppConversationPane
            owner={owner}
            subscription={subscription}
            user={user}
            conversationId={app.appConversationId}
          />
        </div>
        <div className="h-full min-h-0 flex-1">
          <AppFramePane owner={owner} app={app} />
        </div>
      </div>

      {isRenaming && (
        <EditPodTitleDialog
          isOpen
          onClose={() => setIsRenaming(false)}
          owner={owner}
          podId={app.sId}
          currentTitle={app.name}
        />
      )}
    </AppBuilderShell>
  );
}
