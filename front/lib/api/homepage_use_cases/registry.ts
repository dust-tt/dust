import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { GlobalSkillId } from "@app/lib/resources/skill/code_defined/global_registry";
import type { HomepageUseCaseType } from "@app/types/api/homepage_use_cases";

export type UseCaseRequirement =
  | { type: "skill"; id: GlobalSkillId }
  | { type: "internalServer"; name: InternalMCPServerNameType }
  | { type: "remoteServer"; name: string };

/**
 * @cc [owner:adrsimon,label:product] requirements-are-conjunctive
 * A use case MUST be offered only when every requirement in `requires` resolves in the
 * workspace. An empty list imposes no requirement.
 */
export interface HomepageUseCaseDefinition
  extends Omit<HomepageUseCaseType, "skills" | "tools"> {
  requires: UseCaseRequirement[];
}

export const HOMEPAGE_USE_CASES: HomepageUseCaseDefinition[] = [
  {
    id: "meeting-prep",
    label: "Get me ready for my next meeting",
    prompt:
      "Get me ready for my next meeting: who is attending, what we discussed last time, open action items on my side, and two or three points I should raise. Keep it to one page.",
    icon: "GcalLogo",
    requires: [{ type: "internalServer", name: "google_calendar" }],
  },
  {
    id: "unanswered-messages",
    label: "Find important messages I haven't answered",
    prompt:
      "Go through my inbox from the last 7 days and list the messages I have not replied to that need an answer from me. Group them by urgency, say who is waiting and since when, and suggest a one-line reply for each.",
    icon: "GmailLogo",
    requires: [{ type: "internalServer", name: "gmail" }],
  },
  {
    id: "linear-sprint-review",
    label: "Summarise what my team shipped this sprint",
    prompt:
      "Go through our Linear issues for the current cycle: what shipped, what slipped and why, and what is still in review. Group it by project and flag anything that has been in progress for more than a week.",
    icon: "LinearLogo",
    requires: [{ type: "remoteServer", name: "Linear" }],
  },
  {
    id: "team-dashboard",
    label: "Build a dashboard of our team's performance",
    prompt:
      "Build a dashboard of our team's performance for this quarter: shipped work per week, cycle time, open bugs by severity, and on-call load. Compare against last quarter and call out the two trends that deserve attention.",
    icon: "ActionFrameIcon",
    requires: [{ type: "skill", id: "frames" }],
  },
  {
    id: "company-presentation",
    label: "Create a presentation about what our company does",
    prompt:
      "Create a 10-slide presentation about what our company does for a new hire's first day: the problem we solve, who our customers are, how the product works, how the teams are organised, and what we are focused on this year. Use our own docs as the source.",
    icon: "ActionSlideshowIcon",
    requires: [{ type: "skill", id: "pptx" }],
  },
  {
    id: "deep-research",
    label: "Research a topic in depth and write it up",
    prompt:
      "Research how our market has moved over the last year: the players that gained ground, what they shipped, and where we are exposed. Use our own documents and the web, and write it up with sources.",
    icon: "ActionAtomIcon",
    requires: [{ type: "skill", id: "go-deep" }],
  },
  {
    id: "spreadsheet-analysis",
    label: "Turn a spreadsheet into an analysis",
    prompt:
      "Take the spreadsheet I attach, clean it up, and tell me what it says: the three numbers that matter, how they moved, and what looks off. Give me back a sheet with the analysis alongside the data.",
    icon: "ActionTableIcon",
    requires: [{ type: "skill", id: "xlsx" }],
  },
  {
    id: "workspace-usage",
    label: "Show me how the workspace uses Dust",
    prompt:
      "Show me how our workspace uses Dust this month: active members, the agents and skills they lean on, and how that compares with last month. Point out the teams that have not started yet.",
    icon: "ActionPieChartIcon",
    requires: [{ type: "skill", id: "workspace-analytics" }],
  },
  {
    id: "write-doc",
    label: "Draft a document from our own knowledge",
    prompt:
      "Draft a one-page brief on the project I name, sourced from our own documents: where it stands, what is blocked, who owns what, and the decisions still open. Hand it back as a document.",
    icon: "ActionDocumentTextIcon",
    requires: [{ type: "skill", id: "docx" }],
  },
];
