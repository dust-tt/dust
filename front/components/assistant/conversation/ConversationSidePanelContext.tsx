import { assertNever } from "@dust-tt/client";
import React, { useEffect, useState } from "react";

import { SIDE_PANEL_HASH_PARAM } from "@app/components/assistant/conversation/constant";
import { useHashParam } from "@app/hooks/useHashParams";
import type { ActionProgressState } from "@app/lib/assistant/state/messageReducer";

type PanelType = "content" | "actions";

type OpenPanelParams =
  | {
      type: "actions";
      messageId: string;
      metadata: AgentActionState;
    }
  | {
      type: "content";
      fileId: string;
      timestamp?: string;
    };

interface AgentActionState {
  actionProgress: ActionProgressState;
  isActing: boolean;
  messageStatus?: "created" | "succeeded" | "failed" | "cancelled";
}

type SidePanelMetadata = AgentActionState | null;

interface ConversationSidePanelContextType {
  currentPanel: PanelType | null;
  openPanel: (params: OpenPanelParams) => void;
  closePanel: () => void;
  data: string | undefined;
  metadata: SidePanelMetadata;
}

const ConversationSidePanelContext = React.createContext<
  ConversationSidePanelContextType | undefined
>(undefined);

export function useConversationSidePanelContext() {
  const context = React.useContext(ConversationSidePanelContext);
  if (!context) {
    throw new Error(
      "useConversationSidePanelContext must be used within a ConversationSidePanelProvider"
    );
  }

  return context;
}

interface ConversationSidePanelProviderProps {
  children: React.ReactNode;
}

export function ConversationSidePanelProvider({
  children,
}: ConversationSidePanelProviderProps) {
  const [currentPanel, setCurrentPanel] = useState<PanelType | null>(null);

  const [data, setData] = useHashParam(SIDE_PANEL_HASH_PARAM);
  const [metadata, setMetadata] = useState<SidePanelMetadata>(null);

  const openPanel = React.useCallback(
    (params: OpenPanelParams) => {
      setCurrentPanel(params.type);

      switch (params.type) {
        case "actions":
          setData(params.messageId);
          setMetadata(params.metadata);
          setCurrentPanel("actions");
          break;
        case "content":
          params.timestamp
            ? setData(`${params.fileId}@${params.timestamp}`)
            : setData(params.fileId);
          setMetadata(null);
          setCurrentPanel("content");
          break;
        default:
          const { type } = params;
          assertNever(type);
      }
    },
    [setData]
  );

  const closePanel = React.useCallback(() => {
    setCurrentPanel(null);
  }, []);

  useEffect(() => {
    if (!data) {
      setCurrentPanel(null);
    }
  }, [data]);

  const value: ConversationSidePanelContextType = React.useMemo(
    () => ({
      currentPanel,
      openPanel,
      closePanel,
      data,
      metadata,
    }),
    [currentPanel, openPanel, closePanel, data, metadata]
  );

  return (
    <ConversationSidePanelContext.Provider value={value}>
      {children}
    </ConversationSidePanelContext.Provider>
  );
}
