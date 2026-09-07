import { getDefaultRightPanelSize } from "@app/components/assistant/conversation/constant";
import type { AgentMessageWithStreaming } from "@app/components/assistant/conversation/types";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useHashParam } from "@app/hooks/useHashParams";
import type { ConversationSidePanelType } from "@app/types/conversation_side_panel";
import {
  AGENT_ACTIONS_SIDE_PANEL_TYPE,
  CREDITS_SIDE_PANEL_TYPE,
  FILE_PREVIEW_SIDE_PANEL_TYPE,
  FILES_SIDE_PANEL_TYPE,
  FULL_SCREEN_HASH_PARAM,
  INTERACTIVE_CONTENT_SIDE_PANEL_TYPE,
  PLAN_SIDE_PANEL_TYPE,
  SIDE_PANEL_HASH_PARAM,
  SIDE_PANEL_TYPE_HASH_PARAM,
  SKILL_SIDE_PANEL_TYPE,
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
      type: "file_preview";
      filePath: string;
    }
  | {
      type: "files";
    }
  | {
      type: "credits";
    }
  | {
      type: "plan";
    }
  | {
      type: "skill";
      skillId: string;
    };

const isSupportedPanelType = (
  type: string | undefined
): type is ConversationSidePanelType =>
  type === "actions" ||
  type === "credits" ||
  type === "interactive_content" ||
  type === "file_preview" ||
  type === "files" ||
  type === "plan" ||
  type === "skill";

interface ConversationSidePanelContextType {
  currentPanel: ConversationSidePanelType;
  // True between closePanel() and the end of the collapse transition. `currentPanel` keeps the
  // old value meanwhile so the panel content does not flicker; toggles read this to unselect
  // right away.
  isPanelClosing: boolean;
  openPanel: (params: OpenPanelParams) => void;
  togglePanel: (params: OpenPanelParams) => void;
  closePanel: () => void;
  onPanelClosed: () => void;
  setPanelRef: (ref: ImperativePanelHandle | null) => void;
  panelRef: React.MutableRefObject<ImperativePanelHandle | null>;
  setVirtuosoMsg: (msg: AgentMessageWithStreaming) => void;
  virtuosoMsg: AgentMessageWithStreaming | null;
  data: string | undefined;
}

export const ConversationSidePanelContext = React.createContext<
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
  const [, setFullScreenHash] = useHashParam(FULL_SCREEN_HASH_PARAM);
  const activeConversationId = useActiveConversationId();
  const previousConversationIdRef = React.useRef(activeConversationId);

  const panelRef = React.useRef<ImperativePanelHandle | null>(null);
  const [isPanelClosing, setIsPanelClosing] = React.useState(false);
  const [virtuosoMsg, setVirtuosoMsg] =
    React.useState<AgentMessageWithStreaming | null>(null);
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
    setIsPanelClosing(false);
    setData(undefined);
    setCurrentPanel(undefined);
  }, [setData, setCurrentPanel]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const closePanel = useCallback(() => {
    if (panelRef && panelRef.current) {
      // Only flag a real collapse: on an already collapsed panel no transition runs, so
      // onPanelClosed would never clear the flag.
      if (!panelRef.current.isCollapsed()) {
        setIsPanelClosing(true);
      }
      panelRef.current.collapse();
    } else {
      // in case there is no ref found (agent builder preview), close the panel directly
      onPanelClosed();
    }
  }, [panelRef, onPanelClosed]);

  // Shared selection; `toggle` decides whether re-selecting the shown panel closes it. A panel
  // that is already closing reads as unselected, so re-selecting it reopens instead.
  const applyPanel = useCallback(
    (params: OpenPanelParams, { toggle }: { toggle: boolean }) => {
      const closeOnReselect = toggle && !isPanelClosing;
      setIsPanelClosing(false);
      setCurrentPanel(params.type);

      switch (params.type) {
        case AGENT_ACTIONS_SIDE_PANEL_TYPE: {
          const newData = params.actionId
            ? `${params.messageId}@${params.actionId}`
            : params.messageId;

          // A different message/action switches content; only the same data toggles closed.
          if (closeOnReselect && newData === data) {
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

        case FILE_PREVIEW_SIDE_PANEL_TYPE:
          setData(params.filePath);
          break;

        case FILES_SIDE_PANEL_TYPE:
          if (closeOnReselect && currentPanel === FILES_SIDE_PANEL_TYPE) {
            closePanel();
            return;
          }
          setData("files");
          break;

        case CREDITS_SIDE_PANEL_TYPE:
          if (closeOnReselect && currentPanel === CREDITS_SIDE_PANEL_TYPE) {
            closePanel();
            return;
          }
          setData("credits");
          break;

        case PLAN_SIDE_PANEL_TYPE:
          if (closeOnReselect && currentPanel === PLAN_SIDE_PANEL_TYPE) {
            closePanel();
            return;
          }
          setData("plan");
          break;

        case SKILL_SIDE_PANEL_TYPE:
          // A different skill switches content; only the same skill toggles closed.
          if (closeOnReselect && params.skillId === data) {
            closePanel();
            return;
          }
          setData(params.skillId);
          break;

        default:
          assertNever(params);
      }

      // Re-expand imperatively: the container's expand effect only fires when `currentPanel`
      // changes, so a close→reopen race (same value) wouldn't re-run it. No-op on mobile.
      panelRef.current?.expand(getDefaultRightPanelSize(params.type));
    },
    [setCurrentPanel, setData, data, closePanel, currentPanel, isPanelClosing]
  );

  // Idempotent open for programmatic callers: a toggle could mis-close during a close→reopen
  // transition where `currentPanel` still reads the old value.
  const openPanel = useCallback(
    (params: OpenPanelParams) => applyPanel(params, { toggle: false }),
    [applyPanel]
  );

  // Toggle for user-controlled buttons: re-selecting the shown panel closes it.
  const togglePanel = useCallback(
    (params: OpenPanelParams) => applyPanel(params, { toggle: true }),
    [applyPanel]
  );

  // Close the panel when switching conversations: the provider stays mounted
  // across navigation and useHashParam does not re-sync on pushState, so the
  // previous conversation's panel would otherwise stay open. Skips the initial
  // mount (deep links) and the null -> id transition (new conversation flow).
  useEffect(() => {
    const previousConversationId = previousConversationIdRef.current;
    previousConversationIdRef.current = activeConversationId;

    if (
      previousConversationId &&
      previousConversationId !== activeConversationId
    ) {
      // Exit full screen too, mirroring FrameRenderer's close button.
      setFullScreenHash(undefined);
      closePanel();
    }
  }, [activeConversationId, closePanel, setFullScreenHash]);

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
      isPanelClosing,
      openPanel,
      togglePanel,
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
      isPanelClosing,
      openPanel,
      togglePanel,
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
