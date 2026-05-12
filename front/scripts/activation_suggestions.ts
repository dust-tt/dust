import {
  getInternalMCPServerMetadata,
  getInternalMCPServerNameFromSId,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { isJobType, JOB_TYPE_LABELS } from "@app/types/job_type";
import { removeNulls } from "@app/types/shared/utils/general";

type ConnectedServer = {
  name: string;
  description: string;
  tools: Array<{ name: string; description: string }>;
};

type Suggestion = {
  notification_text: string;
  tools_combined: string[];
  why_non_chatgpt: string;
  recurring_potential: "daily" | "weekly" | "one-off";
  graduation_trigger: string;
};

makeScript(
  {
    workspaceId: {
      type: "string" as const,
      description: "Workspace sId",
      required: true,
    },
    userId: {
      type: "string" as const,
      description: "User sId",
      required: true,
    },
    send: {
      type: "boolean" as const,
      description: "Create a Dust conversation presenting the suggestions",
      default: false,
    },
  },
  async ({ workspaceId, userId, send }, logger) => {
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      userId,
      workspaceId
    );

    if (!auth.user() || !auth.workspace()) {
      logger.error({ workspaceId, userId }, "User or workspace not found");
      process.exit(1);
    }

    const user = await UserResource.fetchById(userId);
    const jobTypeMeta = user ? await user.getMetadata("job_type") : null;
    const jobTypeRaw = jobTypeMeta?.value ?? null;
    const jobTitle =
      jobTypeRaw && isJobType(jobTypeRaw)
        ? JOB_TYPE_LABELS[jobTypeRaw]
        : jobTypeRaw;

    const [personalConnections, workspaceConnections] = await Promise.all([
      MCPServerConnectionResource.listByWorkspace(auth, {
        connectionType: "personal",
      }),
      MCPServerConnectionResource.listByWorkspace(auth, {
        connectionType: "workspace",
      }),
    ]);

    // Deduplicate by server key, preferring personal over workspace.
    const seen = new Set<string>();
    const uniqueConnections = [
      ...personalConnections,
      ...workspaceConnections,
    ].filter((conn) => {
      const key =
        conn.internalMCPServerId ?? `remote:${conn.remoteMCPServerId}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    const remoteModelIds = removeNulls(
      uniqueConnections
        .filter((c) => c.serverType === "remote")
        .map((c) => c.remoteMCPServerId)
    );

    const remoteServers = await RemoteMCPServerResource.fetchByModelIds(
      auth,
      remoteModelIds
    );
    const remoteServerByModelId = new Map(remoteServers.map((s) => [s.id, s]));

    const connectedServers: ConnectedServer[] = [];

    for (const conn of uniqueConnections) {
      if (conn.serverType === "internal" && conn.internalMCPServerId) {
        const name = getInternalMCPServerNameFromSId(conn.internalMCPServerId);
        if (!name) {
          continue;
        }
        const metadata = getInternalMCPServerMetadata(name);
        connectedServers.push({
          name: metadata.serverInfo.name,
          description: metadata.serverInfo.description,
          tools: metadata.tools.map((t) => ({
            name: t.name,
            description: t.description,
          })),
        });
      } else if (
        conn.serverType === "remote" &&
        conn.remoteMCPServerId !== null
      ) {
        const server = remoteServerByModelId.get(conn.remoteMCPServerId);
        if (!server) {
          continue;
        }
        connectedServers.push({
          name: server.cachedName,
          description: server.cachedDescription ?? "",
          tools: (server.cachedTools ?? []).map((t) => ({
            name: t.name,
            description: t.description,
          })),
        });
      }
    }

    if (connectedServers.length === 0) {
      const output = {
        user_id: userId,
        workspace_id: workspaceId,
        connected_tools: [],
        suggestions: [],
      };
      process.stdout.write(JSON.stringify(output, null, 2) + "\n");
      return;
    }

    const toolsList = connectedServers
      .map((server) => {
        const toolSummary =
          server.tools.length > 0
            ? "\n  Tools: " +
              server.tools.map((t) => `${t.name} (${t.description})`).join(", ")
            : "";
        return `- **${server.name}**: ${server.description}${toolSummary}`;
      })
      .join("\n");

    const roleContext = jobTitle
      ? `The user's job title is: ${jobTitle}.`
      : "No job title is known for this user.";

    const userPrompt = `${roleContext}

This user has these tools connected to Dust:

${toolsList}

Generate 5 activation suggestions tailored to their role. Start from the use case, not the tools — identify the most valuable recurring workflows for someone in this role, then pick only the tools that genuinely belong in that workflow. Do not force tool combinations for their own sake; a suggestion using 2 tools that fits naturally is better than one using 4 tools awkwardly.

Each suggestion must:
- Be immediate: frame as something Dust can do RIGHT NOW, not as an automation to set up. The user should be able to act on this in one click. Not "weekly, Dust will..." but "want Dust to... right now?"
- Be a bet, not a report: since we haven't looked at the user's data, make a confident inference about what someone in this role probably has piling up right now. "You likely have..." or "Engineers usually have..." is fine.
- Be ubiquitous: target pain points that virtually everyone in this role experiences, not niche workflows
- Be team-centric: focus on workflows that make this person more effective as a collaborator, not just personal productivity
- Be sticky: target recurring pain points someone in this role faces every week — but frame the suggestion as a one-time action they can try now. The recurring automation is what they graduate to later, not what you pitch upfront.
- Only involve tools that play a clear, necessary role in the workflow
- Describe what DUST DOES, not what the user should ask. "Dust will scan your Slack and Gmail and tell you what needs attention" not "Try asking Dust to scan your Slack"
- End with a lightweight CTA: "Want me to check?" or "Try it now"

The notification_text should read like a push notification or a Slack DM from a helpful assistant — short, direct, casual. Not like a product feature description or an automation catalog entry.

Respond with a JSON array only (no markdown fences, no explanation):
[
  {
    "notification_text": "Brief, immediate, action-oriented description of what Dust can do for them right now (1-2 sentences, ends with CTA)",
    "tools_combined": ["Tool A", "Tool B"],
    "why_non_chatgpt": "What makes this only possible with Dust's live connected tools",
    "recurring_potential": "daily | weekly | one-off",
    "graduation_trigger": "What trigger/automation this becomes if the user does it 3+ times"
  }
]

recurring_potential must be one of: "daily", "weekly", "one-off"`;

    const res = await runMultiActionsAgent(
      auth,
      {
        providerId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.providerId,
        modelId: CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId,
        useCache: false,
      },
      {
        conversation: {
          messages: [
            {
              role: "user",
              name: "activation_suggestions",
              content: [{ type: "text", text: userPrompt }],
            },
          ],
        },
        prompt:
          "You generate immediate, action-oriented activation suggestions for Dust users — framed as things Dust can do RIGHT NOW, not automations to set up. Each suggestion should read like a push notification: short, direct, casual, ending with a lightweight CTA. Respond with valid JSON only.",
        specifications: [],
      },
      {
        context: {
          operationType: "agent_suggestion",
          workspaceId,
        },
      }
    );

    if (res.isErr()) {
      logger.error({ error: res.error.message }, "LLM call failed");
      process.exit(1);
    }

    const generation = res.value.generation ?? "";

    let suggestions: Suggestion[] = [];
    try {
      const parsed: unknown = JSON.parse(generation);
      if (!Array.isArray(parsed)) {
        throw new Error("Expected a JSON array");
      }
      suggestions = parsed as Suggestion[];
    } catch (err) {
      logger.error(
        { generation, err },
        "Failed to parse LLM response as JSON array"
      );
      process.stdout.write(generation + "\n");
      return;
    }

    const output = {
      user_id: userId,
      workspace_id: workspaceId,
      job_title: jobTitle,
      connected_tools: connectedServers.map((s) => ({
        name: s.name,
        description: s.description,
      })),
      suggestions,
    };

    process.stdout.write(JSON.stringify(output, null, 2) + "\n");

    if (!send) {
      return;
    }

    const userJson = auth.getNonNullableUser().toJSON();

    await concurrentExecutor(
      suggestions,
      async (suggestion) => {
        const content = [
          suggestion.notification_text,
          "",
          `:quickReply[Do it]{message="${suggestion.notification_text.slice(0, 120)}"} :quickReply[Suggest something else]{message="Suggest another workflow Dust can run for me based on my connected tools."}`,
        ].join("\n");

        const conversation = await createConversation(auth, {
          title: suggestion.notification_text.slice(0, 60),
          visibility: "unlisted",
          spaceId: null,
          metadata: {
            reinforcedSkillNotification: {
              skillName: "activation_suggestion",
              skillId: "activation_suggestion",
            },
          },
        });

        const postRes = await postUserMessage(auth, {
          conversation,
          content,
          mentions: [{ configurationId: GLOBAL_AGENTS_SID.DUST }],
          context: {
            username: userJson.username,
            fullName: userJson.fullName,
            email: userJson.email,
            profilePictureUrl: userJson.image,
            timezone: "UTC",
            origin: "reinforced_skill_notification",
          },
          skipToolsValidation: true,
        });

        if (postRes.isErr()) {
          logger.error(
            { error: postRes.error },
            "Failed to post suggestion message"
          );
          return;
        }

        await ConversationResource.upsertParticipation(auth, {
          conversation,
          action: "posted",
          user: userJson,
          lastReadAt: null,
        });

        logger.info(
          {
            conversationId: conversation.sId,
            tools: suggestion.tools_combined,
          },
          `/w/${workspaceId}/assistant/${conversation.sId}`
        );
      },
      { concurrency: 3 }
    );
  }
);
