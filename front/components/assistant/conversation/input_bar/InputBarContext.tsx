import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import type {
  RichAgentMention,
  RichMention,
} from "@app/types/assistant/mentions";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import { ModelSelectionSchema } from "@app/types/assistant/models/types";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import type { MutableRefObject, ReactNode } from "react";
import { createContext, useCallback, useMemo, useRef, useState } from "react";

const STICKY_MODEL_OVERRIDE_STORAGE_KEY = "inputBarModelOverride_v1";

function readStickyModelOverride(): ModelSelectionType | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    const raw = window.sessionStorage.getItem(
      STICKY_MODEL_OVERRIDE_STORAGE_KEY
    );
    if (!raw) {
      return undefined;
    }
    const parsed = ModelSelectionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function writeStickyModelOverride(selection: ModelSelectionType | undefined) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (selection === undefined) {
      window.sessionStorage.removeItem(STICKY_MODEL_OVERRIDE_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(
        STICKY_MODEL_OVERRIDE_STORAGE_KEY,
        JSON.stringify(selection)
      );
    }
  } catch {
    // Best-effort write only.
  }
}

/** Payload for the first message when creation is deferred until after navigation. */
export type PendingConversationMessage = {
  input: string;
  mentions: RichMention[];
  contentFragments: ContentFragmentsType;
  modelSelection?: ModelSelectionType;
};

export type PendingInputText = {
  text: string;
  replace: boolean;
};

type CaptureActions = {
  onCapture: (type: "text" | "screenshot") => void;
  isCapturing: boolean;
  onSavePageToPod?: () => Promise<void>;
  isSavingPageToPod?: boolean;
};

export const InputBarContext = createContext<{
  shouldFocusInput: boolean;
  getAndClearSelectedAgent: () => RichAgentMention | null;
  setShouldFocusInput: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedAgent: (agentMention: RichAgentMention | null) => void;
  selectedSingleAgent: RichAgentMention | null;
  setSelectedSingleAgent: (agentMention: RichAgentMention | null) => void;
  getAndClearPendingInputText: () => PendingInputText | null;
  setPendingInputText: (
    text: string | null,
    options?: { replace?: boolean }
  ) => void;
  peekPendingFirstMessage: (
    conversationId: string
  ) => PendingConversationMessage | null;
  setPendingFirstMessage: (
    conversationId: string,
    message: PendingConversationMessage
  ) => void;
  clearPendingFirstMessage: (conversationId: string) => void;
  isLoadingGoTemplate: boolean;
  setIsLoadingGoTemplate: (loading: boolean) => void;
  stickyModelOverride: ModelSelectionType | undefined;
  setStickyModelOverride: (selection: ModelSelectionType | undefined) => void;
  // Imperative handle published by the input bar's model picker so components
  // outside the input bar (e.g. the sidebar banner) can open its menu.
  openModelPickerRef: MutableRefObject<(() => void) | null>;
  fileUploaderService: FileUploaderService;
  captureActions?: CaptureActions;
  // Fired right before submit; the extension uses it to snapshot browser tab state.
  onBeforeSubmit?: () => void;
}>({
  shouldFocusInput: false,
  getAndClearSelectedAgent: () => null,
  setShouldFocusInput: () => {},
  setSelectedAgent: () => {},
  selectedSingleAgent: null,
  setSelectedSingleAgent: () => {},
  getAndClearPendingInputText: () => null,
  setPendingInputText: () => {},
  peekPendingFirstMessage: () => null,
  setPendingFirstMessage: () => {},
  clearPendingFirstMessage: () => {},
  isLoadingGoTemplate: false,
  setIsLoadingGoTemplate: () => {},
  stickyModelOverride: undefined,
  setStickyModelOverride: () => {},
  openModelPickerRef: { current: null },
  fileUploaderService: {
    fileBlobs: [],
    handleFileChange: async () => undefined,
    removeFile: () => {},
    addUploadedFile: () => {},
    getFileBlob: () => undefined,
    getFileBlobs: () => [],
    handleFilesUpload: async () => undefined,
    isProcessingFiles: false,
    resetUpload: () => {},
  },
});

interface InputBarContextProviderProps {
  children: ReactNode;
  fileUploaderService: FileUploaderService;
  captureActions?: CaptureActions;
  onBeforeSubmit?: () => void;
}

export function InputBarContextProvider({
  children,
  fileUploaderService,
  captureActions,
  onBeforeSubmit,
}: InputBarContextProviderProps) {
  const [shouldFocusInput, setShouldFocusInput] = useState<boolean>(false);

  // Set by the input bar's model picker while it is mounted; null otherwise.
  const openModelPickerRef = useRef<(() => void) | null>(null);

  // Useful when a component needs to set the selected agent for the input bar but do not have direct access to the input bar.
  const [selectedAgent, setSelectedAgent] = useState<RichAgentMention | null>(
    null
  );

  // Persistent agent selection for single-agent input mode (displayed in the agent picker button).
  const [selectedSingleAgent, setSelectedSingleAgent] =
    useState<RichAgentMention | null>(null);

  // Useful when a component needs to pre-fill the input bar with text.
  const [pendingInputText, setPendingInputTextState] =
    useState<PendingInputText | null>(null);
  const [isLoadingGoTemplate, setIsLoadingGoTemplate] = useState(false);

  // Sticky model-picker override, hydrated from sessionStorage on mount and
  // written through on every change so it survives reloads within the tab.
  const [stickyModelOverride, setStickyModelOverrideState] = useState<
    ModelSelectionType | undefined
  >(() => readStickyModelOverride());

  const setStickyModelOverride = useCallback(
    (selection: ModelSelectionType | undefined) => {
      writeStickyModelOverride(selection);
      setStickyModelOverrideState(selection);
    },
    []
  );

  // First message stashed while navigating to a newly-created conversation (deferred-send flow).
  const [
    pendingFirstMessagesByConversation,
    setPendingFirstMessagesByConversation,
  ] = useState<Record<string, PendingConversationMessage>>({});

  const setPendingFirstMessage = useCallback(
    (conversationId: string, message: PendingConversationMessage) => {
      setPendingFirstMessagesByConversation((prev) => ({
        ...prev,
        [conversationId]: message,
      }));
    },
    []
  );

  const peekPendingFirstMessage = useCallback(
    (conversationId: string) =>
      pendingFirstMessagesByConversation[conversationId] ?? null,
    [pendingFirstMessagesByConversation]
  );

  const clearPendingFirstMessage = useCallback((conversationId: string) => {
    setPendingFirstMessagesByConversation((prev) => {
      const { [conversationId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const setSelectedAgentOuter = useCallback(
    (agentMention: RichAgentMention | null) => {
      if (agentMention) {
        setShouldFocusInput(true);
      } else {
        setShouldFocusInput(false);
      }
      setSelectedAgent(agentMention);
    },
    [setSelectedAgent]
  );

  // Immediately clear the selected agent and return the previous selected agent to avoid sticky agent mentions.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const getAndClearSelectedAgent = useCallback(() => {
    const previousSelectedAgent = selectedAgent;
    setSelectedAgent(null);
    return previousSelectedAgent;
  }, [selectedAgent, setSelectedAgent]);

  const getAndClearPendingInputText = useCallback(() => {
    const pending = pendingInputText;
    setPendingInputTextState(null);
    return pending;
  }, [pendingInputText]);

  const setPendingInputText = useCallback(
    (text: string | null, options?: { replace?: boolean }) => {
      if (text === null) {
        setPendingInputTextState(null);
        return;
      }
      setPendingInputTextState({
        text,
        replace: options?.replace ?? false,
      });
    },
    []
  );

  const value = useMemo(
    () => ({
      shouldFocusInput,
      setShouldFocusInput,
      getAndClearSelectedAgent,
      setSelectedAgent: setSelectedAgentOuter,
      selectedSingleAgent,
      setSelectedSingleAgent,
      getAndClearPendingInputText,
      setPendingInputText,
      peekPendingFirstMessage,
      setPendingFirstMessage,
      clearPendingFirstMessage,
      isLoadingGoTemplate,
      setIsLoadingGoTemplate,
      stickyModelOverride,
      setStickyModelOverride,
      openModelPickerRef,
      captureActions,
      fileUploaderService,
      onBeforeSubmit,
    }),
    [
      shouldFocusInput,
      getAndClearSelectedAgent,
      setSelectedAgentOuter,
      selectedSingleAgent,
      getAndClearPendingInputText,
      setPendingInputText,
      peekPendingFirstMessage,
      setPendingFirstMessage,
      clearPendingFirstMessage,
      isLoadingGoTemplate,
      stickyModelOverride,
      setStickyModelOverride,
      captureActions,
      fileUploaderService,
      onBeforeSubmit,
    ]
  );

  return (
    <InputBarContext.Provider value={value}>
      {children}
    </InputBarContext.Provider>
  );
}
interface InputBarProviderProps {
  children: ReactNode;
}

export function InputBarProvider({ children }: InputBarProviderProps) {
  const conversationId = useActiveConversationId();

  const { workspace } = useAuth();
  const { featureFlags } = useFeatureFlags();

  const useCaseMetadata = useMemo(() => {
    if (!conversationId) {
      return undefined;
    }
    return {
      conversationId,
    };
  }, [conversationId]);

  const fileUploaderService = useFileUploaderService({
    hasSandboxTools: isComputerFeatureEnabled(featureFlags),
    owner: workspace,
    useCase: "conversation",
    useCaseMetadata,
  });

  // Reset fileBlobs when conversationId changes.
  // We intentionally avoid using a key prop as it would remount
  // the entire page subtree (InputBarStateProvider wraps children)
  // just to reset a single array.
  const [prevConversationId, setPrevConversationId] = useState(conversationId);
  if (conversationId !== prevConversationId) {
    setPrevConversationId(conversationId);
    fileUploaderService.resetUpload();
  }

  return (
    <InputBarContextProvider fileUploaderService={fileUploaderService}>
      {children}
    </InputBarContextProvider>
  );
}
