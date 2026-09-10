import { getDefaultRightPanelSize } from "@app/components/assistant/conversation/constant";
import type { OpenPanelParams } from "@app/components/assistant/conversation/side_panel_params";
import {
  panelDataKey,
  panelHistoryEntry,
  panelIdentityKey,
  panelParamsFromHash,
} from "@app/components/assistant/conversation/side_panel_params";
import type { AgentMessageWithStreaming } from "@app/components/assistant/conversation/types";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useHashParam } from "@app/hooks/useHashParams";
import type { ConversationSidePanelType } from "@app/types/conversation_side_panel";
import {
  FULL_SCREEN_HASH_PARAM,
  SIDE_PANEL_HASH_PARAM,
  SIDE_PANEL_TYPE_HASH_PARAM,
} from "@app/types/conversation_side_panel";
import React, { useCallback, useEffect, useMemo } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

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
  // Pops back to the previous panel in the history, or collapses when the history is empty.
  closePanel: () => void;
  // Removes panels of that type from the history, for content that no longer exists.
  forgetPanels: (type: ConversationSidePanelType) => void;
  onPanelClosed: () => void;
  setPanelRef: (ref: ImperativePanelHandle | null) => void;
  panelRef: React.MutableRefObject<ImperativePanelHandle | null>;
  setVirtuosoMsg: (msg: AgentMessageWithStreaming) => void;
  virtuosoMsg: AgentMessageWithStreaming | null;
  data: string | undefined;
}

// Defensive only: same-type panels replace each other and a panel appears once, so the history
// is bounded by the number of panel types.
const MAX_PANEL_HISTORY = 20;

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

  // Panels shown before the current one and not closed since, most recent last. Closing pops
  // from here; opening a panel of another type pushes the current one (same-type panels replace
  // each other, so browsing tool steps or Frames does not pile up). Nothing renders from it, so a
  // ref is enough.
  const panelHistoryRef = React.useRef<OpenPanelParams[]>([]);
  const currentParamsRef = React.useRef<OpenPanelParams | null>(null);

  // This should be called once the closing animation is done (onTransitionEnd)
  // so you won't have content flickering. The whole side panel is gone at this point (X with
  // nothing underneath, divider drag, conversation switch), so the history goes with it.
  const onPanelClosed = useCallback(() => {
    setIsPanelClosing(false);
    currentParamsRef.current = null;
    panelHistoryRef.current = [];
    setData(undefined);
    setCurrentPanel(undefined);
  }, [setData, setCurrentPanel]);

  // Collapse without touching the history.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const collapsePanel = useCallback(() => {
    currentParamsRef.current = null;
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

  // Show a panel without touching the history: write the hash and expand. Re-expanding
  // imperatively covers a close→reopen race where `currentPanel` keeps the same value and the
  // container's expand effect would not re-run. No-op on mobile.
  const showPanel = useCallback(
    (params: OpenPanelParams) => {
      setIsPanelClosing(false);
      currentParamsRef.current = params;
      setCurrentPanel(params.type);
      setData(panelDataKey(params));
      panelRef.current?.expand(getDefaultRightPanelSize(params.type));
    },
    [setCurrentPanel, setData]
  );

  const closePanel = useCallback(() => {
    const history = panelHistoryRef.current;
    const previous = history[history.length - 1];
    if (previous) {
      panelHistoryRef.current = history.slice(0, -1);
      showPanel(previous);
      return;
    }
    collapsePanel();
  }, [showPanel, collapsePanel]);

  const forgetPanels = useCallback((type: ConversationSidePanelType) => {
    const history = panelHistoryRef.current;
    if (history.some((entry) => entry.type === type)) {
      panelHistoryRef.current = history.filter((entry) => entry.type !== type);
    }
  }, []);

  // Shared selection; `toggle` decides whether re-selecting the shown panel closes it. A panel
  // that is already closing reads as unselected, so re-selecting it reopens instead.
  const applyPanel = useCallback(
    (params: OpenPanelParams, { toggle }: { toggle: boolean }) => {
      const current = isPanelClosing ? null : currentParamsRef.current;
      const isShown =
        current !== null &&
        panelIdentityKey(current) === panelIdentityKey(params);

      if (isShown) {
        if (toggle) {
          closePanel();
        } else {
          showPanel(params);
        }
        return;
      }

      // The panel being shown never stays in the history, and only a change of panel type
      // stacks the current one.
      const targetKey = panelIdentityKey(params);
      let history = panelHistoryRef.current.filter(
        (entry) => panelIdentityKey(entry) !== targetKey
      );
      if (current && current.type !== params.type) {
        const entry = panelHistoryEntry(current);
        const entryKey = panelIdentityKey(entry);
        history = [
          ...history.filter((e) => panelIdentityKey(e) !== entryKey),
          entry,
        ].slice(-MAX_PANEL_HISTORY);
      }
      panelHistoryRef.current = history;
      showPanel(params);
    },
    [isPanelClosing, closePanel, showPanel]
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
      panelHistoryRef.current = [];
      collapsePanel();
    }
  }, [activeConversationId, collapsePanel, setFullScreenHash]);

  // Initialize panel state from URL hash parameters
  useEffect(() => {
    if (data && currentPanel) {
      setCurrentPanel(currentPanel);
      // Deep link or browser navigation: adopt the panel from the hash so it is the one we
      // consider shown. Our own opens already match, so the ref (and its Frame timestamp) is
      // kept in that case.
      if (isSupportedPanelType(currentPanel)) {
        const fromHash = panelParamsFromHash(currentPanel, data);
        const current = currentParamsRef.current;
        if (
          fromHash &&
          (!current || panelIdentityKey(current) !== panelIdentityKey(fromHash))
        ) {
          currentParamsRef.current = fromHash;
        }
      }
    } else if (!data) {
      collapsePanel();
    }
  }, [data, currentPanel, setCurrentPanel, collapsePanel]);

  const value = useMemo(
    () => ({
      currentPanel: isSupportedPanelType(currentPanel)
        ? currentPanel
        : undefined,
      isPanelClosing,
      openPanel,
      togglePanel,
      closePanel,
      forgetPanels,
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
      forgetPanels,
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
