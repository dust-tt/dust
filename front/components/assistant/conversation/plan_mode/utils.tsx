import type { PlanApprovalState } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/plan_mode";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Chip } from "@dust-tt/sparkle";

const TITLE_REGEX = /^#\s+(.+)$/m;

export function extractPlanTitle(content: string | null): string {
  if (!content) {
    return "Untitled plan";
  }
  const match = content.match(TITLE_REGEX);
  return match ? match[1].trim() : "Untitled plan";
}

export function ApprovalStateChip({ state }: { state: PlanApprovalState }) {
  switch (state) {
    case "approved":
      return <Chip size="mini" color="success" label="Approved" />;
    case "pending":
      return <Chip size="mini" color="warning" label="Pending approval" />;
    case "draft":
      return null;
    default:
      assertNeverAndIgnore(state);
      return null;
  }
}
