import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainer";
import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { Button, MenuIcon } from "@dust-tt/sparkle";
import { sendGetSessionInfoMessage } from "@extension/platforms/chrome/messages";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import { ExtensionInputBarProvider } from "@extension/ui/components/conversation/ExtensionInputBarProvider";
import { useContext, useEffect, useMemo, useState } from "react";

interface ConversationContainerProps {
  workspace: LightWorkspaceType;
  user: UserType;
  subscription: SubscriptionType;
  conversationId: string | null;
  conversation?: ConversationWithoutContentType;
  serverId?: string;
}

const SUGGESTIONS = {
  formHelper: {
    id: "form_helper",
    title: "Dust can help you fill out forms",
    description: "Ask an agent to get started",
  },
  multiTab: {
    id: "multi_tab",
    title: "Dust can work across all your open tabs",
    description: "Ask an agent to get started",
  },
} as const;

export const ConversationContainer = ({
  workspace,
  user,
  subscription,
  conversationId,
  conversation,
  serverId,
}: ConversationContainerProps) => {
  const platform = usePlatform();
  const { currentPanel } = useConversationSidePanelContext();
  const { setSidebarOpen } = useContext(SidebarContext);

  const clientSideMCPServerIds = useMemo(
    () => (serverId ? [serverId] : undefined),
    [serverId]
  );

  const [suggestion, setSuggestion] = useState<
    | {
        id: string;
        title: string;
        description: string;
      }
    | undefined
  >(undefined);

  const handleDismissSuggestion = async (id: string) => {
    const dismissed = await platform.storage.get<string[]>(
      "dismissedSuggestions"
    );
    const updated = [...(dismissed ?? []), id];
    await platform.storage.set("dismissedSuggestions", updated);
    setSuggestion(undefined);
  };

  useEffect(() => {
    const isSuggestionDismissed = async (id: string): Promise<boolean> => {
      const dismissed = await platform.storage.get<string[]>(
        "dismissedSuggestions"
      );
      return (dismissed ?? []).includes(id);
    };

    void sendGetSessionInfoMessage()
      .then(async (response) => {
        if (
          response.currentTabHasForm &&
          !(await isSuggestionDismissed(SUGGESTIONS.formHelper.id))
        ) {
          setSuggestion(SUGGESTIONS.formHelper);
          return;
        }
        if (
          response.tabsCount > 2 &&
          !(await isSuggestionDismissed(SUGGESTIONS.multiTab.id))
        ) {
          setSuggestion(SUGGESTIONS.multiTab);
        }
      })
      .catch(() => {
        // Ignore errors, this is just an optional suggestion.
      });
  }, []);

  return (
    <ExtensionInputBarProvider
      workspace={workspace}
      conversationId={conversationId}
    >
      <div className={currentPanel ? "hidden" : "flex flex-col h-full w-full"}>
        <ConversationContainerVirtuoso
          owner={workspace}
          user={user}
          subscription={subscription}
          conversationId={conversationId}
          clientSideMCPServerIds={clientSideMCPServerIds}
          suggestion={suggestion}
          onDismissSuggestion={handleDismissSuggestion}
        />
      </div>
      {conversation && currentPanel && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background dark:bg-background-night">
          {/* Hamburger button overlaid in the pl-14 area of AppLayoutTitle header */}
          <div className="absolute left-0 top-0 z-10 flex h-[58px] shrink-0 items-center px-2">
            <Button
              variant="ghost"
              icon={MenuIcon}
              onClick={() => setSidebarOpen(true)}
            />
          </div>
          <ConversationSidePanelContent
            owner={workspace}
            conversation={conversation}
            currentPanel={currentPanel}
          />
        </div>
      )}
    </ExtensionInputBarProvider>
  );
};
