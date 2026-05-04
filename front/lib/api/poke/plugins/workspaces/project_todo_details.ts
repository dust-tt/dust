import { createPlugin } from "@app/lib/api/poke/types";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { ProjectTodoTakeawaySourcesModel } from "@app/lib/resources/storage/models/project_todo_takeaway_sources";
import {
  TakeawaySourcesModel,
  TakeawaysModel,
} from "@app/lib/resources/storage/models/takeaways";
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

    const [sourcesMap, conversationsMap, takeawayLinks] = await Promise.all([
      ProjectTodoResource.fetchSourcesForTodoIds(auth, { sIds: [todoSId] }),
      ProjectTodoResource.fetchConversationIdsForTodoIds(auth, {
        sIds: [todoSId],
      }),
      ProjectTodoTakeawaySourcesModel.findAll({
        where: { workspaceId, projectTodoId: todo.id },
        include: [
          {
            model: TakeawaySourcesModel,
            as: "takeawaySource",
            required: true,
          },
        ],
      }),
    ]);

    const sources = sourcesMap.get(todoSId) ?? [];
    const conversationId = conversationsMap.get(todoSId) ?? null;

    // Fetch the parent TakeawaysModel rows to retrieve actionItems.
    const takeawaysIds = [
      ...new Set(
        takeawayLinks
          .map((l) => l.takeawaySource?.takeawaysId)
          .filter((id): id is number => id != null)
      ),
    ];
    const takeawaysById = new Map(
      takeawaysIds.length > 0
        ? (
            await TakeawaysModel.findAll({
              where: { workspaceId, id: takeawaysIds },
            })
          ).map((t) => [t.id, t])
        : []
    );

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

    const takeawaysSection =
      takeawayLinks.length === 0
        ? "_No takeaway sources._"
        : takeawayLinks
            .map((link) => {
              const src = link.takeawaySource;
              const takeaway = src ? takeawaysById.get(src.takeawaysId) : null;
              const srcLink = src?.sourceUrl
                ? ` ([link](${src.sourceUrl}))`
                : "";
              const label = `**${src?.sourceType}** — ${src?.sourceTitle ?? src?.sourceId}${srcLink}`;

              const matchingItem = takeaway?.actionItems?.find(
                (item: { sId: string }) => item.sId === todoSId
              );
              const itemDetail = matchingItem
                ? `\n  - _"${matchingItem.shortDescription}"_ (status: \`${matchingItem.status}\`)`
                : "";

              return `- ${label}${itemDetail}`;
            })
            .join("\n");

    const doneAt = todo.doneAt ? new Date(todo.doneAt).toISOString() : "—";
    const createdAt = new Date(todo.createdAt).toISOString();

    return new Ok({
      display: "markdown",
      value: `## ${statusEmoji[todo.status] ?? "❓"} Project TODO \`${todo.sId}\`

**Text:** ${todo.text}

| Field | Value |
|---|---|
| Status | \`${todo.status}\` |
| Created by | \`${todo.createdByType}\` |
| Created at | ${createdAt} |
| Done at | ${doneAt} |

## Sources (${sources.length})

${sourcesSection}

## Takeaway Sources (${takeawayLinks.length})

${takeawaysSection}

## Linked Conversation

${conversationSection}
`,
    });
  },
});
