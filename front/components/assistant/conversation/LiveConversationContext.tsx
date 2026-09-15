/** @jsxRuntime automatic */
import {
  useCreateLiveConversation,
  useLiveConversation,
} from "@app/lib/swr/live";
import type { UserType, WorkspaceType } from "@app/types/user";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface LiveConversationRequest {
  conversationId: string | null;
  agent: { sId: string; name: string };
  spaceId?: string;
  selectedSpaceIds?: string[];
}

interface LiveConversationProviderProps {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string | null;
  onConversationCreated: (conversationId: string) => void;
  children: ReactNode;
}

interface LiveConversationContextType {
  request: LiveConversationRequest | null;
  audioRef: (audio: HTMLAudioElement | null) => void;
  live: ReturnType<typeof useLiveConversation>;
  isCreating: boolean;
  start: (request: LiveConversationRequest) => Promise<void>;
}

const LiveConversationContext =
  createContext<LiveConversationContextType | null>(null);

/**
 * @cc [owner:aubin-tchoi,label:product] voice-session-outlives-composer
 * Replacing the composer with an approval or question card MUST NOT terminate
 * voice. Microphone capture MUST start only after an explicit composer action,
 * and switching to a different conversation MUST end the previous call.
 */
export function LiveConversationProvider({
  owner,
  user,
  conversationId,
  onConversationCreated,
  children,
}: LiveConversationProviderProps) {
  const [request, setRequest] = useState<LiveConversationRequest | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const creating = useRef(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const startedRequest = useRef<LiveConversationRequest | null>(null);
  const createConversation = useCreateLiveConversation(owner);
  const live = useLiveConversation({
    owner,
    user,
    conversationId: request?.conversationId ?? "",
    agentId: request?.agent.sId ?? "",
  });
  const { start: startSession, stop, status } = live;

  const start = useCallback(
    async (next: LiveConversationRequest) => {
      if (
        creating.current ||
        status === "connecting" ||
        status === "connected" ||
        status === "closing"
      ) {
        return;
      }
      if (next.conversationId) {
        setRequest(next);
        return;
      }
      creating.current = true;
      setIsCreating(true);
      try {
        const result = await createConversation(next);
        if (result.isOk()) {
          setRequest({ ...next, conversationId: result.value });
          onConversationCreated(result.value);
        }
      } finally {
        creating.current = false;
        setIsCreating(false);
      }
    },
    [createConversation, onConversationCreated, status]
  );

  useEffect(() => {
    if (
      request &&
      request.conversationId === conversationId &&
      audio &&
      startedRequest.current !== request
    ) {
      startedRequest.current = request;
      void startSession(audio);
    }
  }, [audio, conversationId, request, startSession]);

  useEffect(() => {
    if (
      request &&
      request.conversationId !== conversationId &&
      (status === "connecting" || status === "connected")
    ) {
      stop();
    }
  }, [conversationId, request, status, stop]);

  const value = useMemo(
    () => ({ request, live, audioRef: setAudio, isCreating, start }),
    [request, live, isCreating, start]
  );
  return (
    <LiveConversationContext.Provider value={value}>
      {children}
    </LiveConversationContext.Provider>
  );
}

export function useLiveConversationContext() {
  return useContext(LiveConversationContext);
}
