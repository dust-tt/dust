import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import {
  type FileUploaderService,
  useFileUploaderService,
} from "@app/hooks/useFileUploaderService";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import type {
  RichAgentMention,
  RichMention,
} from "@app/types/assistant/mentions";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import {
  createContext,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";

/** Payload for the first message when creation is deferred until after navigation. */
export type PendingConversationMessage = {
  input: string;
  mentions: RichMention[];
  contentFragments: ContentFragmentsType;
};

export const InputBarContext = createContext<{
  animate: boolean;
  getAndClearSelectedAgent: () => RichAgentMention | null;
  setAnimate: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedAgent: (agentMention: RichAgentMention | null) => void;
  selectedSingleAgent: RichAgentMention | null;
  setSelectedSingleAgent: (agentMention: RichAgentMention | null) => void;
  getAndClearPendingInputText: () => string | null;
  setPendingInputText: (text: string | null) => void;
  peekPendingFirstMessage: (
    conversationId: string
  ) => PendingConversationMessage | null;
  setPendingFirstMessage: (
    conversationId: string,
    message: PendingConversationMessage
  ) => void;
  clearPendingFirstMessage: (conversationId: string) => void;
  fileUploaderService: FileUploaderService;
  captureActions?: {
    onCapture: (type: "text" | "screenshot") => void;
    isCapturing: boolean;
  };
}>({
  animate: false,
  getAndClearSelectedAgent: () => null,
  setAnimate: () => {},
  setSelectedAgent: () => {},
  selectedSingleAgent: null,
  setSelectedSingleAgent: () => {},
  getAndClearPendingInputText: () => null,
  setPendingInputText: () => {},
  peekPendingFirstMessage: () => null,
  setPendingFirstMessage: () => {},
  clearPendingFirstMessage: () => {},
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
  captureActions?: {
    onCapture: (type: "text" | "screenshot") => void;
    isCapturing: boolean;
  };
}

export function InputBarContextProvider({
  children,
  fileUploaderService,
  captureActions,
}: InputBarContextProviderProps) {
  const [animate, setAnimate] = useState<boolean>(false);

  // Useful when a component needs to set the selected agent for the input bar but do not have direct access to the input bar.
  const [selectedAgent, setSelectedAgent] = useState<RichAgentMention | null>(
    null
  );

  // Persistent agent selection for single-agent input mode (displayed in the agent picker button).
  const [selectedSingleAgent, setSelectedSingleAgent] =
    useState<RichAgentMention | null>(null);

  // Useful when a component needs to pre-fill the input bar with text (e.g. butler suggestions).
  const [pendingInputText, setPendingInputTextState] = useState<string | null>(
    null
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
        setAnimate(true);
      } else {
        setAnimate(false);
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
    const text = pendingInputText;
    setPendingInputTextState(null);
    return text;
  }, [pendingInputText]);

  const setPendingInputText = useCallback((text: string | null) => {
    setPendingInputTextState(text);
  }, []);

  const value = useMemo(
    () => ({
      animate,
      setAnimate,
      getAndClearSelectedAgent,
      setSelectedAgent: setSelectedAgentOuter,
      selectedSingleAgent,
      setSelectedSingleAgent,
      getAndClearPendingInputText,
      setPendingInputText,
      peekPendingFirstMessage,
      setPendingFirstMessage,
      clearPendingFirstMessage,
      captureActions,
      fileUploaderService,
    }),
    [
      animate,
      getAndClearSelectedAgent,
      setSelectedAgentOuter,
      selectedSingleAgent,
      getAndClearPendingInputText,
      setPendingInputText,
      peekPendingFirstMessage,
      setPendingFirstMessage,
      clearPendingFirstMessage,
      captureActions,
      fileUploaderService,
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
  const { hasFeature } = useFeatureFlags();

  const useCaseMetadata = useMemo(() => {
    if (!conversationId) {
      return undefined;
    }
    return {
      conversationId,
    };
  }, [conversationId]);

  const fileUploaderService = useFileUploaderService({
    hasSandboxTools: hasFeature("sandbox_tools"),
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
