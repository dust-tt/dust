import { createPlugin } from "@app/lib/api/poke/types";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { ProjectTodoSourceModel } from "@app/lib/resources/storage/models/project_todo";
import { TakeawaysResource } from "@app/lib/resources/takeaways_resource";
import { Err, Ok } from "@app/types/shared/result";

export const projectTodoDetailsPlugin = createPlugin({
  manifest: {
    id: "project-todo-details",
    name: "Project TODO Details",
    description:
      "Display all related objects for a Project TODO (sources, conversations, etc.)",
    resourceTypes: ["workspaces"],
    readonly: true,
    args: {
      todoId: {
        type: "string",
        label: "Project TODO sId or ModelId",
        description:
          "The sId or numeric ModelId of the Project TODO to inspect",
      },
    },
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Workspace not found."));
    }

    const numericId = Number(args.todoId);
    const todo =
      Number.isInteger(numericId) && numericId > 0
        ? await ProjectTodoResource.fetchByModelIdWithDeleted(auth, numericId)
        : await ProjectTodoResource.fetchBySIdWithDeleted(auth, args.todoId);

    if (!todo) {
      return new Err(new Error(`Project TODO not found: ${args.todoId}`));
    }

    const todoSId = todo.sId;
    const workspaceId = auth.getNonNullableWorkspace().id;

    const [sourcesMap, conversationsMap, todoSources] = await Promise.all([
      ProjectTodoResource.fetchSourcesForTodoIds(auth, { sIds: [todoSId] }),
      ProjectTodoResource.fetchConversationIdsForTodoIds(auth, {
        sIds: [todoSId],
      }),
      ProjectTodoSourceModel.findAll({
        where: { workspaceId, projectTodoId: todo.id },
      }),
    ]);

    const sources = sourcesMap.get(todoSId) ?? [];
    const conversationId = conversationsMap.get(todoSId) ?? null;

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
      todoSources.map(async (src) => {
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
                ? `\n  - _"${actionItem.shortDescription}"_ (status: \`${actionItem.status}\`)`
                : `\n  - _item \`${src.itemId}\` not found in takeaway_`;

              return `- ${label}${itemDetail}`;
            })
            .join("\n");

    const doneAt = todo.doneAt ? new Date(todo.doneAt).toISOString() : "—";
    const createdAt = new Date(todo.createdAt).toISOString();

    return new Ok({
      display: "markdown",
      value: `## ${statusEmoji[todo.status] ?? "❓"} Project TODO \`${todo.id}\` \`${todo.sId}\` 

**Text:** ${todo.text}

| Field | Value |
|---|---|
| Status | \`${todo.status}\` |
| Created by | \`${todo.createdByType}\` |
| Created at | ${createdAt} |
| Done at | ${doneAt} |

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
