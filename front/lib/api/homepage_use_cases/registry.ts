import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { GlobalSkillId } from "@app/lib/resources/skill/code_defined/global_registry";
import type { HomepageUseCaseType } from "@app/types/api/homepage_use_cases";
import type { JobType } from "@app/types/job_type";

export type ToolRequirement =
  | { type: "internalServer"; name: InternalMCPServerNameType }
  | { type: "remoteServer"; name: string };

/**
 * @cc [owner:adrsimon,label:product] any-of-attaches-one-tool
 * An `anyOf` requirement resolves when at least one alternative resolves, and MUST attach exactly
 * one tool: the first resolving alternative listed in the user's favorite platforms, else the
 * first resolving alternative in declared order.
 */
export type UseCaseRequirement =
  | { type: "skill"; id: GlobalSkillId }
  | ToolRequirement
  | { type: "anyOf"; of: ToolRequirement[] };

export type UsageMilestone = "joined_pod";

/**
 * @cc [owner:adrsimon,label:product] audience-decides-who-sees-a-use-case
 * On top of `requires`, a use case MUST be offered to a user only when its audience matches:
 * `everyone` and `featured` to every user, `jobTypes` only to users whose job type is listed,
 * `untilMilestone` only to users who have not reached that milestone yet. A user with no job type,
 * or one that is not a known `JobType`, MUST NOT be offered a `jobTypes` use case. A failure to
 * read the user's job type or milestones MUST fail the listing instead of falling back.
 */
export type UseCaseAudience =
  | { type: "everyone" }
  | { type: "featured" }
  | { type: "jobTypes"; jobTypes: JobType[] }
  | { type: "untilMilestone"; milestone: UsageMilestone };

/**
 * @cc [owner:adrsimon,label:product] featured-use-cases-cannot-be-dismissed
 * A `featured` use case MUST NOT be dismissible, and MUST be offered even to a user who dismissed
 * it before it was featured. Every other use case is dismissible.
 */
export function isDismissibleAudience(audience: UseCaseAudience): boolean {
  return audience.type !== "featured";
}

/**
 * @cc [owner:adrsimon,label:product] requirements-are-conjunctive
 * A use case MUST be offered only when every requirement in `requires` resolves in the
 * workspace. An empty list imposes no requirement.
 */
export interface HomepageUseCaseDefinition
  extends Omit<
    HomepageUseCaseType,
    "skills" | "tools" | "tier" | "isDismissible"
  > {
  audience: UseCaseAudience;
  requires: UseCaseRequirement[];
}

/**
 * @cc [owner:adrsimon,label:product] featured-use-cases-are-capped
 * At most `MAX_FEATURED_USE_CASES` definitions MAY have a `featured` audience at any time.
 */
export const HOMEPAGE_USE_CASES: HomepageUseCaseDefinition[] = [
  {
    id: "unanswered-messages",
    label: "Find important emails I haven't replied to",
    prompt:
      "Go through my inbox from the last 7 days and list the emails I have not replied to that need an answer from me. Group them by urgency, say who is waiting and since when, and suggest a one-line reply for each.",
    icon: "ActionMailIcon",
    audience: { type: "everyone" },
    requires: [
      {
        type: "anyOf",
        of: [
          { type: "internalServer", name: "gmail" },
          { type: "internalServer", name: "outlook" },
        ],
      },
    ],
  },
  {
    id: "unanswered-dms",
    label: "Find important DMs I haven't replied to",
    prompt:
      "Go through my direct messages from the last 7 days and list the ones I have not replied to that need an answer from me. Group them by urgency, say who is waiting and since when, and suggest a one-line reply for each.",
    icon: "ActionChatBubbleBottomCenterTextIcon",
    audience: { type: "everyone" },
    requires: [
      {
        type: "anyOf",
        of: [
          { type: "internalServer", name: "slack" },
          { type: "internalServer", name: "microsoft_teams" },
        ],
      },
    ],
  },
  {
    id: "industry-news",
    label: "Catch me up on the most important news in my industry",
    prompt:
      "Catch me up on the most important news in our industry from the last 7 days. Use our own documents to work out what industry we are in and who our competitors are, then search the web. Give me the five stories that matter most to us, why each one matters, and sources.",
    icon: "ActionGlobeAltIcon",
    audience: { type: "everyone" },
    requires: [{ type: "internalServer", name: "web_search_&_browse" }],
  },
  {
    id: "ai-news",
    label: "Catch me up on the AI news that matters most",
    prompt:
      "Catch me up on the AI news from the last 7 days that matters most: model releases, product launches, funding and regulation. Keep the five stories with real impact, say in one line why each one matters for a company like ours, and link the sources.",
    icon: "ActionAtomIcon",
    audience: { type: "everyone" },
    requires: [{ type: "internalServer", name: "web_search_&_browse" }],
  },
  {
    id: "weekly-priorities",
    label: "Help me identify and prioritize my key priorities for the week",
    prompt:
      "Help me identify and prioritize my key priorities for this week. Look at what is on my plate from my calendar, messages and our documents where you can reach them, then rank the top five by impact and urgency, and flag what I can drop or delegate.",
    icon: "ActionListCheckIcon",
    audience: { type: "everyone" },
    requires: [],
  },
  {
    id: "workspace-usage",
    label: "Show me how my team is using Dust",
    prompt:
      "Show me how my team is using Dust this month: active members, the agents and skills they lean on, and how that compares with last month. Point out who has not started yet.",
    icon: "ActionPieChartIcon",
    audience: { type: "everyone" },
    requires: [{ type: "skill", id: "workspace-analytics" }],
  },
  {
    id: "create-pod",
    label: "Create a Pod for my team project",
    prompt:
      "Help me create a Pod for my team project. Ask me what the project is and who is working on it, then create the Pod with a clear description and add the right people.",
    icon: "ActionFolderIcon",
    audience: { type: "untilMilestone", milestone: "joined_pod" },
    requires: [{ type: "skill", id: "projects" }],
  },
  {
    id: "meeting-prep",
    label: "Get me ready for my next customer meeting",
    prompt:
      "Get me ready for my next customer meeting: who is attending, what we discussed last time, open action items on my side, and two or three points I should raise. Keep it to one page.",
    icon: "GcalLogo",
    audience: {
      type: "jobTypes",
      jobTypes: ["sales", "customer_success", "revops"],
    },
    requires: [{ type: "internalServer", name: "google_calendar" }],
  },
  {
    id: "account-research",
    label: "Research an account before I reach out",
    prompt:
      "Research the company I name before I reach out: what they do, recent news, who the likely buyers are, and what we already know about them in our own documents. Finish with three angles for a first message.",
    icon: "ActionMagnifyingGlassIcon",
    audience: { type: "jobTypes", jobTypes: ["sales"] },
    requires: [{ type: "internalServer", name: "web_search_&_browse" }],
  },
  {
    id: "support-trends",
    label: "Spot the recurring issues in our support tickets",
    prompt:
      "Go through our Zendesk tickets from the last 30 days and find the recurring issues: group them by theme, count them, quote one representative ticket per theme, and suggest which ones deserve a help center article or a product fix.",
    icon: "ZendeskLogo",
    audience: {
      type: "jobTypes",
      jobTypes: ["customer_support", "customer_success"],
    },
    requires: [{ type: "internalServer", name: "zendesk" }],
  },
  {
    id: "linear-sprint-review",
    label: "Summarize what my team shipped this sprint",
    prompt:
      "Go through our Linear issues for the current cycle: what shipped, what slipped and why, and what is still in review. Group it by project and flag anything that has been in progress for more than a week.",
    icon: "LinearLogo",
    audience: { type: "jobTypes", jobTypes: ["engineering", "product"] },
    requires: [{ type: "remoteServer", name: "Linear" }],
  },
  {
    id: "deep-research",
    label: "Research how our competitors position themselves",
    prompt:
      "Research how our competitors have positioned themselves over the last year: the players that gained ground, what they shipped, how they talk about it, and where we are exposed. Use our own documents and the web, and write it up with sources.",
    icon: "ActionMegaphoneIcon",
    audience: { type: "jobTypes", jobTypes: ["marketing", "product"] },
    requires: [{ type: "skill", id: "go-deep" }],
  },
  {
    id: "spreadsheet-analysis",
    label: "Turn a spreadsheet into an analysis",
    prompt:
      "Take the spreadsheet I attach, clean it up, and tell me what it says: the three numbers that matter, how they moved, and what looks off. Give me back a sheet with the analysis alongside the data.",
    icon: "ActionTableIcon",
    audience: {
      type: "jobTypes",
      jobTypes: ["finance", "data", "revops", "operations", "procurement"],
    },
    requires: [{ type: "skill", id: "xlsx" }],
  },
  {
    id: "write-doc",
    label: "Draft a document from our own knowledge",
    prompt:
      "Draft a one-page brief on the topic I name, sourced from our own documents: where it stands, what is blocked, who owns what, and the decisions still open. Hand it back as a document.",
    icon: "ActionDocumentTextIcon",
    audience: {
      type: "jobTypes",
      jobTypes: ["people", "legal", "operations", "it"],
    },
    requires: [{ type: "skill", id: "docx" }],
  },
];
