import { useConversationContextUsage } from "@app/hooks/conversations";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import {
  type FileUploaderService,
  useFileUploaderService,
} from "@app/hooks/useFileUploaderService";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { GetConversationContextUsageResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/context-usage";
import type { RichAgentMention } from "@app/types/assistant/mentions";
import {
  createContext,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";

type ContextUsageMutator = ReturnType<
  typeof useConversationContextUsage
>["mutateContextUsage"];

type InputBarContextValue = {
  animate: boolean;
  contextUsage: GetConversationContextUsageResponse | null;
  getAndClearSelectedAgent: () => RichAgentMention | null;
  isContextUsageLoading: boolean;
  isContextUsageError: unknown;
  mutateContextUsage: ContextUsageMutator;
  setAnimate: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedAgent: (agentMention: RichAgentMention | null) => void;
  selectedSingleAgent: RichAgentMention | null;
  setSelectedSingleAgent: (agentMention: RichAgentMention | null) => void;
  getAndClearPendingInputText: () => string | null;
  setPendingInputText: (text: string | null) => void;
  fileUploaderService: FileUploaderService;
  captureActions?: {
    onCapture: (type: "text" | "screenshot") => void;
    isCapturing: boolean;
  };
};

export const InputBarContext = createContext<InputBarContextValue>({
  animate: false,
  contextUsage: null,
  getAndClearSelectedAgent: () => null,
  isContextUsageLoading: false,
  isContextUsageError: null,
  mutateContextUsage: async () => undefined,
  setAnimate: () => {},
  setSelectedAgent: () => {},
  selectedSingleAgent: null,
  setSelectedSingleAgent: () => {},
  getAndClearPendingInputText: () => null,
  setPendingInputText: () => {},
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
  contextUsage: GetConversationContextUsageResponse | null;
  isContextUsageLoading: boolean;
  isContextUsageError: unknown;
  mutateContextUsage: ContextUsageMutator;
  captureActions?: {
    onCapture: (type: "text" | "screenshot") => void;
    isCapturing: boolean;
  };
}

export function InputBarContextProvider({
  children,
  fileUploaderService,
  contextUsage,
  isContextUsageLoading,
  isContextUsageError,
  mutateContextUsage,
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
      contextUsage,
      setAnimate,
      getAndClearSelectedAgent,
      isContextUsageLoading,
      isContextUsageError,
      mutateContextUsage,
      setSelectedAgent: setSelectedAgentOuter,
      selectedSingleAgent,
      setSelectedSingleAgent,
      getAndClearPendingInputText,
      setPendingInputText,
      captureActions,
      fileUploaderService,
    }),
    [
      animate,
      contextUsage,
      getAndClearSelectedAgent,
      isContextUsageLoading,
      isContextUsageError,
      mutateContextUsage,
      setSelectedAgentOuter,
      selectedSingleAgent,
      getAndClearPendingInputText,
      setPendingInputText,
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
  const isCompactionEnabled = hasFeature("enable_compaction");

  const useCaseMetadata = useMemo(() => {
    if (!conversationId) {
      return undefined;
    }
    return {
      conversationId,
    };
  }, [conversationId]);

  const fileUploaderService = useFileUploaderService({
    owner: workspace,
    useCase: "conversation",
    useCaseMetadata,
  });

  const {
    contextUsage,
    isContextUsageLoading,
    isContextUsageError,
    mutateContextUsage,
  } = useConversationContextUsage({
    conversationId: isCompactionEnabled ? conversationId : null,
    workspaceId: workspace.sId,
    options: { disabled: !isCompactionEnabled },
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
    <InputBarContextProvider
      fileUploaderService={fileUploaderService}
      contextUsage={contextUsage}
      isContextUsageLoading={isContextUsageLoading}
      isContextUsageError={isContextUsageError}
      mutateContextUsage={mutateContextUsage}
    >
      {children}
    </InputBarContextProvider>
  );
}
