import React, { useCallback, useEffect } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

import { useHashParam } from "@app/hooks/useHashParams";
import { assertNever } from "@app/types";
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
    }
  | {
      type: "interactive_content";
      fileId: string;
      timestamp?: string;
    };

const isSupportedPanelType = (
  type: string | undefined
): type is ConversationSidePanelType =>
  type === "actions" || type === "interactive_content";

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

  const setPanelRef = useCallback(
    (ref: ImperativePanelHandle | null) => {
      panelRef.current = ref;
    },
    [panelRef]
  );

  // This should be called once the closing animation is done (onTransitionEnd)
  // so you won't have content flickering
  const onPanelClosed = useCallback(() => {
    setData(undefined);
    setCurrentPanel(undefined);
  }, [setData, setCurrentPanel]);

  const closePanel = useCallback(() => {
    if (panelRef && panelRef.current) {
      panelRef.current.collapse();
    } else {
      // in case there is no ref found (agent builder preview), close the panel directly
      onPanelClosed();
    }
  }, [panelRef, onPanelClosed]);

  const openPanel = useCallback(
    (params: OpenPanelParams) => {
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

        case INTERACTIVE_CONTENT_SIDE_PANEL_TYPE:
          params.timestamp
            ? setData(`${params.fileId}@${params.timestamp}`)
            : setData(params.fileId);
          break;

        default:
          assertNever(params);
      }
    },
    [setCurrentPanel, setData, data, closePanel]
  );

  // Initialize panel state from URL hash parameters
  useEffect(() => {
    if (data && currentPanel) {
      setCurrentPanel(currentPanel);
    } else if (!data) {
      closePanel();
    }
  }, [data, currentPanel, setCurrentPanel, closePanel]);

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
