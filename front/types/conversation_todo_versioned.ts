export type TodoVersionedActionItemStatus = "open" | "done";

export type TodoVersionedActionItem = {
  sId: string;
  text: string;
  assigneeUserId: string | null;
  assigneeName: string | null;
  sourceMessageRank: number;
  status: TodoVersionedActionItemStatus;
  detectedDoneAt: string | null;
  detectedDoneRationale: string | null;
};

export type TodoVersionedNotableFact = {
  key: string;
  text: string;
  relevantUserIds: string[];
  sourceMessageRank: number;
};

export type TodoVersionedKeyDecisionStatus = "decided" | "open";

export type TodoVersionedKeyDecision = {
  key: string;
  text: string;
  relevantUserIds: string[];
  sourceMessageRank: number;
  status: TodoVersionedKeyDecisionStatus;
};

export type TodoVersionedAgentSuggestion = {
  agentId: string;
  rationale: string;
};
