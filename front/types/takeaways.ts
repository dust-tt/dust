export type TodoVersionedActionItemStatus = "open" | "done";

export type TodoVersionedActionItem = {
  sId: string;
  shortDescription: string;
  assigneeUserId: string | null;
  assigneeName: string | null;
  status: TodoVersionedActionItemStatus;
  detectedDoneAt: string | null;
  detectedDoneRationale: string | null;
  detectedCreationRationale: string | null;
};
