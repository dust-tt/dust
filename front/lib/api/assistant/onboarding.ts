import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  getInternalMCPServerInfo,
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
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { UserMessageContext } from "@app/types/assistant/conversation";
import type { APIErrorWithStatusCode } from "@app/types/error";
import type { FavoritePlatform } from "@app/types/favorite_platforms";
import { isFavoritePlatform } from "@app/types/favorite_platforms";
import type { JobType } from "@app/types/job_type";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { asDisplayName } from "@app/types/shared/utils/string_utils";

import { createConversation, postUserMessage } from "./conversation";

function getOnboardingAvailableTools(): Array<{
  sId: string;
  name: string;
  description: string;
}> {
  return (
    Object.keys(INTERNAL_MCP_SERVERS) as InternalMCPServerNameType[]
  ).flatMap((serverName) => {
    const { availability, isRestricted, isPreview } =
      INTERNAL_MCP_SERVERS[serverName];
    const serverInfo = getInternalMCPServerInfo(serverName);

    // Only include manually connected tools.
    if (availability !== "manual") {
      return [];
    }

    // Exclude tools gated behind feature flags.
    if (isRestricted !== undefined) {
      return [];
    }

    // Exclude preview tools.
    if (isPreview) {
      return [];
    }

    // Only include tools that support personal_actions.
    const supportedUseCases: readonly string[] =
      serverInfo.authorization?.supported_use_cases ?? [];
    if (!supportedUseCases.includes("personal_actions")) {
      return [];
    }

    return [
      {
        sId: serverName,
        name: serverInfo.name,
        description: serverInfo.description,
      },
    ];
  });
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

function buildFirstQuestionOptions(
  topTools: InternalMCPServerNameType[]
): string {
  const toolOptions = topTools.map((toolId, index) => {
    const toolName = asDisplayName(toolId);
    const recommendedSuffix = index === 0 ? " (Recommended)" : "";

    return [
      `- label: Connect ${toolName}${recommendedSuffix}`,
      `  description: ${getInternalMCPServerInfo(toolId).description}`,
    ].join("\n");
  });

  return [
    ...toolOptions,
    "- label: I have something in mind",
    "  description: I'll help with the goal you already have in mind.",
    "- label: Skip tools for now",
    "  description: We can start without connecting anything yet.",
  ].join("\n");
}

export function buildOnboardingPrompt(options: {
  emailProvider: EmailProviderType;
  userJobType: string | null;
  favoritePlatforms: FavoritePlatform[];
  configuredTools: InternalMCPServerNameType[];
  username: string;
  language: string | null;
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

  const topToolsWithDescriptions = topTools
    .map((sId) => {
      const serverInfo = getInternalMCPServerInfo(sId);
      return `- ${asDisplayName(sId)}: ${serverInfo.description}`;
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
        "Prioritize suggesting these tools and keep the onboarding grounded in those tools.";
    }
  }

  const suggestedTopToolNames = topTools
    .map((sId) => asDisplayName(sId))
    .join(", ");

  const otherToolNames = tools.slice(2).map((sId) => asDisplayName(sId));
  const additionalToolGuidance =
    otherToolNames.length > 0
      ? `Other relevant tools you can suggest later: ${otherToolNames.join(", ")}.`
      : "Keep the options focused on the most relevant tools.";

  const firstMessageSection = alreadyConfiguredTopTool
    ? buildFirstMessageWithConfiguredTool(alreadyConfiguredTopTool)
    : buildFirstMessageWithAskUserQuestion(
        topToolsWithDescriptions,
        buildFirstQuestionOptions(topTools),
        suggestedTopToolNames
      );

  const languageInstruction = options.language
    ? `\n## LANGUAGE\n\nYou MUST respond in ${options.language}. All your messages, including greetings, instructions, option labels, and questions asked using the ask_user_question tool, must be in ${options.language}.\n`
    : "";

  return `<dust_system>
You are onboarding a brand-new user to Dust.
${languageInstruction}${userContext}

## CRITICAL RULES

1. Be direct and action-focused.
2. Use \`ask_user_question\` whenever the user needs to choose a direction, confirm what to do next, or pick between candidate tools or tasks.
3. In onboarding, all user-facing choices must be presented through \`ask_user_question\`.
4. Use \`toolSetup\` only after the user has already confirmed they want one specific tool. At that point, render the card and stop for that turn.
5. You MUST NOT hallucinate:
- NEVER suggest cross-tool queries like "get answers from multiple sources"
- NEVER assume what data the user has (no "find your design docs", "search your specs", etc.)
- NEVER invent role-specific scenarios (no "as a designer, you can search design feedback...")
- ONLY suggest simple, generic tasks that work with a SINGLE tool

### Response guidance

- Use actual names, titles, dates from the data you fetch
- Make suggestions that are immediately actionable
- Don't be vague or generic
- If you can't find data, admit it and pivot to general suggestions
- Keep task suggestions universal - they should work for ANY user of that tool
- When describing tools, use only their official descriptions provided below

### Questions asked using the ask_user_question tool must match the data found

- Present results with specific names, titles, or dates
- Ask 2-3 actionable questions based on the actual data when there are multiple sensible next steps
- After showing results from any tool use, if there are 2-4 sensible next steps, use \`ask_user_question\` with options grounded in the actual data you found
- Include automation as an option only when it is genuinely relevant to the data or task at hand

Questions should be specific to what you found:
- Found emails from Sarah and Mike -> ask_user_question options like "Draft a reply to Sarah" and "Summarize Mike's email"
- Found PR reviews pending -> ask_user_question options like "Show PR details" and "List my open PRs"
- Found Notion pages -> ask_user_question options like "Open recent page" and "Search for..."

### Limited setup UI
- A single \`toolSetup\` card is available only after the user explicitly confirmed they want one specific tool to connect
- Never use a \`toolSetup\` card in the first message
- Never use more than one \`toolSetup\` card at a time
- Never use a \`toolSetup\` card as a choice menu, this does not work
- Exact format when needed: \`:toolSetup[Connect Tool Name]{sId=tool_id}\`

## Automation flow

When user wants to automate (asks for it or selects it in \`ask_user_question\`):
Call create_schedule_trigger with:
- name: Short description (e.g., "Daily email summary")
- schedule: Natural language (e.g., "every weekday at 9am")
- prompt: Start with @${options.username} so user gets pinged

## Available tools

${buildAvailableToolsList()}

**Only suggest tools to setup from this list. If a user asks about a tool not listed, explain it's not currently available.**

---

${firstMessageSection}

---

## HANDLING SUBSEQUENT MESSAGES

### When user already has something in mind
If the user says they already have an idea of what they want to do with Dust (e.g., "I already have an idea", "I know what I want to do"):
1. Acknowledge enthusiastically (one line)
2. Ask them what they'd like to accomplish - be genuinely curious and helpful
3. Once they share their goal, help them achieve that one goal first before expanding
4. If their goal would benefit from connecting a specific tool, mention it naturally and, if they agree, follow the single-tool connection flow above

### When user wants to skip initial tool setup
1. Acknowledge briefly (one line)
2. If they already have a concrete work goal, help with that first
3. If they are still exploring which tool to connect, first use \`ask_user_question\` to ask which category sounds most useful
4. After they pick a category, use \`ask_user_question\` again to refine to 2-3 specific tools in that category
5. Include a skip option in both of those questions so they can opt out at any point
6. Only render a \`toolSetup\` card after they confirm one specific tool

### When user asks to connect a tool
1. Acknowledge briefly
2. Render exactly one \`toolSetup\` card for that specific tool and stop there for this turn
3. Once the tool is ready, inspect real data and show personalized suggestions grounded in what you found
4. If there are multiple strong next steps, use \`ask_user_question\` to let the user choose, but keep the choice set tight and justified by the data

### When user skips ALL tools
1. Acknowledge (one line)
2. Ask them for one concrete task or one workflow they want to get started with
3. Use \`ask_user_question\` if you need the user to choose a focused starting point

### When user asks to connect more tools
1. Use \`ask_user_question\` with only the 2 most relevant options first
2. Put the most relevant tools first, especially ${suggestedTopToolNames}
3. ${additionalToolGuidance}
4. If the user wants more than those options, you can then offer the next most relevant tools
5. If the user picks a tool, follow the single-tool connection flow above

### When user says they already connected a tool
If the user says they already connected a tool (e.g., "I already connected Gmail", "It's already set up", "I connected it"):
1. Acknowledge briefly (e.g., "Great!")
2. If they named a specific tool, render exactly one \`toolSetup\` card for that tool and stop there for this turn
3. If it is unclear which tool they mean, use \`ask_user_question\` to disambiguate with one precise question
4. Once the tool is ready, present results with specific names, titles, or dates
5. If there are 2-4 sensible follow-ups, use \`ask_user_question\` with concrete options grounded in the data and keep the list as short as possible

### Tool categories for reference
- **Email & Calendar**: Gmail, Outlook, Google Calendar, Outlook Calendar
- **Knowledge & Docs**: Notion, Google Drive, Microsoft Drive
- **Development**: GitHub, Jira
- **Communication**: Slack, Microsoft Teams
- **CRM & Spreadsheets**: HubSpot, Microsoft Excel

</dust_system>`;
}

function buildFirstMessageWithAskUserQuestion(
  toolsWithDescriptions: string,
  questionOptions: string,
  suggestedToolNames: string
): string {
  return `## YOUR FIRST MESSAGE (respond now)

**Suggested tools for this user:** ${suggestedToolNames}

Recommended tools to setup for this user:
${toolsWithDescriptions}

Write a SHORT welcome message (2-4 lines max):
1. "# Welcome to Dust 👋" (or similar short greeting)
2. One sentence offering to help - either by connecting tools OR by helping with whatever they want to achieve
3. Briefly mention the recommended tool(s) as a suggestion, not a requirement
4. After the short welcome, call \`ask_user_question\` with these choices (translate the human-readable labels and descriptions if a language is enforced, but keep tool names unchanged):
${questionOptions}

**DO NOT:**
- Explain what Dust is at length
- List features or capabilities beyond the tools
- Invent use cases or scenarios specific to their role
- Promise cross-tool functionality
- Write more than 4 lines before calling \`ask_user_question\`
- Be pushy about connecting tools - present it as an option, not a requirement
- Use a \`toolSetup\` card in the first message`;
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
3. If there are 2-4 sensible next steps, call \`ask_user_question\` in the same response with concrete options grounded in the actual data found
4. Include automation as an option only if it is genuinely relevant

If you don't find relevant data:
- Still welcome the user and mention the tool is connected
- Suggest 2-3 general things they can try
- Use \`ask_user_question\` if you need the user to pick the next direction`;
}

// Tool-specific task suggestions for the first exploration after a tool is available.
const TOOL_TASK_SUGGESTIONS: Record<string, string> = {
  gmail:
    "Check today's or unread emails. Surface 1-2 concrete emails with sender names and dates.",
  outlook:
    "Check today's or unread emails. Surface 1-2 concrete emails with sender names and dates.",
  github:
    "Automatically check for recent notifications, open pull requests, or issues assigned to the user. Present 1-2 specific examples with repo names and brief context.",
  notion:
    "Check recently updated pages or recent workspace activity. Surface 1-2 concrete page titles with dates.",
  slack:
    "Check unread messages or recent mentions. Surface 1-2 concrete channels or people with context.",
  hubspot:
    "Check recently updated deals or newly added contacts. Surface 1-2 concrete records with names and dates.",
  jira: "Check open tickets assigned to the user or recent ticket updates. Surface 1-2 concrete issues with status.",
  google_drive:
    "Check recently updated files. Surface 1-2 concrete file names with dates.",
  microsoft_drive:
    "Check recently updated files. Surface 1-2 concrete file names with dates.",
  google_calendar:
    "Check today's or this week's schedule. Surface 1-2 concrete upcoming events with times.",
  outlook_calendar:
    "Check today's or this week's schedule. Surface 1-2 concrete upcoming events with times.",
  microsoft_teams:
    "Check unread messages or recent mentions. Surface 1-2 concrete teams or chats with context.",
  microsoft_excel:
    "Check recently updated spreadsheets. Surface 1-2 concrete file names with dates.",
};

const DEFAULT_AUTO_QUERY_GUIDANCE =
  "Automatically explore this tool to see what data is available. Present 1-2 specific examples of what you found.";

export function buildOnboardingFollowUpPrompt(
  toolId: string,
  language: string | null
): string {
  const queryGuidance =
    TOOL_TASK_SUGGESTIONS[toolId] ?? DEFAULT_AUTO_QUERY_GUIDANCE;
  const toolName = asDisplayName(toolId);

  const languageInstruction = language
    ? `\n**IMPORTANT:** You MUST respond in ${language}. All your messages and option labels must be in ${language}.\n`
    : "";

  return `<dust_system>
The user is ready to use ${toolName}.
${languageInstruction}
This is still onboarding. Keep the response focused on one concrete first success.

**Immediately use the ${toolId} tool** to fetch real data and show a focused next step.

Query guidance: ${queryGuidance}

Briefly confirm that the tool is ready, share what you found, and if there are 2-3 justified next steps use \`ask_user_question\` in the same response with concrete options grounded in the data.
</dust_system>`;
}

export async function createOnboardingConversationIfNeeded(
  auth: Authenticator,
  { force, language }: { force?: boolean; language?: string | null } = {
    force: false,
    language: null,
  }
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
    const existingMetadata = await user.getMetadata(
      "onboarding:conversation",
      owner.id
    );

    if (existingMetadata?.value) {
      // User already has an onboarding conversation for this workspace.
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
    "favorite_platforms",
    owner.id
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
    language: language ?? null,
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

  await user.setMetadata("onboarding:conversation", conversation.sId, owner.id);

  return new Ok(conversation.sId);
}
