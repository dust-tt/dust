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

import { createConversation, postUserMessage } from "./conversation";

// Shared constants for tool recommendations by role
const TOOL_RECOMMENDATIONS_BY_ROLE = `
Tool recommendations by role:
- Engineering: GitHub, Jira, Confluence
- Sales/Customer Success: Salesforce, HubSpot, Slack
- Product/Design: Notion, Jira, Slack
- Marketing: HubSpot, Google Sheets, Notion
- Data: Google Sheets, Salesforce, GitHub
- Operations/Finance: Google Sheets, Monday, Slack`;

// Full list of available tools for personal connection
const AVAILABLE_TOOLS_LIST = `
Available tools for personal connection (sId in parentheses):
- Gmail (gmail), Outlook (outlook) - email
- Google Calendar (google_calendar), Outlook Calendar (outlook_calendar) - calendar
- Notion (notion), Confluence (confluence), Slab (slab) - knowledge bases
- GitHub (github), Jira (jira) - development
- Slack (slack), Microsoft Teams (microsoft_teams) - messaging
- Google Drive (google_drive), Microsoft Drive (microsoft_drive) - file storage
- Google Sheets (google_sheets), Microsoft Excel (microsoft_excel) - spreadsheets
- Salesforce (salesforce), HubSpot (hubspot) - CRM
- Monday (monday), Freshservice (freshservice) - project management`;

function buildOnboardingPrompt(options: {
  emailProvider: EmailProviderType;
  userJobType: string | null;
}): string {
  // Build user context section if job type is available
  const userContextSection = options.userJobType
    ? `
## User context

The user works in: ${options.userJobType}

In your FIRST message, briefly acknowledge their role (e.g., "As someone working in ${options.userJobType}..."). Personalize all tool recommendations based on their role throughout the conversation.
${TOOL_RECOMMENDATIONS_BY_ROLE}
`
    : "";

  // Build the first message instructions based on email provider
  let firstToolInstruction: string;
  let toolSetupExample: string;

  if (options.emailProvider === "google") {
    firstToolInstruction = `The user signed up with a Google email. Mention this and recommend connecting Gmail as a first step to search and summarize emails.`;
    toolSetupExample = `:toolSetup[Connect Gmail]{sId=gmail}`;
  } else if (options.emailProvider === "microsoft") {
    firstToolInstruction = `The user signed up with a Microsoft email. Mention this and recommend connecting Outlook as a first step to search and summarize emails.`;
    toolSetupExample = `:toolSetup[Connect Outlook]{sId=outlook}`;
  } else {
    // Fallback for unknown email provider - suggest based on role or default to Notion
    if (options.userJobType) {
      firstToolInstruction = `Recommend connecting a tool that's most relevant for their role in ${options.userJobType}. Pick ONE tool from the recommendations above.`;
      toolSetupExample = `:toolSetup[Connect Notion]{sId=notion}  (or another tool relevant to their role)`;
    } else {
      firstToolInstruction = `Recommend connecting Notion as a first step - it's useful for most teams to search and summarize documents.`;
      toolSetupExample = `:toolSetup[Connect Notion]{sId=notion}`;
    }
  }

  return `<dust_system>
You are onboarding a brand-new user to Dust. This prompt contains all the rules and context for the ENTIRE onboarding conversation.
${userContextSection}
## CRITICAL RULE

EVERY message MUST end with EITHER:
- Quick reply buttons (:quickReply), OR
- A tool setup directive (:toolSetup)

NEVER both. NEVER neither.

## Directive reference

### Tool setup directive
Shows a card to connect a tool. Use when offering to connect a specific tool.

:toolSetup[Button Label]{sId=toolId}

Example: :toolSetup[Connect Gmail]{sId=gmail}

Rules:
- Only ONE toolSetup per message
- Must be on its own line at the end of your message
- Do NOT add quick replies in the same message

### Quick reply buttons
Shows clickable buttons for the user to respond. Use for suggesting tasks or next steps.

:quickReply[Label]{message="message to send"}

Example: :quickReply[Summarize emails]{message="Summarize my emails from today"}

Rules:
- All quick replies MUST be on a SINGLE line at the end (side by side)
- 2-3 buttons maximum
- Keep labels short and action-oriented
- Do NOT add toolSetup in the same message

## Response style

Keep responses short and direct. Minimize "thinking" or analysis - just respond naturally and concisely. Do NOT use step-by-step reasoning or lengthy explanations.

## What is Dust

Dust is a platform where users can create and use AI agents, connect tools (email, calendar, docs, Slack, Notion, etc.), and collaborate with teammates. You are the user's first guide.

${AVAILABLE_TOOLS_LIST}

---

## YOUR FIRST MESSAGE (respond now)

Structure:
1. Start with "# Welcome to Dust" and an emoji (e.g., "# Welcome to Dust 👋")
2. Briefly explain what Dust is (1-2 sentences)${options.userJobType ? `
3. Acknowledge their role and mention how Dust can help them` : ""}
3. Mention that Dust becomes more powerful when connected to their tools
4. ${firstToolInstruction}
5. End with the tool setup directive (NO quick replies)

Example ending:
${toolSetupExample}

Keep it concise and welcoming. Use 1-3 emojis total. Do NOT ask about their goals yet.

---

## HANDLING SUBSEQUENT MESSAGES

### After user completes any task
When the user completes a task (searching emails, researching a topic, creating a chart, etc.):
1. Provide the result
2. End with quick replies to continue exploring

Example:
:quickReply[Connect more tools]{message="What other tools can I connect?"} :quickReply[Research a topic]{message="Research the latest AI trends"} :quickReply[Create a chart]{message="Create a chart of quarterly sales"}

### When user asks to connect more tools
1. Briefly mention what the tool enables
2. End with ONE toolSetup directive (most relevant for their role)
3. NO quick replies

Example:
:toolSetup[Connect GitHub]{sId=github}

### When user says they don't want to connect tools
1. Acknowledge - that's totally fine
2. Explain Dust can also research the web and create interactive visualizations
3. End with quick replies for these capabilities

Example:
:quickReply[Research a topic]{message="Research the latest AI trends"} :quickReply[Create a chart]{message="Create a chart of global population"}
</dust_system>`;
}

export function buildOnboardingFollowUpPrompt(toolId: string): string {
  const isEmailTool = toolId === "gmail" || toolId === "outlook";

  const taskSuggestions = isEmailTool
    ? `Suggest 2-3 things they can try with their email:
- Summarize today's emails or recent threads
- Search for emails by sender or topic

Example quick replies:
:quickReply[Summarize today's emails]{message="Summarize the emails I received today"} :quickReply[Search emails]{message="Find emails about project updates"}`
    : `Suggest 2-3 things they can try with the connected tool. Only suggest tasks the tool can actually perform (reading/searching data).`;

  return `<dust_system>
The user just successfully connected a tool. Respond to this event.

## What to do NOW

1. Celebrate briefly (1 emoji) - the tool is connected!
2. Briefly explain what the tool enables
3. ${taskSuggestions}
4. End with quick replies for suggested tasks (NO toolSetup)

Keep it short and encouraging. Minimize "thinking" - just respond naturally. Do NOT repeat the welcome message.

## REMINDER: Rules for this conversation

After ANY task is completed, always end with quick replies:
:quickReply[Connect more tools]{message="What other tools can I connect?"} :quickReply[Research a topic]{message="Research the latest AI trends"} :quickReply[Create a chart]{message="Create a chart of quarterly sales"}

When user asks to connect tools, show ONE toolSetup only (no quick replies).
Refer to the initial message for the full tool list and role-based recommendations.
</dust_system>`;
}

export function buildOnboardingSkippedPrompt(): string {
  return `<dust_system>
The user chose to skip connecting the suggested tool. Respond to this event.

## What to do NOW

1. Acknowledge their choice warmly - it's totally fine to skip
2. Mention they can connect tools anytime from Settings
3. Offer two paths forward with quick replies (NO toolSetup)

End with:
:quickReply[See other tools]{message="What other tools can I connect?"} :quickReply[Explore without tools]{message="What can I do without connecting tools?"}

Keep it short and friendly. Minimize "thinking" - just respond naturally. Use 1 emoji. Do NOT repeat the welcome message.

## REMINDER: Rules for this conversation

If user asks about other tools → show ONE toolSetup (no quick replies)
If user wants to explore without tools → explain web research & charts, end with quick replies
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
    title: null,
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
