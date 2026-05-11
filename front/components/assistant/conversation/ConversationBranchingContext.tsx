import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface ConversationBranchingContextValue {
  branchingConversationIds: ReadonlySet<string>;
  setConversationBranching: (
    conversationId: string,
    branching: boolean
  ) => void;
}

const ConversationBranchingContext = createContext<
  ConversationBranchingContextValue | undefined
>(undefined);

export function useConversationBranchingContext() {
  const context = useContext(ConversationBranchingContext);

  if (!context) {
    throw new Error(
      "useConversationBranchingContext must be used within a ConversationBranchingProvider"
    );
  }

  return context;
}

export function useConversationBranchingContextValue(): ConversationBranchingContextValue {
  const [branchingConversationIds, setBranchingConversationIds] = useState<
    ReadonlySet<string>
  >(new Set());

  const setConversationBranching = useCallback(
    (conversationId: string, branching: boolean) => {
      setBranchingConversationIds((current) => {
        if (current.has(conversationId) === branching) {
          return current;
        }

        const updated = new Set(current);
        if (branching) {
          updated.add(conversationId);
        } else {
          updated.delete(conversationId);
        }

        return updated;
      });
    },
    []
  );

  return useMemo(
    () => ({
      branchingConversationIds,
      setConversationBranching,
    }),
    [branchingConversationIds, setConversationBranching]
  );
}

interface ConversationBranchingProviderProps {
  children: React.ReactNode;
  value: ConversationBranchingContextValue;
}

export function ConversationBranchingProvider({
  children,
  value,
}: ConversationBranchingProviderProps) {
  return (
    <ConversationBranchingContext.Provider value={value}>
      {children}
    </ConversationBranchingContext.Provider>
  );
}
