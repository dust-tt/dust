import { getStaticToolDisplayLabelsFromFunctionCallName } from "@app/lib/actions/tool_display_labels";
import { asDisplayName } from "@app/types/shared/utils/string_utils";

export function getToolCallDisplayLabel(
  functionCallName: string,
  context: "running" | "done" = "done"
): string {
  return (
    getStaticToolDisplayLabelsFromFunctionCallName(functionCallName)?.[
      context
    ] ?? asDisplayName(functionCallName)
  );
}
