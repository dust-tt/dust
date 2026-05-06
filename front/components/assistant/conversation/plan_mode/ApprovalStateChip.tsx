import type { PlanApprovalState } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/plan_mode";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Chip } from "@dust-tt/sparkle";

interface ApprovalStateChipProps {
  state: PlanApprovalState;
}

export function ApprovalStateChip({ state }: ApprovalStateChipProps) {
  switch (state) {
    case "approved":
      return <Chip size="mini" color="success" label="Approved" />;
    case "pending":
      return <Chip size="mini" color="golden" label="Pending approval" />;
    case "draft":
      return null;
    default:
      assertNeverAndIgnore(state);
      return null;
  }
}
