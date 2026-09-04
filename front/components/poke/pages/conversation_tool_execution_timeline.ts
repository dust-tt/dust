import type { PokeAgentMessageType } from "@app/types/poke";
import { removeNulls } from "@app/types/shared/utils/general";

export interface ProviderPassthroughEntry {
  block: unknown;
  key: string;
  provider: string;
  step: number;
}

interface ToolExecutionAction {
  sId: string;
  step: number;
}

export type ToolExecutionTimelineEntry<Action extends ToolExecutionAction> =
  | {
      type: "action";
      action: Action;
      key: string;
      step: number;
    }
  | {
      type: "provider_passthrough";
      entry: ProviderPassthroughEntry;
      key: string;
      step: number;
    };

export function getToolExecutionTimelineEntries<
  Action extends ToolExecutionAction,
>(
  contents: PokeAgentMessageType["contents"],
  actions: Action[]
): ToolExecutionTimelineEntry<Action>[] {
  const providerPassthroughEntries = removeNulls(
    contents.map(({ content, step }, contentIndex) => {
      if (content.type !== "provider_passthrough") {
        return null;
      }

      return {
        block: content.value.block,
        key: `${step}-${contentIndex}`,
        provider: content.value.provider,
        step,
      };
    })
  );

  return [
    ...providerPassthroughEntries.map((entry) => ({
      type: "provider_passthrough" as const,
      entry,
      key: `provider-passthrough-${entry.key}`,
      step: entry.step,
    })),
    ...actions.map((action) => ({
      type: "action" as const,
      action,
      key: `action-${action.sId}`,
      step: action.step,
    })),
  ].sort((a, b) => a.step - b.step);
}
