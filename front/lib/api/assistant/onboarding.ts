import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  getInternalMCPServerNameFromSId,
  INTERNAL_MCP_SERVERS,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { Authenticator } from "@app/lib/auth";
import { ONBOARDING_CONVERSATION_ENABLED } from "@app/lib/onboarding";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { EmailProviderType } from "@app/lib/utils/email_provider_detection";
import type {
  APIErrorWithStatusCode,
  Result,
  UserMessageContext,
} from "@app/types";
import { Err, GLOBAL_AGENTS_SID, Ok } from "@app/types";
import type { FavoritePlatform } from "@app/types/favorite_platforms";
import { isFavoritePlatform } from "@app/types/favorite_platforms";
import type { JobType } from "@app/types/job_type";
import { asDisplayName } from "@app/types/shared/utils/string_utils";

import { createConversation, postUserMessage } from "./conversation";

function getOnboardingAvailableTools(): Array<{
  sId: string;
  name: string;
  description: string;
}> {
  return Object.entries(INTERNAL_MCP_SERVERS)
    .filter(([, server]) => {
      const { availability, isRestricted, isPreview, serverInfo } = server;

      // Only include manually connected tools.
      if (availability !== "manual") {
        return false;
      }

      // Exclude tools gated behind feature flags.
      if (isRestricted !== undefined) {
        return false;
      }

      // Exclude preview tools.
      if (isPreview) {
        return false;
      }

      // Only include tools that support personal_actions.
      const supportedUseCases: readonly string[] =
        serverInfo.authorization?.supported_use_cases ?? [];
      if (!supportedUseCases.includes("personal_actions")) {
        return false;
      }

      return true;
    })
    .map(([sId, server]) => ({
      sId,
      name: server.serverInfo.name,
      description: server.serverInfo.description,
    }));
}

const ONBOARDING_AVAILABLE_TOOLS = getOnboardingAvailableTools();

function buildAvailableToolsList(): string {
  const toolLines = ONBOARDING_AVAILABLE_TOOLS.map(
    (tool) => `- ${tool.name} (${tool.sId}) - ${tool.description}`
  ).join("\n");

  return `
Available tools for personal connection (sId in parentheses):
${toolLines}`;
}

// Maps job types (from welcome form) to their primary recommended tool.
const ROLE_TO_PRIMARY_TOOL: Partial<
  Record<JobType, InternalMCPServerNameType>
> = {
  engineering: "github",
  sales: "hubspot",
  customer_success: "hubspot",
  customer_support: "hubspot",
  product: "notion",
  design: "notion",
  marketing: "hubspot",
  data: "github",
  operations: "notion",
  finance: "notion",
  people: "notion",
  legal: "notion",
  // "other" intentionally omitted - will fall back to email-only or Notion default
};

// Builds the list of tools to suggest based on user's favorite platforms and job type.
// Returns tool sIds sorted by relevance (job-type-relevant tool first if applicable).
function getToolsForOnboarding(
  favoritePlatforms: FavoritePlatform[],
  emailProvider: EmailProviderType,
  jobType: JobType | null
): InternalMCPServerNameType[] {
  let tools: InternalMCPServerNameType[] = [...favoritePlatforms];

  // If no favorites selected, fall back to email provider + job type inference.
  if (tools.length === 0) {
    if (emailProvider === "google") {
      tools.push("gmail");
    } else if (emailProvider === "microsoft") {
      tools.push("outlook");
    }

    if (jobType) {
      const roleTool = ROLE_TO_PRIMARY_TOOL[jobType];
      if (roleTool && !tools.includes(roleTool)) {
        tools.push(roleTool);
      }
    }

    // Final fallback: suggest Notion.
    if (tools.length === 0) {
      tools.push("notion");
    }
  } else if (jobType) {
    // If we have favorites and a job type, move the most relevant tool to the front.
    const roleTool = ROLE_TO_PRIMARY_TOOL[jobType];
    if (roleTool) {
      const relevantIndex = tools.indexOf(roleTool);
      if (relevantIndex > 0) {
        const relevant = tools[relevantIndex];
        tools = [
          relevant,
          ...tools.slice(0, relevantIndex),
          ...tools.slice(relevantIndex + 1),
        ];
      }
    }
  }

  return tools;
}

function buildOnboardingPrompt(options: {
  emailProvider: EmailProviderType;
  userJobType: string | null;
  favoritePlatforms: FavoritePlatform[];
  configuredTools: InternalMCPServerNameType[];
  username: string;
}): string {
  const tools = getToolsForOnboarding(
    options.favoritePlatforms,
    options.emailProvider,
    options.userJobType as JobType | null
  );

  const topTools = tools.slice(0, 2);

  const alreadyConfiguredTopTool = topTools.find((tool) =>
    options.configuredTools.includes(tool)
  );

  const topToolSetupDirectives = topTools
    .map((sId) => `:toolSetup[Connect ${asDisplayName(sId)}]{sId=${sId}}`)
    .join(" ");

  const topToolsWithDescriptions = topTools
    .map((sId) => {
      const server = INTERNAL_MCP_SERVERS[sId];
      const description = server?.serverInfo?.description ?? "";
      return `- ${asDisplayName(sId)}: ${description}`;
    })
    .join("\n");

  let userContext = "";
  if (options.userJobType || options.favoritePlatforms.length > 0) {
    userContext = "\n## User context\n";
    if (options.userJobType) {
      userContext += `The user works in: ${options.userJobType}\n`;
    }
    if (options.favoritePlatforms.length > 0) {
      const platformNames = options.favoritePlatforms
        .map((p) => asDisplayName(p))
        .join(", ");
      userContext += `The user indicated they use these platforms: ${platformNames}\n`;
      userContext +=
        "Prioritize suggesting these tools. Guide the user through connecting them one by one.";
    }
  }

  const suggestedTopToolNames = topTools
    .map((sId) => asDisplayName(sId))
    .join(", ");

  const otherTools = tools.slice(2);
  const otherToolSetupDirectives = otherTools
    .map((sId) => `:toolSetup[Connect ${asDisplayName(sId)}]{sId=${sId}}`)
    .join(" ");

  const firstMessageSection = alreadyConfiguredTopTool
    ? buildFirstMessageWithConfiguredTool(alreadyConfiguredTopTool)
    : buildFirstMessageWithToolSetup(
        topToolsWithDescriptions,
        topToolSetupDirectives,
        suggestedTopToolNames
      );

  return `<dust_system>
You are onboarding a brand-new user to Dust.
${userContext}

## CRITICAL RULES

1. EVERY message MUST end with at least one interactive element (toolSetup or quickReply)
2. Be direct and action-focused - get to the tool connection quickly
3. You MUST NOT hallucinate:
- NEVER suggest cross-tool queries like "get answers from multiple sources"
- NEVER assume what data the user has (no "find your design docs", "search your specs", etc.)
- NEVER invent role-specific scenarios (no "as a designer, you can search design feedback...")
- ONLY suggest simple, generic tasks that work with a SINGLE tool

### Quick reply format
:quickReply[Label]{message="message to send"}
- All quick replies MUST be on a SINGLE line at the end
- 2-3 buttons maximum
- End with standard buttons on next line:
  :quickReply[Try something else]{message="What else can I try?"} :quickReply[Connect more]{message="What other tools can I connect?"}

### Response guidance
- Use actual names, titles, dates from the data you fetch
- Make suggestions that are immediately actionable
- Don't be vague or generic
- If you can't find data, admit it and pivot to general suggestions
- Keep task suggestions universal - they should work for ANY user of that tool
- When describing tools, use only their official descriptions provided below

### Quick replies must match the data found

After showing results from any tool use:
1. Present the results with specific names/titles/dates
2. Offer 2-3 **actionable quick replies based on the actual data** (e.g., "Reply to [person]", "Summarize [specific item]", "Show more about [topic]")
3. Include "Automate this" as ONE option among the actions - not the main focus

**Quick replies should be specific to what you found:**
- Found emails from Sarah and Mike → :quickReply[Draft a reply to Sarah]{...} :quickReply[Summarize Mike's email]{...}
- Found PR reviews pending → :quickReply[Show PR details]{...} :quickReply[List my open PRs]{...}
- Found Notion pages → :quickReply[Open recent page]{...} :quickReply[Search for...]{...}

**Always include automation as an option**, but as part of the action menu, not as the primary call-to-action.

## Automation flow

When user wants to automate (clicks "Automate this" or asks for it):
Call create_schedule_trigger with:
- name: Short description (e.g., "Daily email summary")
- schedule: Natural language (e.g., "every weekday at 9am")
- prompt: Start with @${options.username} so user gets pinged

## Directive reference

### Tool setup directive
:toolSetup[Button Label]{sId=toolId}

Rules:
- Maximum 2 per message
- **CRITICAL: Multiple toolSetup directives MUST be on the SAME line, separated by a space.**

## Available tools

${buildAvailableToolsList()}

**Only suggest tools to setup from this list. If a user asks about a tool not listed, explain it's not currently available.**

---

${firstMessageSection}

---

## HANDLING SUBSEQUENT MESSAGES

### When user wants to skip initial tool setup
1. Acknowledge briefly (one line)
2. List available tools by category:
   - **Email & Calendar**: Gmail, Outlook, Google Calendar, Outlook Calendar
   - **Knowledge & Docs**: Notion, Google Drive, Microsoft Drive
   - **Development**: GitHub, Jira
   - **Communication**: Slack, Microsoft Teams
   - **CRM & Spreadsheets**: HubSpot, Microsoft Excel
3. End with 2 toolSetup cards (on same line) + skip option

Example ending:
:toolSetup[Connect Notion]{sId=notion} :toolSetup[Connect Slack]{sId=slack}
:quickReply[Skip all tools]{message="I don't want to connect any tools right now"}

### When user skips ALL tools
1. Acknowledge (one line)
2. Mention Dust can still help with: web search, creating charts, answering questions
3. End with quick replies

Example ending:
:quickReply[Search the web]{message="Search the web for the latest AI news"} :quickReply[Create a chart]{message="Create a chart showing global population by country"}

### When user asks to connect more tools
Present available tools using toolSetup directives (not quick replies):

**Top priority:**
${topToolSetupDirectives}

${otherToolSetupDirectives ? `**Other available:**\n${otherToolSetupDirectives}` : ""}

### When user says they already connected a tool
If the user says they already connected a tool (e.g., "I already connected Gmail", "It's already set up", "I connected it"):
1. Acknowledge briefly (e.g., "Great!")
2. Use the toolset_listConfiguredTools tool to discover which tools are configured
3. Look for any of the suggested tools (${suggestedTopToolNames}) in the configured list
4. Once you find a matching tool, immediately use it to fetch data and show personalized suggestions
5. Follow the same flow as if the tool was just connected (confirm + show data + quick replies)

**Important:** Don't assume which specific tool they connected - use toolset_listConfiguredTools to discover it from the suggested list.

</dust_system>`;
}

function buildFirstMessageWithToolSetup(
  toolsWithDescriptions: string,
  toolSetupDirectives: string,
  suggestedToolNames: string
): string {
  return `## YOUR FIRST MESSAGE (respond now)

**Suggested tools for this user:** ${suggestedToolNames}

Recommended tools to setup for this user:
${toolsWithDescriptions}

Write a SHORT welcome message (3-4 lines max):
1. "# Welcome to Dust 👋" (or similar short greeting)
2. One sentence inviting them to connect their tools
3. Briefly mention the recommended tool(s) above
4. End with the tool setup cards and skip option

You MUST end your message EXACTLY like this:
${toolSetupDirectives}
:quickReply[Skip for now]{message="I'd like to skip connecting tools for now"}

**DO NOT:**
- Explain what Dust is at length
- List features or capabilities beyond the tools
- Invent use cases or scenarios specific to their role
- Promise cross-tool functionality
- Write more than 4 lines before the buttons`;
}

function buildFirstMessageWithConfiguredTool(
  toolId: InternalMCPServerNameType
): string {
  const toolName = asDisplayName(toolId);
  const queryGuidance =
    TOOL_TASK_SUGGESTIONS[toolId] ?? DEFAULT_AUTO_QUERY_GUIDANCE;

  return `## YOUR FIRST MESSAGE (respond now)

The user already has ${toolName} connected. **Immediately use the ${toolId} tool** to fetch real data and provide a personalized welcome.

Query guidance: ${queryGuidance}

1. Welcome the user to Dust and mention you noticed ${toolName} was already connected, so you went ahead and checked it
   (e.g., "Welcome to Dust! 👋 I noticed you already have ${toolName} connected, so I took a look...")
2. Share what you found in a conversational way (e.g., "I see you have an email from Roger 2 days ago...")
3. End with **actionable quick replies based on the actual data found** (e.g., "Draft a reply to Roger", "Summarize this email")
4. Include "Automate this" as one option among the quick replies

Example quick replies for Gmail with emails from Sarah and a Datadog digest:
:quickReply[Draft a reply to Sarah]{message="Draft a reply to Sarah's email"} :quickReply[Summarize Datadog digest]{message="Summarize the Datadog digest"} :quickReply[Automate daily summary]{message="Send me a daily email summary every morning"}

If you don't find relevant data:
- Still welcome the user and mention the tool is connected
- Suggest 2 general things they can try with actionable quick replies
- Include automation as one option`;
}

// Tool-specific task suggestions for the follow-up prompt after connecting a tool.
// These are intentionally generic and don't assume what data the user has.
const TOOL_TASK_SUGGESTIONS: Record<string, string> = {
  gmail: `Example quick replies:
:quickReply[Summarize today's emails]{message="Summarize the emails I received today"} :quickReply[Show unread emails]{message="Show my unread emails from today"}`,
  outlook: `Example quick replies:
:quickReply[Summarize today's emails]{message="Summarize the emails I received today"} :quickReply[Show unread emails]{message="Show my unread emails from today"}`,
  github: `Automatically check for recent notifications, open pull requests, or issues assigned to the user. Present 1-2 specific examples with repo names and brief context.`,
  notion: `Example quick replies:
:quickReply[Pages updated today]{message="Show Notion pages updated today"} :quickReply[Recent activity]{message="Summarize recent activity in Notion"}`,
  slack: `Example quick replies:
:quickReply[Unread summary]{message="Summarize my unread Slack messages"} :quickReply[Today's mentions]{message="Show Slack mentions from today"}`,
  hubspot: `Example quick replies:
:quickReply[Deals updated today]{message="Show deals updated today"} :quickReply[New contacts]{message="Show new contacts from this week"}`,
  jira: `Example quick replies:
:quickReply[My open tickets]{message="Show my open Jira tickets"} :quickReply[Ticket updates]{message="Summarize updates on my Jira tickets"}`,
  google_drive: `Example quick replies:
:quickReply[Files updated today]{message="Show files updated today in Google Drive"} :quickReply[Recent changes]{message="Summarize recent changes in Google Drive"}`,
  microsoft_drive: `Example quick replies:
:quickReply[Files updated today]{message="Show files updated today in OneDrive"} :quickReply[Recent changes]{message="Summarize recent changes in OneDrive"}`,
  google_calendar: `Example quick replies:
:quickReply[Today's schedule]{message="What's on my calendar today?"} :quickReply[This week]{message="Show my schedule for this week"}`,
  outlook_calendar: `Example quick replies:
:quickReply[Today's schedule]{message="What's on my calendar today?"} :quickReply[This week]{message="Show my schedule for this week"}`,
  microsoft_teams: `Example quick replies:
:quickReply[Unread summary]{message="Summarize my unread Teams messages"} :quickReply[Today's mentions]{message="Show Teams mentions from today"}`,
  microsoft_excel: `Example quick replies:
:quickReply[Recent spreadsheets]{message="Show recently updated Excel files"} :quickReply[Changes this week]{message="Summarize changes to my Excel files this week"}`,
};

const DEFAULT_AUTO_QUERY_GUIDANCE = `Automatically explore this tool to see what data is available. Present 1-2 specific examples of what you found.`;

export function buildOnboardingFollowUpPrompt(toolId: string): string {
  const queryGuidance =
    TOOL_TASK_SUGGESTIONS[toolId] ?? DEFAULT_AUTO_QUERY_GUIDANCE;
  const toolName = asDisplayName(toolId);

  return `<dust_system>
The user just connected ${toolName}.

**Immediately use the ${toolId} tool** to fetch real data and show personalized suggestions.

Query guidance: ${queryGuidance}

Briefly confirm the connection (one line + emoji), share what you found, end with **actionable quick replies based on the data** (include automation as one option).
</dust_system>`;
}

export async function createOnboardingConversationIfNeeded(
  auth: Authenticator,
  { force }: { force?: boolean } = { force: false }
): Promise<Result<string | null, APIErrorWithStatusCode>> {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();

  if (!owner || !subscription || !user) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Cannot create onboarding conversation without workspace, user and subscription.",
      },
    });
  }

  if (!force && !ONBOARDING_CONVERSATION_ENABLED) {
    return new Ok(null);
  }

  // Only create onboarding conversation for brand-new workspaces (only one member,
  // no conversations) unless force flag is set.
  if (!force) {
    const existingMetadata = await user.getMetadata("onboarding:conversation");

    if (existingMetadata?.value) {
      // User already has an onboarding conversation.
      return new Ok(null);
    }

    const { total: membersTotal } =
      await MembershipResource.getMembershipsForWorkspace({
        workspace: owner,
      });

    if (membersTotal > 1) {
      return new Ok(null);
    }

    const conversationsCount =
      await ConversationResource.countForWorkspace(auth);

    if (conversationsCount > 0) {
      return new Ok(null);
    }
  }

  const userJson = user.toJSON();

  const workspaceMetadataPrefix = `workspace:${owner.sId}:`;

  // Email provider is user-scoped (same email across all workspaces).
  const emailProviderMetadata = await user.getMetadata(
    "onboarding:email_provider"
  );
  let emailProvider: EmailProviderType = "other";
  if (
    emailProviderMetadata?.value &&
    (emailProviderMetadata.value === "google" ||
      emailProviderMetadata.value === "microsoft" ||
      emailProviderMetadata.value === "other")
  ) {
    emailProvider = emailProviderMetadata.value;
  }

  // Job type is user-scoped (not workspace-specific).
  const jobTypeMetadata = await user.getMetadata("job_type");
  const userJobType = jobTypeMetadata?.value ?? null;

  // Favorite platforms is workspace-scoped.
  const favoritePlatformsMetadata = await user.getMetadata(
    `${workspaceMetadataPrefix}favorite_platforms`
  );

  let favoritePlatforms: FavoritePlatform[] = [];
  if (favoritePlatformsMetadata?.value) {
    const parsed: unknown = JSON.parse(favoritePlatformsMetadata.value);
    if (
      Array.isArray(parsed) &&
      parsed.every((p) => typeof p === "string" && isFavoritePlatform(p))
    ) {
      favoritePlatforms = parsed;
    }
  }

  // Check for tools with views in the global space (matches what UI considers "configured")
  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
  const globalSpaceViews = await MCPServerViewResource.listBySpace(
    auth,
    globalSpace
  );
  const configuredTools = globalSpaceViews
    .map((v) => getInternalMCPServerNameFromSId(v.internalMCPServerId))
    .filter((name): name is InternalMCPServerNameType => name !== null);

  const conversation = await createConversation(auth, {
    title: "Welcome to Dust",
    visibility: "unlisted",
    spaceId: null,
  });

  const onboardingSystemMessage = buildOnboardingPrompt({
    emailProvider,
    userJobType,
    favoritePlatforms,
    configuredTools,
    username: userJson.username,
  });

  const context: UserMessageContext = {
    username: userJson.username,
    fullName: userJson.fullName,
    email: userJson.email,
    profilePictureUrl: userJson.image,
    // UTC is used since this runs server-side and we don't have access to user's timezone.
    timezone: "UTC",
    origin: "onboarding_conversation",
  };

  const postRes = await postUserMessage(auth, {
    conversation,
    content: onboardingSystemMessage,
    mentions: [
      {
        configurationId: GLOBAL_AGENTS_SID.DUST,
      },
    ],
    context,
    skipToolsValidation: false,
  });

  if (postRes.isErr()) {
    return postRes;
  }

  await user.setMetadata("onboarding:conversation", conversation.sId);

  return new Ok(conversation.sId);
}
