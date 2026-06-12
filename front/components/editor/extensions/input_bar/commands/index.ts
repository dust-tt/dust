import { skillSlashCommandDefinition } from "@app/components/editor/extensions/input_bar/commands/skill";
import { toolSlashCommandDefinition } from "@app/components/editor/extensions/input_bar/commands/tool";
import type {
  InputBarSlashCommandDetailsContext,
  InputBarSlashCommandSelectContext,
} from "@app/components/editor/extensions/input_bar/commands/types";
import type { InputBarSlashSuggestionCapability } from "@app/components/editor/extensions/input_bar/InputBarSlashSuggestionTypes";
import type { SlashCommand } from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

export type {
  InputBarSlashCommandDetailsContext,
  InputBarSlashCommandSelectContext,
} from "@app/components/editor/extensions/input_bar/commands/types";

// Exhaustive dispatchers over slash command kinds. Adding a new kind means adding its definition
// module and wiring it in the three switches below (enforced at compile time), plus extending the
// InputBarSlashSuggestionCapability union.

export function getInputBarSlashCommandItem(
  capability: InputBarSlashSuggestionCapability
): SlashCommand | null {
  switch (capability.kind) {
    case "skill":
      return skillSlashCommandDefinition.getItem(capability);
    case "tool":
      return toolSlashCommandDefinition.getItem(capability);
    default:
      assertNeverAndIgnore(capability);
      return null;
  }
}

export function runInputBarSlashCommandSelect(
  capability: InputBarSlashSuggestionCapability,
  context: InputBarSlashCommandSelectContext
): void {
  switch (capability.kind) {
    case "skill":
      skillSlashCommandDefinition.onSelect(capability, context);
      break;
    case "tool":
      toolSlashCommandDefinition.onSelect(capability, context);
      break;
    default:
      assertNeverAndIgnore(capability);
  }
}

export function runInputBarSlashCommandDetails(
  capability: InputBarSlashSuggestionCapability,
  context: InputBarSlashCommandDetailsContext
): void {
  switch (capability.kind) {
    case "skill":
      skillSlashCommandDefinition.onDetails(capability, context);
      break;
    case "tool":
      toolSlashCommandDefinition.onDetails(capability, context);
      break;
    default:
      assertNeverAndIgnore(capability);
  }
}
