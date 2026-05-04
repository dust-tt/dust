/** Seeded when a project is created (UI/API via `createSpaceAndGroup`, or MCP `create_project`). */
export const PROJECT_MANAGER_AGENT_SID = "project_manager" as const;

const NEXT_TODO_PROMPT =
  "After the user agrees to mark this todo done, check what other todos are still open in the project. Propose tackling the most relevant next open one to the user. If they agree, use start_todo_agent to kick off a conversation for it and share the conversation link in your reply.";

export const INITIAL_PROJECT_TODOS: {
  text: string;
  agentInstructions: string;
}[] = [
  {
    text: "Set up the project description and goals",
    agentInstructions:
      "Help the user refine a short project description and clear goals. Use project tools to read or update project metadata if available. Propose concrete edits; keep the tone practical and brief.\n\n" +
      NEXT_TODO_PROMPT,
  },
  {
    text: "Bring in knowledge from company data",
    agentInstructions:
      "When it matches the project's purpose, do a substantive pass over company data (search / retrieval across workspace sources and connected systems—not just a single quick lookup). Synthesize what matters, cite where it came from, then help store it in project knowledge using project tools (files, uploads, or structured notes). Skip deep dives when context isn't needed yet.\n\n" +
      NEXT_TODO_PROMPT,
  },
  {
    text: "Search for and add project members",
    agentInstructions:
      "Help the user identify the right collaborators for this project. Use people search or directory tools to find candidates by name, role, team, or expertise. Once you have good candidates, mention them by name in the conversation using @mention — this will show the user a dialog to add them to the project directly from the conversation. If the user needs an alternative, link them to the project settings page by appending `#settings` to the project URL.\n\n" +
      NEXT_TODO_PROMPT,
  },
  {
    text: "Build a list of initial todos",
    agentInstructions:
      "Partner with the user to produce a practical starter backlog for this project: concrete next steps, early milestones, dependencies, and risks to watch. Keep items actionable; offer wording they can turn into todos. This list shapes follow-on work—don't recycle these seeded items verbatim.\n\n" +
      NEXT_TODO_PROMPT,
  },
];
