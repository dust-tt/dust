import type { FileType } from "@app/types/files";

export type PlanApprovalState = "draft" | "pending" | "approved";

export type GetConversationPlanModeResponseBody = {
  planFile: FileType | null;
  content: string | null;
  approvalState: PlanApprovalState;
};
