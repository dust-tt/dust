import { createPlugin } from "@app/lib/api/poke/types";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import { ProjectTaskSourceModel } from "@app/lib/resources/storage/models/project_task";
import { TakeawaysResource } from "@app/lib/resources/takeaways_resource";
import { Err, Ok } from "@app/types/shared/result";

export const projectTodoDetailsPlugin = createPlugin({
  manifest: {
    id: "project-task-details",
    name: "Project Task Details",
    description:
      "Display all related objects for a Project Task (sources, conversations, etc.)",
    resourceTypes: ["workspaces"],
    readonly: true,
    args: {
      taskId: {
        type: "string",
        label: "Project Task sId or ModelId",
        description:
          "The sId or numeric ModelId of the Project Task to inspect",
      },
    },
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Workspace not found."));
    }

    const numericId = Number(args.taskId);
    const task =
      Number.isInteger(numericId) && numericId > 0
        ? await ProjectTaskResource.fetchByModelIdWithDeleted(auth, numericId)
        : await ProjectTaskResource.fetchBySIdWithDeleted(auth, args.taskId);

    if (!task) {
      return new Err(new Error(`Project Task not found: ${args.taskId}`));
    }

    const taskSId = task.sId;
    const workspaceId = auth.getNonNullableWorkspace().id;

    const [sourcesMap, conversationsMap, taskSources] = await Promise.all([
      ProjectTaskResource.fetchSourcesForTaskIds(auth, { sIds: [taskSId] }),
      ProjectTaskResource.fetchConversationIdsForTaskIds(auth, {
        sIds: [taskSId],
      }),
      ProjectTaskSourceModel.findAll({
        where: { workspaceId, projectTodoId: task.id },
      }),
    ]);

    const sources = sourcesMap.get(taskSId) ?? [];
    const conversationId = conversationsMap.get(taskSId) ?? null;

    const statusEmoji: Record<string, string> = {
      todo: "⬜",
      in_progress: "🔄",
      done: "✅",
    };

    const sourcesSection =
      sources.length === 0
        ? "_No sources._"
        : sources
            .map((s) => {
              const link = s.sourceUrl ? ` ([link](${s.sourceUrl}))` : "";
              return `- **${s.sourceType}** — ${s.sourceTitle ?? s.sourceId}${link}`;
            })
            .join("\n");

    const conversationSection = conversationId
      ? `\`${conversationId}\``
      : "_No linked conversation._";

    const takeawayResults = await Promise.all(
      taskSources.map(async (src) => {
        const takeaway = await TakeawaysResource.fetchLatestBySourceIdAndType(
          auth,
          { sourceId: src.sourceId, sourceType: src.sourceType }
        );
        return { src, takeaway };
      })
    );

    const takeawaysSection =
      takeawayResults.length === 0
        ? "_No takeaway sources._"
        : takeawayResults
            .map(({ src, takeaway }) => {
              const link = src.sourceUrl ? ` ([link](${src.sourceUrl}))` : "";
              const label = `**${src.sourceType}** — ${src.sourceTitle ?? src.sourceId}${link}`;

              if (!takeaway) {
                return `- ${label} — _no takeaway found_`;
              }

              const actionItem = takeaway.actionItems.find(
                (item) => item.sId === src.itemId
              );
              const itemDetail = actionItem
                ? `\n  - _"${actionItem.shortDescription}"_`
                : `\n  - _item \`${src.itemId}\` not found in takeaway_`;

              return `- ${label}${itemDetail}`;
            })
            .join("\n");

    const json = task.toJSON();
    const doneAt = json.doneAt ? new Date(json.doneAt).toISOString() : "—";
    const createdAt = new Date(json.createdAt).toISOString();
    const updatedAt = new Date(json.updatedAt).toISOString();

    const assignee = json.user
      ? `${json.user.fullName} (\`${json.user.sId}\`)`
      : "_Unassigned_";

    const creatorId =
      json.createdByType === "agent"
        ? (json.createdByAgentConfigurationId ?? "—")
        : (json.createdByUserId ?? "—");

    const markedDoneBy = json.markedAsDoneByType
      ? json.markedAsDoneByType === "agent"
        ? `agent \`${json.markedAsDoneByAgentConfigurationId ?? "unknown"}\``
        : `user \`${json.markedAsDoneByUserId ?? "unknown"}\``
      : "—";

    return new Ok({
      display: "markdown",
      value: `## ${statusEmoji[json.status] ?? "❓"} Project Task \`${task.id}\` \`${task.sId}\`

**Text:** ${json.text}

| Field | Value |
|---|---|
| Status | \`${json.status}\` |
| Assignee | ${assignee} |
| Created by | \`${json.createdByType}\` \`${creatorId}\` |
| Created at | ${createdAt} |
| Updated at | ${updatedAt} |
| Done at | ${doneAt} |
| Marked done by | ${markedDoneBy} |
| Rationale | ${json.actorRationale ?? "—"} |
| Agent suggestion | ${json.agentSuggestionStatus ?? "—"} |
| Agent instructions | ${json.agentInstructions ? `\`\`\`\n${json.agentInstructions}\n\`\`\`` : "—"} |

## Sources (${sources.length})

${sourcesSection}

## Takeaways (${takeawayResults.length})

${takeawaysSection}

## Linked Conversation

${conversationSection}
`,
    });
  },
});
