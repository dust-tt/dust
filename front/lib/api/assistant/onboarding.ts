import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
import type { Authenticator } from "@app/lib/auth";
import { ONBOARDING_CONVERSATION_ENABLED } from "@app/lib/onboarding";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { EmailProviderType } from "@app/lib/utils/email_provider_detection";
import { detectEmailProvider } from "@app/lib/utils/email_provider_detection";
import type {
  APIErrorWithStatusCode,
  Result,
  UserMessageContext,
} from "@app/types";
import { Err, GLOBAL_AGENTS_SID, Ok } from "@app/types";
import type { JobType } from "@app/types/job_type";

import { createConversation, postUserMessage } from "./conversation";

// Build the list of tools available for personal connection during onboarding.
// These are tools that:
// - Are manually connected (not auto-enabled)
// - Support personal_actions use case
// - Are not gated behind a feature flag
// - Are not in preview
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

// Cached list of available tools for onboarding prompts.
const ONBOARDING_AVAILABLE_TOOLS = getOnboardingAvailableTools();

// Generate the available tools list for the prompt.
function buildAvailableToolsList(): string {
  const toolLines = ONBOARDING_AVAILABLE_TOOLS.map(
    (tool) => `- ${tool.name} (${tool.sId}) - ${tool.description}`
  ).join("\n");

  return `
Available tools for personal connection (sId in parentheses):
${toolLines}`;
}

// Generate a comma-separated list of tool names for the follow-up prompt.
function buildToolNamesList(): string {
  return ONBOARDING_AVAILABLE_TOOLS.map((tool) => tool.name).join(", ");
}

// Maps job types (from welcome form) to their primary recommended tool.
const ROLE_TO_PRIMARY_TOOL: Partial<
  Record<JobType, { sId: string; name: string }>
> = {
  engineering: { sId: "github", name: "GitHub" },
  sales: { sId: "hubspot", name: "HubSpot" },
  customer_success: { sId: "hubspot", name: "HubSpot" },
  customer_support: { sId: "hubspot", name: "HubSpot" },
  product: { sId: "notion", name: "Notion" },
  design: { sId: "notion", name: "Notion" },
  marketing: { sId: "hubspot", name: "HubSpot" },
  data: { sId: "github", name: "GitHub" },
  operations: { sId: "notion", name: "Notion" },
  finance: { sId: "notion", name: "Notion" },
  people: { sId: "notion", name: "Notion" },
  legal: { sId: "notion", name: "Notion" },
  // "other" intentionally omitted - will fall back to email-only or Notion default
};

function buildOnboardingPrompt(options: {
  emailProvider: EmailProviderType;
  userJobType: string | null;
}): string {
  // Determine which tools to show in the first message.
  const toolSetups: Array<{ sId: string; name: string }> = [];

  // Add email tool if provider is detected.
  if (options.emailProvider === "google") {
    toolSetups.push({ sId: "gmail", name: "Gmail" });
  } else if (options.emailProvider === "microsoft") {
    toolSetups.push({ sId: "outlook", name: "Outlook" });
  }

  // Add role-based tool if job type is available (avoid duplicates).
  if (options.userJobType) {
    const roleTool = ROLE_TO_PRIMARY_TOOL[options.userJobType as JobType];
    if (roleTool && !toolSetups.some((t) => t.sId === roleTool.sId)) {
      toolSetups.push(roleTool);
    }
  }

  // Fallback: if no tools determined, suggest Notion.
  if (toolSetups.length === 0) {
    toolSetups.push({ sId: "notion", name: "Notion" });
  }

  // Build the tool setup directives for the first message (on same line).
  const toolSetupDirectives = toolSetups
    .map((t) => `:toolSetup[Connect ${t.name}]{sId=${t.sId}}`)
    .join(" ");

  // Build tool list with descriptions from INTERNAL_MCP_SERVERS.
  const toolsWithDescriptions = toolSetups
    .map((t) => {
      const server =
        INTERNAL_MCP_SERVERS[t.sId as keyof typeof INTERNAL_MCP_SERVERS];
      const description = server?.serverInfo?.description ?? "";
      return `- ${t.name}: ${description}`;
    })
    .join("\n");

  // Build context about user's role if available.
  const roleContext = options.userJobType
    ? `\n## User context\nThe user works in: ${options.userJobType}\nThe tools below were selected as relevant for their role.`
    : "";

  return `<dust_system>
You are onboarding a brand-new user to Dust.
${roleContext}

## CRITICAL RULES

1. EVERY message MUST end with at least one interactive element (toolSetup or quickReply)
2. Keep messages SHORT - 3-4 lines maximum for the first message
3. Be direct and action-focused - get to the tool connection quickly

## CRITICAL: Do not hallucinate use cases

- NEVER suggest cross-tool queries like "get answers from multiple sources" or "search across X and Y"
- NEVER assume what data the user has (no "find your design docs", "search your specs", "find feedback on the checkout redesign", etc.)
- NEVER invent role-specific scenarios (no "as a designer, you can search design feedback...")
- ONLY suggest simple, generic tasks that work with a SINGLE tool (e.g., "search your emails", "find a page in Notion")
- Keep task suggestions universal - they should work for ANY user of that tool
- When describing tools, use only their official descriptions provided below

## Directive reference

### Tool setup directive
:toolSetup[Button Label]{sId=toolId}

Rules:
- Maximum 2 per message
- **CRITICAL: Multiple toolSetup directives MUST be on the SAME line, separated by a space.**

### Quick reply buttons
:quickReply[Label]{message="message to send"}

Rules:
- All quick replies MUST be on a SINGLE line at the end
- 2-3 buttons maximum

## Available tools

${buildAvailableToolsList()}

**Only suggest tools from this list. If a user asks about a tool not listed, explain it's not currently available.**

---

## YOUR FIRST MESSAGE (respond now)

Recommended tools for this user:
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
- Write more than 4 lines before the buttons

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

### After user completes a tool setup
1. Confirm briefly (one line + emoji)
2. Suggest 1-2 simple tasks they can try RIGHT NOW with that specific tool
3. End with quick replies for those tasks

### When user asks to connect more tools
1. Show 1-2 relevant toolSetup directives (on same line)
2. Include a skip option

</dust_system>`;
}

// Tool-specific task suggestions for the follow-up prompt after connecting a tool.
// These are intentionally generic and don't assume what data the user has.
const TOOL_TASK_SUGGESTIONS: Record<string, string> = {
  gmail: `Example quick replies:
:quickReply[Summarize today's emails]{message="Summarize the emails I received today"} :quickReply[Search emails]{message="Search my emails for messages from last week"}`,

  outlook: `Example quick replies:
:quickReply[Summarize today's emails]{message="Summarize the emails I received today"} :quickReply[Search emails]{message="Search my emails for messages from last week"}`,

  github: `Example quick replies:
:quickReply[My open PRs]{message="Show my open pull requests"} :quickReply[My issues]{message="Show issues assigned to me"}`,

  notion: `Example quick replies:
:quickReply[Search pages]{message="Search for a page in Notion"} :quickReply[Recent pages]{message="Show recently updated pages"}`,

  slack: `Example quick replies:
:quickReply[Search messages]{message="Search my Slack messages"} :quickReply[Recent messages]{message="Show my recent Slack messages"}`,

  hubspot: `Example quick replies:
:quickReply[Search contacts]{message="Search for a contact in HubSpot"} :quickReply[Recent deals]{message="Show recent deals"}`,

  jira: `Example quick replies:
:quickReply[My tickets]{message="Show my open Jira tickets"} :quickReply[Search tickets]{message="Search for a Jira ticket"}`,

  google_drive: `Example quick replies:
:quickReply[Search files]{message="Search for a file in Google Drive"} :quickReply[Recent files]{message="Show my recently modified files"}`,

  microsoft_drive: `Example quick replies:
:quickReply[Search files]{message="Search for a file in OneDrive"} :quickReply[Recent files]{message="Show my recently modified files"}`,

  google_calendar: `Example quick replies:
:quickReply[Today's events]{message="What's on my calendar today?"} :quickReply[This week]{message="Show my schedule for this week"}`,

  outlook_calendar: `Example quick replies:
:quickReply[Today's events]{message="What's on my calendar today?"} :quickReply[This week]{message="Show my schedule for this week"}`,

  microsoft_teams: `Example quick replies:
:quickReply[Search messages]{message="Search my Teams messages"} :quickReply[Recent messages]{message="Show my recent Teams messages"}`,

  microsoft_excel: `Example quick replies:
:quickReply[List files]{message="List my Excel files"} :quickReply[Open a file]{message="Help me find an Excel file"}`,
};

const DEFAULT_TASK_SUGGESTIONS = `Example quick replies:
:quickReply[Try it out]{message="What can I do with this tool?"} :quickReply[Connect more]{message="What other tools can I connect?"}`;

export function buildOnboardingFollowUpPrompt(toolId: string): string {
  const taskSuggestions =
    TOOL_TASK_SUGGESTIONS[toolId] ?? DEFAULT_TASK_SUGGESTIONS;

  return `<dust_system>
The user just connected a tool. Respond briefly.

## What to do NOW

1. Confirm the connection (one line + emoji)
2. Suggest trying it with the quick replies below

${taskSuggestions}

## CRITICAL: Do not hallucinate use cases

- NEVER assume what data the user has
- NEVER suggest specific searches like "find the Q4 report" or "search for project updates"
- ONLY use the generic quick replies provided above
- Keep your message to 2-3 lines maximum

## Rules

- Only suggest these tools: ${buildToolNamesList()}
- After tasks, end with: :quickReply[Try something else]{message="What else can I try?"} :quickReply[Connect more]{message="What other tools can I connect?"}
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

  // Detect the user's email provider (Google, Microsoft, or other).
  const userJson = user.toJSON();
  const emailProvider = await detectEmailProvider(
    userJson.email,
    `user-${userJson.sId}`
  );

  // Store the detection result as user metadata for future reference.
  await user.setMetadata("onboarding:email_provider", emailProvider);

  // Fetch the user's job type for personalization.
  const jobTypeMetadata = await user.getMetadata("job_type");
  const userJobType = jobTypeMetadata?.value ?? null;

  const conversation = await createConversation(auth, {
    title: "Welcome to Dust",
    visibility: "unlisted",
    spaceId: null,
  });

  const onboardingSystemMessage = buildOnboardingPrompt({
    emailProvider,
    userJobType,
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
