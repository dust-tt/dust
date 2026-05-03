/** Seeded when a project is created (UI/API via `createSpaceAndGroup`, or MCP `create_project`). */
export const PROJECT_MANAGER_AGENT_SID = "project_manager" as const;

export const INITIAL_PROJECT_TODOS: {
  text: string;
  agentInstructions: string;
}[] = [
  {
    text: "Set up the project description and goals",
    agentInstructions:
      "Help the user refine a short project description and clear goals. Use project tools to read or update project metadata if available. Propose concrete edits; keep the tone practical and brief.",
  },
  {
    text: "Bring in knowledge from company data",
    agentInstructions:
      "When it matches the project’s purpose, do a substantive pass over company data (search / retrieval across workspace sources and connected systems—not just a single quick lookup). Synthesize what matters, cite where it came from, then help store it in project knowledge using project tools (files, uploads, or structured notes). Skip deep dives when context isn’t needed yet.",
  },
  {
    text: "Search for and add project members",
    agentInstructions:
      "Help the user invite the right collaborators. Use people search or directory capabilities when available; suggest candidates by role, team, or expertise relevant to the project. Guide them through adding those users as project members.",
  },
  {
    text: "Build a list of initial todos",
    agentInstructions:
      "Partner with the user to produce a practical starter backlog for this project: concrete next steps, early milestones, dependencies, and risks to watch. Keep items actionable; offer wording they can turn into todos. This list shapes follow-on work—don’t recycle these seeded items verbatim.",
  },
];
