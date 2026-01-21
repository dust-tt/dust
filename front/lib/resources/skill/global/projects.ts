import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

const PROJECT_INSTRUCTIONS =
  "Project management tools:\n" +
  "- Use `search` to find content within the project context files.\n" +
  "- Use `list_project_files` to see all files in the project context.\n" +
  "- Use `add_project_file` to add new files to the project context (provide either content or sourceFileId).\n" +
  "- Use `update_project_file` to update existing project context files (provide either content or sourceFileId).\n\n" +
  "Project context files are shared across all conversations in this project.\n" +
  "Only text-based files are supported for adding/updating.\n" +
  "You can add/update files by providing text content directly, or by copying from existing files (like those you've generated).\n" +
  "Requires write permissions on the project space for write operations.";

export const projectsSkill = {
  sId: "projects",
  name: "Projects",
  userFacingDescription:
    "Search and manage files within project contexts. Add, update, and organize project-specific files.",
  agentFacingDescription:
    "Search project context files and manage project-specific documents.",
  instructions: PROJECT_INSTRUCTIONS,
  internalMCPServerNames: ["search", "project_context_management"],
  version: 1,
  icon: "ActionDocumentTextIcon",
  // This skill is auto-enabled in project conversations (context-dependent).
  // It's hidden from the builder UI since it's only available based on conversation context.
  isAutoEnabled: true,
  isHiddenBuilder: true,
} as const satisfies GlobalSkillDefinition;
