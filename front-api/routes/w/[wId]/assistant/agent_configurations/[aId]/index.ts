import {
  archiveAgentConfiguration,
  getAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { getAgentRecentAuthors } from "@app/lib/api/assistant/recent_authors";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { PostOrPatchAgentConfigurationRequestBodySchema } from "@app/types/api/internal/agent_configuration";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";

import editors from "./editors";
import exportRoutes from "./export";
import feedbacks from "./feedbacks";
import history from "./history";
import lastAuthor from "./last_author";
import linkedSlackChannels from "./linked_slack_channels";
import mcpConfigurations from "./mcp_configurations";
import memories from "./memories";
import observability from "./observability";
import restore from "./restore";
import skills from "./skills";
import suggestions from "./suggestions";
import tags from "./tags";
import triggers from "./triggers";
import usage from "./usage";

// Mounted under /api/w/:wId/assistant/agent_configurations/:aId. The bare
// `/` handles GET, PATCH, and DELETE on the agent itself.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const aId = c.req.param("aId") ?? "";

  const agent = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "full",
  });
  if (!agent || (!agent.canRead && !auth.isAdmin())) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The Agent you're trying to access was not found.",
      },
    });
  }

  return c.json({
    agentConfiguration: {
      ...agent,
      lastAuthors: await getAgentRecentAuthors({ agent, auth }),
    },
  });
});

app.patch(
  "/",
  validate("json", PostOrPatchAgentConfigurationRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const aId = c.req.param("aId") ?? "";
    const body = c.req.valid("json");

    const agent = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "full",
    });
    if (!agent || (!agent.canRead && !auth.isAdmin())) {
      return apiError(c, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The Agent you're trying to access was not found.",
        },
      });
    }

    if (!agent.canEdit && !auth.isAdmin()) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only editors can modify workspace agent.",
        },
      });
    }

    const agentConfiguration = await AgentConfigurationModel.findOne({
      where: {
        sId: aId,
        workspaceId: auth.workspace()?.id,
      },
    });

    if (!agentConfiguration) {
      return apiError(c, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The Agent you're trying to access was not found.",
        },
      });
    }

    const agentConfigurationRes = await createOrUpgradeAgentConfiguration({
      auth,
      assistant: body.assistant,
      agentConfigurationId: aId,
    });

    if (agentConfigurationRes.isErr()) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "assistant_saving_error",
          message: `Error updating agent: ${agentConfigurationRes.error.message}`,
        },
      });
    }

    return c.json({ agentConfiguration: agentConfigurationRes.value });
  }
);

app.delete("/", async (c) => {
  const auth = c.get("auth");
  const aId = c.req.param("aId") ?? "";

  const agent = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "full",
  });
  if (!agent || (!agent.canRead && !auth.isAdmin())) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The Agent you're trying to access was not found.",
      },
    });
  }

  if (!agent.canEdit && !auth.isAdmin()) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Only editors can delete workspace agent.",
      },
    });
  }

  const archived = await archiveAgentConfiguration(auth, aId);
  if (!archived) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to delete was not found.",
      },
    });
  }

  return c.json({ success: true });
});

app.route("/editors", editors);
app.route("/export", exportRoutes);
app.route("/feedbacks", feedbacks);
app.route("/history", history);
app.route("/last_author", lastAuthor);
app.route("/linked_slack_channels", linkedSlackChannels);
app.route("/mcp_configurations", mcpConfigurations);
app.route("/memories", memories);
app.route("/observability", observability);
app.route("/restore", restore);
app.route("/skills", skills);
app.route("/suggestions", suggestions);
app.route("/tags", tags);
app.route("/triggers", triggers);
app.route("/usage", usage);

export default app;
