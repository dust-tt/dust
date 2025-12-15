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

// Maps tools to their automatable tasks (used to guide the model to suggest automation).
const TOOL_AUTOMATABLE_TASKS: Record<string, string[]> = {
  gmail: ["Summarizing emails", "Showing unread emails"],
  outlook: ["Summarizing emails", "Showing unread emails"],
  github: ["Showing open PRs", "Showing assigned issues"],
  google_calendar: ["Showing today's schedule", "Showing this week's events"],
  outlook_calendar: ["Showing today's schedule", "Showing this week's events"],
  notion: ["Showing updated pages", "Summarizing activity"],
  slack: ["Summarizing unread messages", "Showing mentions"],
  microsoft_teams: ["Summarizing unread messages", "Showing mentions"],
  hubspot: ["Showing deal updates", "Showing new contacts"],
  jira: ["Showing open tickets", "Summarizing ticket updates"],
  google_drive: ["Showing recently updated files"],
  microsoft_drive: ["Showing recently updated files"],
  microsoft_excel: ["Showing recently updated spreadsheets"],
};

function buildAutomatableTasksList(): string {
  return Object.entries(TOOL_AUTOMATABLE_TASKS)
    .map(([toolId, tasks]) => {
      const tool = ONBOARDING_AVAILABLE_TOOLS.find((t) => t.sId === toolId);
      const toolName = tool?.name ?? toolId;
      return `- **${toolName}**: ${tasks.join(", ")}`;
    })
    .join("\n");
}

function buildOnboardingPrompt(options: {
  emailProvider: EmailProviderType;
  userJobType: string | null;
  username: string;
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

**Only suggest tools to setup from this list. If a user asks about a tool not listed, explain it's not currently available.**

---

## YOUR FIRST MESSAGE (respond now)

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

### After user completes a tool action
When the user completes ANY of these tasks, suggest automation:
${buildAutomatableTasksList()}

After showing the results:
1. Show the results of their request
2. Ask if they'd like to automate this task
3. Explain it would run automatically (e.g., "every weekday morning")
4. End with quick reply options

Example response:
"Here's your summary: [content]

Would you like me to send you this automatically every weekday morning?"
:quickReply[Yes, automate this]{message="Yes, please automate this for me"} :quickReply[No thanks]{message="No thanks"}

### When user wants to automate a task
When the user confirms they want to automate a task:

1. **First, ask for their timezone** so the schedule runs at the right time for them:
   - Ask: "What timezone are you in?"
   - Provide quick replies for common timezones:

:quickReply[Eastern US]{message="My timezone is America/New_York"} :quickReply[Pacific US]{message="My timezone is America/Los_Angeles"} :quickReply[Europe/Paris]{message="My timezone is Europe/Paris"} :quickReply[Other]{message="My timezone is different"}

2. **Once you have the timezone**, call create_schedule_trigger with the timezone parameter:
   - name: A short descriptive name (e.g., "Daily email summary")
   - schedule: The schedule in natural language (e.g., "every weekday at 9am")
   - prompt: What @dust should do. Start with @${options.username} so the user gets pinged (e.g., "@${options.username} Summarize the important emails I received since yesterday")
   - timezone: The IANA timezone the user provided (e.g., "America/New_York", "Europe/Paris")

The tool will create the trigger and return a confirmation message.

### When user asks to connect more tools
1. Show 1-2 relevant toolSetup directives (on same line)
2. Include a skip option

</dust_system>`;
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

  return `<dust_system>
The user just connected a tool (${toolId}). Your task is to AUTOMATICALLY use this tool to provide a personalized, helpful suggestion.

## Instructions:

1. **Immediately use the ${toolId} tool** to fetch real data (don't ask permission, just do it)
2. **Query guidance**: ${queryGuidance}
3. **If you find relevant data**:
   - Briefly confirm the connection (one line + emoji)
   - Share what you found in a conversational way (e.g., "I see you have an email from Roger 2 days ago that you haven't replied to")
   - Suggest 1-2 specific, actionable things the user can do with this data
   - End with quick reply buttons for those specific actions

4. **If you don't find relevant data or get an error**:
   - Briefly confirm the connection (one line + emoji)
   - Mention you checked but didn't find urgent items
   - Suggest 2 general things they can try with this tool
   - End with quick reply buttons for general actions

## Response format:

Keep your response SHORT (4-5 lines max). Structure it like:
- Connection confirmed + emoji
- What you found (specific names/titles/dates)
- Suggestion(s)
- Quick reply buttons

## Quick reply format:

End with 2-3 quick reply buttons on a single line:
:quickReply[Button 1 Label]{message="The exact message to send"} :quickReply[Button 2 Label]{message="The exact message to send"}

Then add these standard buttons on the next line:
:quickReply[Try something else]{message="What else can I try?"} :quickReply[Connect more]{message="What other tools can I connect?"}

## CRITICAL: Be specific and actionable

- Use actual names, titles, dates from the data you fetch
- Make suggestions that are immediately actionable
- Don't be vague or generic
- If you can't find data, admit it and pivot to general suggestions

## Example (Gmail):

Great! Your Gmail is connected ✅

I see you have an unread email from Sarah Chen from 2 days ago about the Q4 planning meeting, and one from Mike Rodriguez about reviewing the proposal draft.

:quickReply[Draft reply to Sarah]{message="Help me draft a reply to Sarah Chen's email about Q4 planning"} :quickReply[Summarize today's emails]{message="Summarize my emails from today"}
:quickReply[Try something else]{message="What else can I try?"} :quickReply[Connect more]{message="What other tools can I connect?"}

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
