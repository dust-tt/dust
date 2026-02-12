import type { Transaction } from "sequelize";

import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { Authenticator } from "@app/lib/auth";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import {
  SkillConfigurationModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { AGENT_GROUP_PREFIX } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";

const CORE_SERVERS: readonly InternalMCPServerNameType[] = [
  "web_search_&_browse",
  "slack",
] as const;
const GOOGLE_SERVERS: readonly InternalMCPServerNameType[] = [
  "gmail",
  "google_drive",
  "google_calendar",
] as const;
const MICROSOFT_SERVERS: readonly InternalMCPServerNameType[] = [
  "outlook",
  "outlook_calendar",
  "microsoft_drive",
  "microsoft_teams",
] as const;

const SKILL_NAME = "Prep Meeting";
const SKILL_ICON = "ActionBriefcaseIcon" as const;

const DESCRIPTION_FOR_HUMANS =
  "Research context for upcoming meetings by gathering email history, conversations, and relevant documents about all participants. Creates focused briefings with what you need to know, prepare, and discuss.";

const DESCRIPTION_FOR_AGENTS = `This skill should be enabled when users need to:
Prepare for upcoming meetings by gathering all relevant background
Understand who they're meeting with and the history of their relationship
Identify what they need to review or prepare before a meeting
Get up to speed quickly on meeting participants and context
Trigger phrases: "prep my meeting", "help me prepare for [meeting]", "what do I need to know about [meeting]", "meeting briefing", "meeting context"`;

// Full instructions when an email suite (Google or Microsoft) is available.
const INSTRUCTIONS_WITH_EMAIL = `When a user asks about meeting preparation, follow this protocol:

1. Extract Meeting Details
- Get participant list with full names and email addresses
- Get meeting time, title, and agenda (if available)
- Extract any meeting links (Google Meet, Zoom, etc.)

2. Systematic Context Search for **EACH Participant**
- Email Research: Start broad (no date restrictions) to verify correspondence exists
- Search sent emails: in:sent to:[exact_email]
- Search received emails: from:[exact_email] OR [exact_email]
- Use participant name in quotes for mentions
- Then narrow with dates (past month minimum): add after:YYYY/MM/DD
- Search both directions to get complete conversation history

Additional Sources:
- Search Slack for participant names and company names (past month)
- Look for relevant documents, CRM entries, previous notes
- Gather links to all context sources
- If No Context Found: Be explicit: "First-time contact - no prior email correspondence"
- Don't make up or assume information that doesn't exist

3. Create Executive Summary
- For the meeting, provide 3-5 focused bullet points
- What is expected from this meeting
- What to prepare or review beforehand:
- Key objectives or decisions to be made
- Specific context about who participants are and why they're meeting

DO NOT include:
- Generic placeholders or vague context
- Participant acceptance status (accepted/declined)
- Information you cannot verify

4. Preparation Checklist
- Specific prep work needed
- Documents to review
- Questions to clarify
- Relevant links to all context sources

When asked to generate a summary, here is how you can format it in a readable and clear way:

\`\`\`
Meeting: [Title] at [Time]
Participants: [List with emails]
Meeting Link: [Direct link]

Executive Summary:
• [Specific expectation/objective]
• [Key context about participants]
• [What to prepare]

Context:
- Email history: [Summary with links]
- Slack mentions: [Summary with links]
- Related documents: [Links]

Preparation:
• [Specific action items]
• [Documents to review]
\`\`\`

General Principles:

- Be systematic: Follow the search protocol completely for every participant
- Be specific: Use concrete details, never vague summaries
- Verify everything: Only include what you can confirm with sources
- Link everything: Provide direct links to emails, Slack threads, documents
- Accept no context: If genuinely nothing exists after thorough search, say so explicitly
- Never assume: Ask for clarification rather than make up information`;

// Limited instructions when no email suite is available. Does not make the most sense, but is meant to be edited.
const INSTRUCTIONS_WITHOUT_EMAIL = `When a user asks about meeting preparation, follow this protocol:

**Important: Email Access Not Connected**
To provide the best meeting preparation, connecting a Gmail or Microsoft Outlook account to Dust will be necessary.
This will allow searching through email history with participants and provide much richer context for meetings.

Here is an incomplete set of guidelines to follow when the user asks about meeting preparation:

1. Extract Meeting Details
- Get participant list with full names
- Get meeting time, title, and agenda (if available)
- Extract any meeting links (Google Meet, Zoom, etc.)

2. Context Search for Participants
- Search Slack for participant names and company names (past month)
- Look for relevant documents and previous notes
- Search the web for public information about participants or their companies
- Gather links to all context sources
- If No Context Found: Be explicit about what information is not available

3. Create Executive Summary
- For the meeting, provide 3-5 focused bullet points based on available information
- What is expected from this meeting
- What to prepare or review beforehand
- Key objectives or decisions to be made

DO NOT include:
- Generic placeholders or vague context
- Information you cannot verify

4. Preparation Checklist
- Specific prep work needed
- Documents to review
- Questions to clarify
- Relevant links to all context sources

When asked to generate a summary, here is how you can format it in a readable and clear way:

\`\`\`
Meeting: [Title] at [Time]
Participants: [List]
Meeting Link: [Direct link]

⚠️ Note: Connect Gmail or Outlook for email history with participants

Executive Summary:
• [Specific expectation/objective]
• [Key context about participants]
• [What to prepare]

Context:
- Slack mentions: [Summary with links]
- Web search: [Relevant findings]
- Related documents: [Links]

Preparation:
• [Specific action items]
• [Documents to review]
\`\`\`

General Principles:

- Be specific: Use concrete details, never vague summaries
- Verify everything: Only include what you can confirm with sources
- Link everything: Provide direct links to Slack threads, documents
- Accept no context: If genuinely nothing exists after thorough search, say so explicitly
- Never assume: Ask for clarification rather than make up information
- Suggest email connection: Remind the user that connecting Gmail or Outlook would enhance meeting prep`;

interface MCPServerViewInfo {
  id: number;
  internalMCPServerId: string;
  serverType: string;
}

async function findAvailableMCPServerViews(
  auth: Authenticator,
  serverNames: readonly InternalMCPServerNameType[]
): Promise<Map<string, MCPServerViewInfo>> {
  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
  const workspaceModelId = auth.getNonNullableWorkspace().id;

  const views = await MCPServerViewModel.findAll({
    where: {
      workspaceId: workspaceModelId,
      serverType: "internal",
      internalMCPServerId: serverNames.map((name) =>
        internalMCPServerNameToSId({
          name,
          workspaceId: workspaceModelId,
          prefix: 1,
        })
      ),
      vaultId: globalSpace.id,
    },
  });

  const result = new Map<string, MCPServerViewInfo>();
  for (const view of views) {
    if (view.internalMCPServerId) {
      const res = getInternalMCPServerNameAndWorkspaceId(
        view.internalMCPServerId
      );
      if (res.isErr()) {
        throw new Error("Invalid server ID");
      }
      const { name: serverName } = res.value;

      result.set(serverName, {
        id: view.id,
        internalMCPServerId: view.internalMCPServerId,
        serverType: view.serverType,
      });
    }
  }

  return result;
}

async function createMeetingPrepSkill(
  workspace: LightWorkspaceType,
  { execute, logger }: { execute: boolean; logger: Logger }
): Promise<void> {
  logger.info(
    { workspaceId: workspace.sId },
    "Starting creation of Meeting Prep skill"
  );
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const existingSkill = await SkillConfigurationModel.findOne({
    where: {
      workspaceId: workspace.id,
      name: SKILL_NAME,
    },
  });

  if (existingSkill) {
    throw new Error(
      `Skill "${SKILL_NAME}" already exists in workspace (status: ${existingSkill.status})`
    );
  }

  // Find available MCP server views
  const allServerNames = [
    ...CORE_SERVERS,
    ...GOOGLE_SERVERS,
    ...MICROSOFT_SERVERS,
  ];
  const availableViews = await findAvailableMCPServerViews(
    auth,
    allServerNames
  );

  // Collect core servers
  const selectedViewIds: number[] = [];
  const selectedServers: string[] = [];

  for (const serverName of CORE_SERVERS) {
    const view = availableViews.get(serverName);
    if (view) {
      selectedViewIds.push(view.id);
      selectedServers.push(serverName);
    } else {
      logger.warn({ serverName }, "Core MCP server not available in workspace");
    }
  }

  // Determine Google vs. Microsoft availability
  const isGoogleAvailable =
    GOOGLE_SERVERS.filter((s) => availableViews.has(s)).length > 0;
  const isMicrosoftAvailable =
    MICROSOFT_SERVERS.filter((s) => availableViews.has(s)).length > 0;

  // Prefer Google if available, otherwise use Microsoft.
  let suiteName: "Google" | "Microsoft" | null = null;
  if (isGoogleAvailable) {
    suiteName = "Google";
    for (const serverName of GOOGLE_SERVERS) {
      const view = availableViews.get(serverName);
      if (view) {
        selectedViewIds.push(view.id);
        selectedServers.push(serverName);
      }
    }
  } else if (isMicrosoftAvailable) {
    suiteName = "Microsoft";
    for (const serverName of MICROSOFT_SERVERS) {
      const view = availableViews.get(serverName);
      if (view) {
        selectedViewIds.push(view.id);
        selectedServers.push(serverName);
      }
    }
  }

  if (selectedViewIds.length === 0) {
    throw new Error(
      "No MCP servers available in workspace. At least one server is required."
    );
  }

  // Select instructions based on email suite availability.
  const hasEmailSuite = suiteName !== null;
  const instructions = hasEmailSuite
    ? INSTRUCTIONS_WITH_EMAIL
    : INSTRUCTIONS_WITHOUT_EMAIL;

  if (!execute) {
    logger.info(
      {
        servers: selectedServers,
        suiteName,
        workspaceId: workspace.sId,
      },
      "Would create suggested skill (dry run)"
    );
    return;
  }

  await frontSequelize.transaction(async (transaction: Transaction) => {
    const createdSkill = await SkillConfigurationModel.create(
      {
        workspaceId: workspace.id,
        name: SKILL_NAME,
        agentFacingDescription: DESCRIPTION_FOR_AGENTS,
        userFacingDescription: DESCRIPTION_FOR_HUMANS,
        instructions,
        status: "suggested",
        editedBy: null,
        requestedSpaceIds: [],
        icon: SKILL_ICON,
        extendedSkillId: null,
      },
      { transaction }
    );

    const editorGroup = await GroupResource.makeNew(
      {
        workspaceId: workspace.id,
        name: `${AGENT_GROUP_PREFIX} ${SKILL_NAME} (skill:${createdSkill.id})`,
        kind: "agent_editors",
      },
      { transaction }
    );

    await GroupSkillModel.create(
      {
        groupId: editorGroup.id,
        skillConfigurationId: createdSkill.id,
        workspaceId: workspace.id,
      },
      { transaction }
    );

    await SkillMCPServerConfigurationModel.bulkCreate(
      selectedViewIds.map((mcpServerViewId) => ({
        workspaceId: workspace.id,
        skillConfigurationId: createdSkill.id,
        mcpServerViewId,
      })),
      { transaction }
    );

    logger.info(
      {
        skillId: createdSkill.id,
        servers: selectedServers,
        suiteName,
        workspaceId: workspace.sId,
      },
      "Successfully created Meeting Prep skill"
    );
  });
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      type: "string" as const,
      required: false,
    },
  },
  async ({ workspaceId, execute }, logger) => {
    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found with sId: ${workspaceId}`);
      }

      await createMeetingPrepSkill(renderLightWorkspaceType({ workspace }), {
        execute,
        logger,
      });
    } else {
      await runOnAllWorkspaces(
        async (workspace) =>
          createMeetingPrepSkill(workspace, {
            execute,
            logger,
          }),
        { concurrency: 4 }
      );
    }
  }
);
