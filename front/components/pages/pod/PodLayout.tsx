import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { ErrorDisplay } from "@app/components/assistant/conversation/ConversationError";
import { FileDropProvider } from "@app/components/assistant/conversation/FileUploaderContext";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { ErrorBoundary } from "@app/components/error_boundary/ErrorBoundary";
import {
  useSetHasTitle,
  useSetPageTitle,
} from "@app/components/sparkle/AppLayoutContext";
import { useActivePodId } from "@app/hooks/useActivePodId";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import type { ReactNode } from "react";

interface PodLayoutProps {
  children: ReactNode;
  owner: LightWorkspaceType;
}

export function PodLayout({ children, owner }: PodLayoutProps) {
  const activePodId = useActivePodId();

  const { spaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: activePodId,
  });

  const pageTitle = spaceInfo ? `Dust - ${spaceInfo.name}` : "Dust";

  useSetHasTitle(!!activePodId);
  useSetPageTitle(pageTitle);

  return (
    <BlockedActionsProvider owner={owner}>
      <ErrorBoundary fallback={<UncaughtPodErrorFallback />}>
        <div className="flex h-panel w-full flex-col">
          <FileDropProvider>
            <GenerationContextProvider>{children}</GenerationContextProvider>
          </FileDropProvider>
        </div>
      </ErrorBoundary>
    </BlockedActionsProvider>
  );
}

function UncaughtPodErrorFallback() {
  return (
    <ErrorDisplay
      title="Something unexpected happened"
      message={[
        "Try refreshing the page to continue.",
        "Still having trouble? Reach out at support@dust.tt",
      ]}
    />
  );
}
