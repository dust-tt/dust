import { assertNever } from "@dust-tt/client";
import React, { useEffect, useState } from "react";

import { useHashParam } from "@app/hooks/useHashParams";
import type { ActionProgressState } from "@app/lib/assistant/state/messageReducer";
import type { ConversationSidePanelType } from "@app/types/conversation_side_panel";
import {
  AGENT_ACTIONS_SIDE_PANEL_TYPE,
  INTERACTIVE_CONTENT_SIDE_PANEL_TYPE,
  SIDE_PANEL_HASH_PARAM,
  SIDE_PANEL_TYPE_HASH_PARAM,
} from "@app/types/conversation_side_panel";

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
      metadata?: never;
    };

interface AgentActionState {
  actionProgress: ActionProgressState;
}

type SidePanelMetadata = OpenPanelParams["metadata"] | undefined;

const isSupportedPanelType = (
  type: string | undefined
): type is ConversationSidePanelType =>
  type === "actions" || type === "content";

interface ConversationSidePanelContextType {
  currentPanel: ConversationSidePanelType;
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
  const [data, setData] = useHashParam(SIDE_PANEL_HASH_PARAM);
  const [currentPanel, setCurrentPanel] = useHashParam(
    SIDE_PANEL_TYPE_HASH_PARAM
  );
  const [metadata, setMetadata] = useState<SidePanelMetadata>(undefined);

  const openPanel = (params: OpenPanelParams) => {
    setCurrentPanel(params.type);

    switch (params.type) {
      case AGENT_ACTIONS_SIDE_PANEL_TYPE:
        /**
         * If the panel is already open for the same messageId,
         * we close it.
         */
        if (params.messageId === data) {
          closePanel();
          return;
        }
        // TODO
        setData(params.messageId);
        setMetadata(params.metadata);
        break;
      case INTERACTIVE_CONTENT_SIDE_PANEL_TYPE:
        params.timestamp
          ? setData(`${params.fileId}@${params.timestamp}`)
          : setData(params.fileId);
        setMetadata(undefined);
        break;
      default:
        assertNever(params);
    }
  };

  const closePanel = () => {
    setData(undefined);
    setMetadata(undefined);
    setCurrentPanel(undefined);
  };

  // Initialize panel state from URL hash parameters
  useEffect(() => {
    if (data && currentPanel) {
      setCurrentPanel(currentPanel);

      // Set default metadata for actions panel when opened from URL
      if (currentPanel === "actions" && !metadata) {
        setMetadata({
          actionProgress: new Map(),
        });
      }
    } else if (!data) {
      setCurrentPanel(undefined);
    }
  }, [data, currentPanel, setCurrentPanel, metadata]);

  return (
    <ConversationSidePanelContext.Provider
      value={{
        currentPanel: isSupportedPanelType(currentPanel)
          ? currentPanel
          : undefined,
        openPanel,
        closePanel,
        data,
        metadata,
      }}
    >
      {children}
    </ConversationSidePanelContext.Provider>
  );
}
