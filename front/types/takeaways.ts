export type TodoVersionedActionItemStatus = "open" | "done";

export type TodoVersionedActionItem = {
  sId: string;
  shortDescription: string;
  assigneeUserId: string | null;
  assigneeName: string | null;
  status: TodoVersionedActionItemStatus;
  detectedDoneAt: string | null;
  detectedDoneRationale: string | null;
};

export type TodoVersionedNotableFact = {
  sId: string;
  shortDescription: string;
  relevantUserIds: string[];
};

export type TodoVersionedKeyDecisionStatus = "decided" | "open";

export type TodoVersionedKeyDecision = {
  sId: string;
  shortDescription: string;
  relevantUserIds: string[];
  status: TodoVersionedKeyDecisionStatus;
};
