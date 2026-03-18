import type { MessageTemporaryState } from "@app/components/assistant/conversation/types";
import { useHashParam } from "@app/hooks/useHashParams";
import type { ConversationSidePanelType } from "@app/types/conversation_side_panel";
import {
  AGENT_ACTIONS_SIDE_PANEL_TYPE,
  FILES_SIDE_PANEL_TYPE,
  INTERACTIVE_CONTENT_SIDE_PANEL_TYPE,
  SIDE_PANEL_HASH_PARAM,
  SIDE_PANEL_TYPE_HASH_PARAM,
} from "@app/types/conversation_side_panel";
import { assertNever } from "@app/types/shared/utils/assert_never";
import React, { useCallback, useEffect, useMemo } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

type OpenPanelParams =
  | {
      type: "actions";
      messageId: string;
      actionId?: string;
    }
  | {
      type: "interactive_content";
      fileId: string;
      timestamp?: string;
    }
  | {
      type: "files";
    };

const isSupportedPanelType = (
  type: string | undefined
): type is ConversationSidePanelType =>
  type === "actions" || type === "interactive_content" || type === "files";

interface ConversationSidePanelContextType {
  currentPanel: ConversationSidePanelType;
  openPanel: (params: OpenPanelParams) => void;
  closePanel: () => void;
  onPanelClosed: () => void;
  setPanelRef: (ref: ImperativePanelHandle | null) => void;
  panelRef: React.MutableRefObject<ImperativePanelHandle | null>;
  setVirtuosoMsg: (msg: MessageTemporaryState) => void;
  virtuosoMsg: MessageTemporaryState | null;
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

export function parseDataAsMessageIdAndActionId(data?: string): {
  messageId?: string;
  actionId?: string;
} {
  // data can be "messageId" or "messageId@actionId" for single-action view.
  // TODO: Clean up once inline activity is rolled out -- the single-action view
  // should fetch only the action it needs, not the full message.
  const [messageId, actionId] = data?.includes("@")
    ? data.split("@")
    : [data, undefined];

  return { messageId, actionId };
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
  const [virtuosoMsg, setVirtuosoMsg] =
    React.useState<MessageTemporaryState | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
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
          const newData = params.actionId
            ? `${params.messageId}@${params.actionId}`
            : params.messageId;

          /**
           * If the panel is already open for the same data,
           * we close it.
           */
          if (newData === data) {
            closePanel();
            return;
          }

          setData(newData);
          break;
        }

        case INTERACTIVE_CONTENT_SIDE_PANEL_TYPE:
          // eslint-disable-next-line no-unused-expressions
          params.timestamp
            ? setData(`${params.fileId}@${params.timestamp}`)
            : setData(params.fileId);
          break;

        case FILES_SIDE_PANEL_TYPE:
          // Toggle: if already open, close it.
          if (currentPanel === FILES_SIDE_PANEL_TYPE) {
            closePanel();
            return;
          }
          setData("files");
          break;

        default:
          assertNever(params);
      }
    },
    [setCurrentPanel, setData, data, closePanel, currentPanel]
  );

  // Initialize panel state from URL hash parameters
  useEffect(() => {
    if (data && currentPanel) {
      setCurrentPanel(currentPanel);
    } else if (!data) {
      closePanel();
    }
  }, [data, currentPanel, setCurrentPanel, closePanel]);

  const value = useMemo(
    () => ({
      currentPanel: isSupportedPanelType(currentPanel)
        ? currentPanel
        : undefined,
      openPanel,
      closePanel,
      onPanelClosed,
      setPanelRef,
      panelRef,
      setVirtuosoMsg,
      virtuosoMsg,
      data,
    }),
    [
      currentPanel,
      openPanel,
      closePanel,
      onPanelClosed,
      setPanelRef,
      virtuosoMsg,
      data,
    ]
  );

  return (
    <ConversationSidePanelContext.Provider value={value}>
      {children}
    </ConversationSidePanelContext.Provider>
  );
}
