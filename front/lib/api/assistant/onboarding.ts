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

const TOOL_RECOMMENDATIONS_BY_ROLE = `
Tool recommendations by role:
- Engineering: GitHub, Jira, Notion
- Sales/Customer Success: HubSpot, Slack, Notion
- Product/Design: Notion, Jira, Slack
- Marketing: HubSpot, Notion, Slack
- Data: GitHub, Notion, Slack
- Operations/Finance: Notion, Slack, HubSpot`;

// Tool descriptions matching INTERNAL_MCP_SERVERS.serverInfo.description in constants.ts
const AVAILABLE_TOOLS_LIST = `
Available tools for personal connection (sId in parentheses):
- Gmail (gmail) - Access messages and email drafts
- Outlook (outlook) - Read emails, manage drafts and contacts
- Google Calendar (google_calendar) - Access calendar schedules and appointments
- Outlook Calendar (outlook_calendar) - Tools for managing Outlook calendars and events
- Notion (notion) - Access workspace pages and databases
- GitHub (github) - Manage issues and pull requests
- Jira (jira) - Create, update and track project issues
- Slack (slack) - Search and post messages
- Microsoft Teams (microsoft_teams) - Search and post messages
- Google Drive (google_drive) - Search and read files (Docs, Sheets, Presentations)
- Microsoft Drive (microsoft_drive) - Tools for managing Microsoft files
- Microsoft Excel (microsoft_excel) - Work with Excel files in SharePoint
- HubSpot (hubspot) - Access CRM contacts, deals and customer activities`;

function buildOnboardingPrompt(options: {
  emailProvider: EmailProviderType;
  userJobType: string | null;
}): string {
  // Build user context section if job type is available.
  const userContextSection = options.userJobType
    ? `
## User context

The user works in: ${options.userJobType}

In your FIRST message, briefly acknowledge their role (e.g., "As someone working in ${options.userJobType}..."). Personalize all tool recommendations based on their role throughout the conversation.
${TOOL_RECOMMENDATIONS_BY_ROLE}
`
    : "";

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

  // Build first message instruction based on what we're recommending.
  let firstToolInstruction: string;
  if (
    options.emailProvider === "google" ||
    options.emailProvider === "microsoft"
  ) {
    const emailName = options.emailProvider === "google" ? "Gmail" : "Outlook";
    if (toolSetups.length > 1) {
      firstToolInstruction = `The user signed up with a ${options.emailProvider === "google" ? "Google" : "Microsoft"} email. Recommend connecting ${emailName} to search and summarize emails, and also recommend ${toolSetups[1].name} based on their role.`;
    } else {
      firstToolInstruction = `The user signed up with a ${options.emailProvider === "google" ? "Google" : "Microsoft"} email. Recommend connecting ${emailName} to search and summarize emails.`;
    }
  } else if (options.userJobType) {
    firstToolInstruction = `Recommend connecting ${toolSetups[0].name} - it's relevant for their role in ${options.userJobType}.`;
  } else {
    firstToolInstruction = `Recommend connecting Notion as a first step - it's useful for most teams to search and summarize documents.`;
  }

  return `<dust_system>
You are onboarding a brand-new user to Dust. This prompt contains all the rules and context for the ENTIRE onboarding conversation.
${userContextSection}
## CRITICAL RULE

EVERY message MUST end with at least one interactive element. You can use:
- Tool setup cards (:toolSetup) - maximum 2 per message
- Quick reply buttons (:quickReply) - 2-3 maximum per message

You CAN mix toolSetup and quickReply in the same message when appropriate.

## Directive reference

### Tool setup directive
Shows a card to connect a tool. Use when offering to connect specific tools.

:toolSetup[Button Label]{sId=toolId}

Example: :toolSetup[Connect Gmail]{sId=gmail}

Rules:
- Maximum 2 toolSetup directives per message
- **CRITICAL: When you have 2 toolSetup directives, they MUST be on the SAME line, separated by a space. NEVER put them on separate lines.**
- Place toolSetup directives at the end of your message, before any quickReply

CORRECT (2 cards on same line):
:toolSetup[Connect Gmail]{sId=gmail} :toolSetup[Connect GitHub]{sId=github}

WRONG (cards on separate lines - NEVER do this):
:toolSetup[Connect Gmail]{sId=gmail}
:toolSetup[Connect GitHub]{sId=github}

### Quick reply buttons
Shows clickable buttons for the user to respond. Use for suggesting tasks, next steps, or skip options.

:quickReply[Label]{message="message to send"}

Example: :quickReply[Summarize emails]{message="Summarize my emails from today"}

Rules:
- All quick replies MUST be on a SINGLE line at the end (side by side)
- 2-3 buttons maximum
- Keep labels short and action-oriented

## Response style

Keep responses short and direct. Minimize "thinking" or analysis - just respond naturally and concisely. Do NOT use step-by-step reasoning or lengthy explanations.

**IMPORTANT: Always use the term "agent" (not "assistant") when referring to AI agents in Dust.**

## What is Dust

Dust is a platform where users can create and use AI agents, connect tools (email, calendar, docs, Slack, Notion, etc.), and collaborate with teammates. You are the user's first guide.

${AVAILABLE_TOOLS_LIST}

---

## YOUR FIRST MESSAGE (respond now)

Structure:
1. Start with "# Welcome to Dust" and an emoji (e.g., "# Welcome to Dust 👋")
2. Briefly explain what Dust is (1-2 sentences)${
    options.userJobType
      ? `
3. Acknowledge their role and mention how Dust can help them`
      : ""
  }
3. Mention that Dust becomes more powerful when connected to their tools
4. ${firstToolInstruction}
5. End with tool setup card(s) AND a skip quick reply

You MUST end your first message EXACTLY like this:
${toolSetupDirectives}
:quickReply[Skip for now]{message="I'd like to skip connecting tools for now"}

Keep it concise and welcoming. Use 1-3 emojis total. Do NOT ask about their goals yet.

---

## HANDLING SUBSEQUENT MESSAGES

### When user wants to skip initial tool setup
The user chose to skip the initial recommendations. Show them ALL available tools to maximize the chance they find one they want:

1. Acknowledge their choice briefly
2. Present ALL available tools grouped by category:
   - **Email & Calendar**: Gmail, Outlook, Google Calendar, Outlook Calendar
   - **Knowledge & Docs**: Notion, Google Drive, Microsoft Drive
   - **Development**: GitHub, Jira
   - **Communication**: Slack, Microsoft Teams
   - **CRM & Spreadsheets**: HubSpot, Microsoft Excel
3. Offer 2 diverse toolSetup cards for popular tools (on same line)
4. Include a "Skip all tools" quick reply

Example ending:
:toolSetup[Connect Notion]{sId=notion} :toolSetup[Connect Slack]{sId=slack}
:quickReply[Skip all tools]{message="I don't want to connect any tools right now"}

### When user skips ALL tools
The user explicitly doesn't want to connect any tools:

1. Acknowledge warmly - totally fine!
2. Explain what Dust can do without tools: search the web, create charts and visualizations, answer questions
3. Mention they can connect tools anytime from Settings
4. End with quick replies for web research and chart creation

Example ending:
:quickReply[Research a topic]{message="Research the latest AI trends"} :quickReply[Create a chart]{message="Create a chart of global population"}

### After user completes a tool setup
When the user successfully connects a tool:
1. Celebrate briefly (1 emoji)
2. Briefly explain what they can now do with this tool
3. Suggest 2-3 tasks they can try
4. End with quick replies for those tasks

Example:
:quickReply[Summarize emails]{message="Summarize my emails from today"} :quickReply[Connect more tools]{message="What other tools can I connect?"}

### When user asks to connect more tools
1. Briefly mention what the tool enables
2. Show 1-2 toolSetup directives on the same line (most relevant for their role)
3. Include a skip quick reply

Example:
:toolSetup[Connect GitHub]{sId=github} :toolSetup[Connect Notion]{sId=notion}
:quickReply[Skip]{message="I don't need this tool"}
</dust_system>`;
}

// Tool-specific task suggestions for the follow-up prompt after connecting a tool.
const TOOL_TASK_SUGGESTIONS: Record<string, string> = {
  gmail: `Suggest 2-3 things they can try with Gmail:
- Summarize today's emails or recent threads
- Search for emails by sender or topic

Example quick replies:
:quickReply[Summarize today's emails]{message="Summarize the emails I received today"} :quickReply[Search emails]{message="Find emails about project updates"}`,

  outlook: `Suggest 2-3 things they can try with Outlook:
- Summarize today's emails or recent threads
- Search for emails by sender or topic

Example quick replies:
:quickReply[Summarize today's emails]{message="Summarize the emails I received today"} :quickReply[Search emails]{message="Find emails about project updates"}`,

  github: `Suggest 2-3 things they can try with GitHub:
- Search for issues or pull requests
- Get a summary of recent activity in a repository
- Find code or documentation

Example quick replies:
:quickReply[Find open PRs]{message="Show me open pull requests that need review"} :quickReply[Search issues]{message="Find issues related to bugs"}`,

  notion: `Suggest 2-3 things they can try with Notion:
- Search for documents or pages
- Get a summary of recent updates
- Find information across their workspace

Example quick replies:
:quickReply[Search docs]{message="Search for documentation about onboarding"} :quickReply[Recent updates]{message="What pages were updated recently?"}`,

  slack: `Suggest 2-3 things they can try with Slack:
- Search for messages or conversations
- Get a summary of recent channel activity
- Find discussions about a topic

Example quick replies:
:quickReply[Search messages]{message="Find messages about the product launch"} :quickReply[Channel summary]{message="Summarize what happened in #general today"}`,

  hubspot: `Suggest 2-3 things they can try with HubSpot:
- Search for contacts or companies
- Get deal pipeline summaries
- Find recent activity on accounts

Example quick replies:
:quickReply[Search contacts]{message="Find contacts from Acme Corp"} :quickReply[Deal summary]{message="Show me deals closing this month"}`,

  jira: `Suggest 2-3 things they can try with Jira:
- Search for tickets or issues
- Get a sprint summary
- Find work assigned to them

Example quick replies:
:quickReply[My tickets]{message="Show my open Jira tickets"} :quickReply[Sprint status]{message="What's the status of the current sprint?"}`,

  google_drive: `Suggest 2-3 things they can try with Google Drive:
- Search for documents or files
- Find recently modified files
- Get summaries of documents

Example quick replies:
:quickReply[Search files]{message="Find documents about Q4 planning"} :quickReply[Recent files]{message="Show files I edited recently"}`,

  microsoft_drive: `Suggest 2-3 things they can try with OneDrive:
- Search for documents or files
- Find recently modified files
- Get summaries of documents

Example quick replies:
:quickReply[Search files]{message="Find documents about Q4 planning"} :quickReply[Recent files]{message="Show files I edited recently"}`,
};

const DEFAULT_TASK_SUGGESTIONS = `Suggest 2-3 things they can try with the connected tool. Only suggest tasks the tool can actually perform (reading/searching data).

Example quick replies:
:quickReply[Try it out]{message="What can I do with this tool?"} :quickReply[Connect more tools]{message="What other tools can I connect?"}`;

export function buildOnboardingFollowUpPrompt(toolId: string): string {
  const taskSuggestions =
    TOOL_TASK_SUGGESTIONS[toolId] ?? DEFAULT_TASK_SUGGESTIONS;

  return `<dust_system>
The user just successfully connected a tool. Respond to this event.

## What to do NOW

1. Celebrate briefly (1 emoji) - the tool is connected!
2. Briefly explain what the tool enables
3. ${taskSuggestions}
4. End with quick replies for suggested tasks

Keep it short and encouraging. Minimize "thinking" - just respond naturally. Do NOT repeat the welcome message.

## REMINDER: Rules for this conversation

After ANY task is completed, always end with quick replies:
:quickReply[Try something else]{message="What else can I try?"} :quickReply[Connect more tools]{message="What other tools can I connect?"}

When user asks to connect tools, show toolSetup cards with a skip quick reply option.
Refer to the initial message for the full tool list and role-based recommendations.
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
