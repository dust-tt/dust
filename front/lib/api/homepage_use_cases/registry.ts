import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { GlobalSkillId } from "@app/lib/resources/skill/code_defined/global_registry";
import type { HomepageUseCaseType } from "@app/types/api/homepage_use_cases";
import type {
  ConcreteResourceType,
  GrantVerb,
} from "@app/types/group_permissions";
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
  | { type: "anyOf"; of: ToolRequirement[] }
  | {
      type: "workspacePermission";
      verb: GrantVerb;
      resourceType: ConcreteResourceType;
    };

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
 * workspace. An empty list imposes no requirement. A `workspacePermission` requirement resolves
 * only when the user holds that workspace permission.
 */
export interface HomepageUseCaseDefinition extends Omit<
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
    icon: "ActionGlobeAltIcon",
    audience: { type: "everyone" },
    requires: [{ type: "internalServer", name: "web_search_&_browse" }],
  },
  {
    id: "ai-news",
    icon: "ActionAtomIcon",
    audience: { type: "everyone" },
    requires: [{ type: "internalServer", name: "web_search_&_browse" }],
  },
  {
    id: "dust-news",
    icon: "ActionSparklesIcon",
    audience: { type: "everyone" },
    requires: [{ type: "internalServer", name: "web_search_&_browse" }],
  },
  {
    id: "build-agent",
    icon: "ActionRobotIcon",
    audience: { type: "everyone" },
    requires: [
      { type: "skill", id: "conversational-building" },
      { type: "workspacePermission", verb: "create", resourceType: "agent" },
    ],
  },
  {
    id: "weekly-priorities",
    icon: "ActionListCheckIcon",
    audience: { type: "everyone" },
    requires: [],
  },
  {
    id: "workspace-usage",
    icon: "ActionPieChartIcon",
    audience: { type: "everyone" },
    requires: [{ type: "skill", id: "workspace-analytics" }],
  },
  {
    id: "create-pod",
    icon: "ActionFolderIcon",
    audience: { type: "untilMilestone", milestone: "joined_pod" },
    requires: [{ type: "skill", id: "projects" }],
  },
  {
    id: "meeting-prep",
    icon: "GcalLogo",
    audience: {
      type: "jobTypes",
      jobTypes: ["sales", "customer_success", "revops"],
    },
    requires: [{ type: "internalServer", name: "google_calendar" }],
  },
  {
    id: "account-research",
    icon: "ActionMagnifyingGlassIcon",
    audience: { type: "jobTypes", jobTypes: ["sales"] },
    requires: [{ type: "internalServer", name: "web_search_&_browse" }],
  },
  {
    id: "deep-research",
    icon: "ActionMegaphoneIcon",
    audience: { type: "jobTypes", jobTypes: ["marketing", "product"] },
    requires: [{ type: "skill", id: "go-deep" }],
  },
  {
    id: "spreadsheet-analysis",
    icon: "ActionTableIcon",
    audience: {
      type: "jobTypes",
      jobTypes: ["finance", "data", "revops", "operations", "procurement"],
    },
    requires: [{ type: "skill", id: "xlsx" }],
  },
  {
    id: "write-doc",
    icon: "ActionDocumentTextIcon",
    audience: {
      type: "jobTypes",
      jobTypes: ["people", "legal", "operations", "it"],
    },
    requires: [{ type: "skill", id: "docx" }],
  },
];
