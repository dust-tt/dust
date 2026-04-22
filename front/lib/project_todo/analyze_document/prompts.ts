import type { ProjectTodoSourceType } from "@app/types/project_todo";
import { assertNever } from "@app/types/shared/utils/assert_never";

export function buildPromptForSourceType(
  sourceType: ProjectTodoSourceType
): string {
  switch (sourceType) {
    case "project_conversation":
      return (
        "IMPORTANT CONTEXT: This is a conversation between human users and Dust AI agents.\n" +
        "Messages from the agents are AI-generated responses, NOT from a human participant.\n" +
        "- Do NOT treat user questions that the agents already answered as open action items.\n" +
        "- Only extract action items that represent real commitments between human participants, " +
        "or tasks that a human explicitly stated they need to do outside the conversation.\n" +
        "- A user asking the agents to do something (e.g., 'can you check X?', 'please look into Y') " +
        "is NOT an action item — it is a query being handled in real-time by the agents.\n" +
        "- Assignees and relevant users must always be human participants, never the agents.\n\n"
      );
    case "project_knowledge":
      return (
        "IMPORTANT CONTEXT: This is a project knowledge document.\n" +
        "It has been added to the project knowledge base explicitly\n\n"
      );
    case "slack":
      return (
        "IMPORTANT CONTEXT: This is a slack thread mostly between human users but sometimes humans can interact with Bots.\n" +
        "- Do NOT treat user questions that the bots already answered as open action items.\n" +
        "- Only extract action items that represent real commitments between human participants, " +
        "or tasks that a human explicitly stated they need to do outside the thread.\n" +
        "- A user asking the bots to do something (e.g., 'can you check X?', 'please look into Y') " +
        "is NOT an action item — it is a query being handled in real-time by the bots.\n" +
        "- Assignees and relevant users must always be human participants, never the bots.\n" +
        "- Short troubleshooting threads often have one action item at most and rarely contain " +
        "notable facts or key decisions. Do not over-extract from casual back-and-forth.\n\n"
      );
    case "notion":
      return (
        "IMPORTANT CONTEXT: This is a notion document.\n" +
        "It has been added to the project knowledge base explicitly\n\n"
      );
    case "gdrive":
      return (
        "IMPORTANT CONTEXT: This is a gdrive document.\n" +
        "It has been added to the project knowledge base explicitly\n\n"
      );
    case "confluence":
      return (
        "IMPORTANT CONTEXT: This is a confluence document.\n" +
        "It has been added to the project knowledge base explicitly\n\n"
      );
    case "github":
      return (
        "IMPORTANT CONTEXT: This is a github document (issue, pull request, discussion, or code file).\n" +
        "It has been added to the project knowledge base explicitly\n\n"
      );
    case "microsoft":
      return (
        "IMPORTANT CONTEXT: This is a Microsoft document (SharePoint, OneDrive, or Teams file).\n" +
        "It has been added to the project knowledge base explicitly\n\n"
      );
    default:
      assertNever(sourceType);
  }
}
