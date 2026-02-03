import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types";
import { getSmallWhitelistedModel } from "@app/types/assistant/assistant";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const FUNCTION_NAME = "generate_project_summary";

const specifications: AgentActionSpecification[] = [
  {
    name: FUNCTION_NAME,
    description: "Generate a summary of recent project activity",
    inputSchema: {
      type: "object",
      properties: {
        project_summary: {
          type: "string",
          description:
            "A comprehensive markdown-formatted summary of recent project activity including conversations, file changes, and metadata.",
        },
      },
      required: ["project_summary"],
    },
  },
];

export async function generateProjectSummary(
  auth: Authenticator,
  space: SpaceResource
): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const model = getSmallWhitelistedModel(owner);
  if (!model) {
    return new Err(
      new Error("Failed to find a whitelisted model to generate summary")
    );
  }

  // Gather project data
  const projectData = await gatherProjectData(auth, space);

  const prompt = `You are an AI assistant helping to summarize recent activity in a project workspace.

Based on the following project data, generate a comprehensive summary that includes:
1. Overview of recent conversations and their topics
2. File changes and updates (if available)
3. Active members and their contributions
4. Connected data sources and tools
5. Key themes and progress indicators

Project Data:
${projectData}

Generate a well-structured markdown summary that highlights the most important activity and changes since the last journal entry. Focus on actionable insights and progress made.`;

  try {
    const res = await runMultiActionsAgent(
      auth,
      {
        providerId: model.providerId,
        modelId: model.modelId,
      },
      {
        conversation: {
          messages: [
            {
              role: "user",
              name: "System",
              content: [{ type: "text", text: prompt }],
            },
          ],
        },
        prompt,
        specifications,
        forceToolCall: FUNCTION_NAME,
      }
    );

    if (res.isErr()) {
      return res;
    }

    const actions = res.value.actions;
    if (!actions || actions.length === 0) {
      return new Err(new Error("No actions returned from model"));
    }

    const action = actions[0];
    if (!action) {
      return new Err(new Error("Action is undefined"));
    }

    const summary = action.arguments.project_summary;

    if (typeof summary !== "string") {
      return new Err(new Error("Invalid summary format returned from model"));
    }

    return new Ok(summary);
  } catch (error) {
    logger.error(
      {
        spaceId: space.sId,
        error,
      },
      "Error generating project summary"
    );
    return new Err(normalizeError(error));
  }
}

async function gatherProjectData(
  auth: Authenticator,
  space: SpaceResource
): Promise<string> {
  const sections: string[] = [];

  // Project metadata
  sections.push(`## Project Information`);
  sections.push(`- **Name**: ${space.name}`);

  const { conversations } =
    await ConversationResource.listConversationsInSpacePaginated(auth, {
      spaceId: space.sId,
      pagination: {
        limit: 20,
      },
    });

  if (conversations.length > 0) {
    sections.push(`\n## Recent Conversations (${conversations.length} total)`);
    conversations.slice(0, 10).forEach((conv) => {
      const title = conv.title ?? "Untitled conversation";
      const updatedDate = new Date(conv.updatedAt).toLocaleDateString();
      sections.push(`- **${title}** (updated: ${updatedDate})`);
    });
  }

  // Improvements ideas:
  // * add a call to an agent instead of a direct LLM call
  // * read project metadata
  // * use the unread status of the user to get only the relevant ones
  // * Add file changes
  // * Data source search
  // * Add member activity information

  return sections.join("\n");
}
