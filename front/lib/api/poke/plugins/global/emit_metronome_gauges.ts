import { createPlugin } from "@app/lib/api/poke/types";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import { QUEUE_NAME } from "@app/temporal/usage_queue/config";
import { emitMetronomeGaugeEventsWorkflow } from "@app/temporal/usage_queue/workflows";
import { Ok } from "@app/types/shared/result";

export const emitMetronomeGaugesPlugin = createPlugin({
  manifest: {
    id: "emit-metronome-gauges",
    name: "Emit Metronome Gauge Events",
    description:
      "Runs the Metronome gauge events workflow immediately for all workspaces (workspace_gauge: member_count, MAU, etc.).",
    resourceTypes: ["global"],
    args: {},
  },
  execute: async () => {
    const client = await getTemporalClientForFrontNamespace();

    const workflowId = `metronome-gauge-manual-${Date.now()}`;
    await client.workflow.start(emitMetronomeGaugeEventsWorkflow, {
      args: [],
      taskQueue: QUEUE_NAME,
      workflowId,
    });

    return new Ok({
      display: "text",
      value: `Metronome gauge events workflow started (${workflowId}).`,
    });
  },
});
