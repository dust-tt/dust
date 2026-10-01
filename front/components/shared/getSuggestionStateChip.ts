import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { SkillSuggestionState } from "@app/types/suggestions/skill_suggestion";
import { CheckCircle, Clock, XCircle } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

export function getSuggestionStateChip(state: SkillSuggestionState): {
  color: "success" | "warning" | "primary";
  icon: ComponentType;
  label: string;
} | null {
  switch (state) {
    case "pending":
      return null;
    case "approved":
      return { color: "success", icon: CheckCircle, label: "Accepted" };
    case "rejected":
      return { color: "warning", icon: XCircle, label: "Declined" };
    case "outdated":
      return { color: "primary", icon: Clock, label: "Outdated" };
    default:
      assertNeverAndIgnore(state);
      return null;
  }
}
