import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import {
  type FileUploaderService,
  useFileUploaderService,
} from "@app/hooks/useFileUploaderService";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { RichAgentMention } from "@app/types/assistant/mentions";
import {
  createContext,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";

export const InputBarContext = createContext<{
  animate: boolean;
  getAndClearSelectedAgent: () => RichAgentMention | null;
  setAnimate: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedAgent: (agentMention: RichAgentMention | null) => void;
  getAndClearPendingInputText: () => string | null;
  setPendingInputText: (text: string | null) => void;
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
      setAnimate,
      getAndClearSelectedAgent,
      setSelectedAgent: setSelectedAgentOuter,
      getAndClearPendingInputText,
      setPendingInputText,
      captureActions,
      fileUploaderService,
    }),
    [
      animate,
      getAndClearSelectedAgent,
      setSelectedAgentOuter,
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
