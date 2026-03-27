export type TodoSnapshotActionItemStatus = "open" | "done";

export type TodoSnapshotActionItem = {
  key: string;
  text: string;
  assigneeUserId: string | null;
  assigneeName: string | null;
  sourceMessageRank: number;
  status: TodoSnapshotActionItemStatus;
  detectedDoneAt: string | null;
  detectedDoneRationale: string | null;
};

export type TodoSnapshotNotableFact = {
  key: string;
  text: string;
  relevantUserIds: string[];
  sourceMessageRank: number;
};

export type TodoSnapshotKeyDecisionStatus = "decided" | "open";

export type TodoSnapshotKeyDecision = {
  key: string;
  text: string;
  relevantUserIds: string[];
  sourceMessageRank: number;
  status: TodoSnapshotKeyDecisionStatus;
};

export type TodoSnapshotAgentSuggestion = {
  agentId: string;
  rationale: string;
};
