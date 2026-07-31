export type TodoVersionedActionItemStatus = "open" | "done";

export type TaskVersionedActionItem = {
  sId: string;
  shortDescription: string;
  assigneeUserId: string | null;
  assigneeName: string | null;
  detectedCreationRationale: string | null;
  status?: TodoVersionedActionItemStatus;
  detectedDoneAt?: string | null;
};
