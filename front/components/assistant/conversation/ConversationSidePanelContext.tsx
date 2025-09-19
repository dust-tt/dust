import React, { useEffect } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

import { useHashParam } from "@app/hooks/useHashParams";
import { assertNever } from "@app/types";
import type { ConversationSidePanelType } from "@app/types/conversation_side_panel";
import {
  AGENT_ACTIONS_SIDE_PANEL_TYPE,
  CONTENT_CREATION_SIDE_PANEL_TYPE,
  SIDE_PANEL_HASH_PARAM,
  SIDE_PANEL_TYPE_HASH_PARAM,
} from "@app/types/conversation_side_panel";

type OpenPanelParams =
  | {
      type: "actions";
      messageId: string;
    }
  | {
      type: "content_creation";
      fileId: string;
      timestamp?: string;
    };

const isSupportedPanelType = (
  type: string | undefined
): type is ConversationSidePanelType =>
  type === "actions" || type === "content_creation";

interface ConversationSidePanelContextType {
  currentPanel: ConversationSidePanelType;
  openPanel: (params: OpenPanelParams) => void;
  closePanel: () => void;
  onPanelClosed: () => void;
  setPanelRef: (ref: ImperativePanelHandle | null) => void;
  panelRef: React.MutableRefObject<ImperativePanelHandle | null>;
  data: string | undefined;
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

  const panelRef = React.useRef<ImperativePanelHandle | null>(null);

  const setPanelRef = (ref: ImperativePanelHandle | null) => {
    panelRef.current = ref;
  };

  const openPanel = (params: OpenPanelParams) => {
    setCurrentPanel(params.type);

    switch (params.type) {
      case AGENT_ACTIONS_SIDE_PANEL_TYPE: {
        /**
         * If the panel is already open for the same messageId,
         * we close it.
         */
        if (params.messageId === data) {
          closePanel();
          return;
        }

        setData(params.messageId);
        break;
      }

      case CONTENT_CREATION_SIDE_PANEL_TYPE:
        params.timestamp
          ? setData(`${params.fileId}@${params.timestamp}`)
          : setData(params.fileId);
        break;

      default:
        assertNever(params);
    }
  };

  const closePanel = () => {
    if (panelRef && panelRef.current && panelRef.current.getSize()) {
      panelRef.current.collapse();
    }
  };

  const onPanelClosed = () => {
    setData(undefined);
    setCurrentPanel(undefined);
  };

  // Initialize panel state from URL hash parameters
  useEffect(() => {
    if (data && currentPanel) {
      setCurrentPanel(currentPanel);
    } else if (!data) {
      closePanel();
    }
  }, [data, currentPanel, setCurrentPanel]);

  return (
    <ConversationSidePanelContext.Provider
      value={{
        currentPanel: isSupportedPanelType(currentPanel)
          ? currentPanel
          : undefined,
        openPanel,
        closePanel,
        onPanelClosed,
        setPanelRef,
        panelRef,
        data,
      }}
    >
      {children}
    </ConversationSidePanelContext.Provider>
  );
}
