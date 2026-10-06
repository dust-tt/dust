import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { SkillSuggestionState } from "@app/types/suggestions/skill_suggestion";
import { CheckCircle, Clock, XCircle } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ComponentType } from "react";

export function getSuggestionStateChip(state: SkillSuggestionState): {
  color: "success" | "warning" | "primary";
  icon: ComponentType;
  label: MessageDescriptor;
} | null {
  switch (state) {
    case "pending":
      return null;
    case "approved":
      return {
        color: "success",
        icon: CheckCircle,
        label: msg({ message: "Accepted", context: "suggestion state" }),
      };
    case "rejected":
      return {
        color: "warning",
        icon: XCircle,
        label: msg({ message: "Declined", context: "suggestion state" }),
      };
    case "outdated":
      return {
        color: "primary",
        icon: Clock,
        label: msg({ message: "Outdated", context: "suggestion state" }),
      };
    default:
      assertNeverAndIgnore(state);
      return null;
  }
}
