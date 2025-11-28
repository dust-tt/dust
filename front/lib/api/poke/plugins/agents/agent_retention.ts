import { createPlugin } from "@app/lib/api/poke/types";
import { AgentDataRetentionModel } from "@app/lib/models/agent/agent_data_retention";
import { Err, Ok } from "@app/types";

export const agentRetentionPlugin = createPlugin({
  manifest: {
    id: "agent-retention",
    name: "Change Agent Data Retention",
    description: "Change how long conversations are retained for this agent",
    resourceTypes: ["agents"],
    args: {
      retentionDays: {
        type: "number",
        label: "Retention Days",
        description:
          "Number of days to retain conversations for this agent (-1 for unlimited) after the first message",
        async: true,
      },
    },
  },
  populateAsyncArgs: async (auth, resource) => {
    if (!resource) {
      return new Err(new Error("Agent configuration not found"));
    }

    const retention = await AgentDataRetentionModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentConfigurationId: resource.sId,
      },
    });

    return new Ok({
      retentionDays: retention ? retention.retentionDays : -1,
    });
  },
  execute: async (auth, resource, args) => {
    const retentionDays = args.retentionDays ?? -1;

    if (retentionDays !== -1 && retentionDays < 1) {
      return new Err(
        new Error(
          "Set -1 to remove the retention rule, or a number > 0 to set the retention rule."
        )
      );
    }

    if (!resource) {
      return new Err(new Error("Agent configuration not found"));
    }

    const workspace = auth.getNonNullableWorkspace();

    if (retentionDays === -1) {
      await AgentDataRetentionModel.destroy({
        where: {
          workspaceId: workspace.id,
          agentConfigurationId: resource.sId,
        },
      });
    } else {
      await AgentDataRetentionModel.upsert({
        workspaceId: workspace.id,
        agentConfigurationId: resource.sId,
        retentionDays,
      });
    }

    return new Ok({
      display: "text",
      value: `Agent data retention period set to ${retentionDays === -1 ? "unlimited" : `${retentionDays} days`}.`,
    });
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }

    return resource.status === "active";
  },
});
