import {
  editSkillWithInstructions,
  editSkillWithTool,
  mockTool,
  noSuggestion,
  type TestSuite,
  type WorkspaceContext,
} from "@app/tests/reinforcement-evals/lib/types";

const WORKSPACE_CONTEXT: WorkspaceContext = {
  tools: [
    mockTool("Slack", "Read and send Slack messages"),
    mockTool("Notion", "Search Notion workspace"),
    mockTool("GitHub", "Access GitHub repositories"),
    mockTool("JIRA", "Search and manage JIRA issues and projects"),
    mockTool(
      "Web Search",
      "Search the web for current information and real-time data"
    ),
    mockTool(
      "Calendar",
      "Manage calendar events, check availability, and schedule meetings"
    ),
  ],
};

export const analyzeConversationSuite: TestSuite = {
  name: "analyze-conversation",
  description:
    "Analyze conversations to generate synthetic suggestions for skill improvements",
  testCases: [
    {
      scenarioId: "unclear-instructions",
      type: "analysis",
      skillConfigs: [
        {
          name: "Meeting Scheduler",
          sId: "skill_meeting_scheduler",
          description: "Helps schedule meetings",
          instructions: "Help with meetings.",
          tools: [{ name: "Calendar", sId: "mcp_calendar" }],
        },
      ],
      conversation: [
        {
          role: "user",
          content: "Can you schedule a meeting with Sarah for tomorrow at 2pm?",
        },
        {
          role: "agent",
          content:
            "I can help with meetings. What would you like me to do exactly?",
        },
        {
          role: "user",
          content:
            "I just told you — schedule a meeting with Sarah tomorrow at 2pm. Why are you asking me again?",
        },
        {
          role: "agent",
          content:
            "I apologize for the confusion. Let me check Sarah's availability for tomorrow at 2pm.",
          actions: [
            {
              functionCallName: "calendar-check-availability",
              status: "succeeded",
              params: { user: "Sarah", date: "tomorrow", time: "2pm" },
              output: '{"available": true}',
            },
            {
              functionCallName: "calendar-create-event",
              status: "succeeded",
              params: {
                title: "Meeting with Sarah",
                date: "tomorrow",
                time: "2pm",
              },
              output: '{"eventId": "evt_123"}',
            },
          ],
        },
        {
          role: "user",
          content:
            "Finally. The instructions for this skill seem really vague.",
          feedback: {
            direction: "down",
            comment:
              "Skill instructions are too vague — it didn't know what to do with a straightforward scheduling request.",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [editSkillWithInstructions("skill_meeting_scheduler")],
      judgeCriteria: `The analyst MUST call edit_skill with instructionEdits for skill "skill_meeting_scheduler".
The suggestion should:
- Provide clearer instructions that explain the skill should proactively schedule meetings when given enough information (attendee, date, time)
- Reference that the current instructions ("Help with meetings.") are too vague
- Include guidance on checking availability before scheduling
- Have a meaningful analysis referencing the user's confusion

Score 0 if no edit_skill with instructionEdits call is made.
Score 0-1 if the suggestion doesn't substantially improve the instructions' clarity.
Score 2 if the suggestion improves clarity but misses key details (e.g., check availability first).
Score 3 if the suggestion provides clear, actionable instructions that would prevent the observed confusion.`,
    },
    {
      scenarioId: "missing-tool",
      type: "analysis",
      skillConfigs: [
        {
          name: "Research Assistant",
          sId: "skill_research",
          description:
            "Helps users research topics and find current information",
          instructions:
            "Help users research topics thoroughly. Search for up-to-date information when needed. Cite sources when possible.",
        },
      ],
      conversation: [
        {
          role: "user",
          content:
            "Can you find the latest news about the EU AI Act regulations?",
        },
        {
          role: "agent",
          content:
            "I don't currently have the ability to search the web for real-time information. Based on what I know, the EU AI Act was adopted in 2024, but I may not have the most current developments. Would you like me to help with what I have?",
        },
        {
          role: "user",
          content:
            "That's really frustrating. A research skill without web search is useless for finding current information.",
          feedback: {
            direction: "down",
            comment:
              "Research skill needs web search to be useful for current topics.",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [
        editSkillWithTool("skill_research", "mcp_web_search"),
      ],
      judgeCriteria: `The analyst MUST call edit_skill with toolEdits to suggest adding the Web Search tool
(mcp_web_search) to skill "skill_research". The suggestion should:
- Recommend adding Web Search (toolId: mcp_web_search) with action "add"
- Include an analysis explaining that the skill's purpose requires web search for current information
- Reference that the agent couldn't fulfill the user's core request without this capability

Score 0 if no edit_skill with toolEdits call is made.
Score 0-1 if edit_skill with toolEdits is called but with the wrong tool ID or wrong skill ID.
Score 2 if the correct tool is suggested but the analysis is weak.
Score 3 if the correct tool is suggested with a clear, well-reasoned analysis.`,
    },
    {
      scenarioId: "unused-tool",
      type: "analysis",
      skillConfigs: [
        {
          name: "Code Review Helper",
          sId: "skill_code_review",
          description: "Helps review code and suggest improvements",
          instructions:
            "Review code provided by the user. Focus on code quality, potential bugs, and best practices. Suggest improvements.",
          tools: [
            { name: "GitHub", sId: "mcp_github" },
            { name: "Calendar", sId: "mcp_calendar" },
          ],
        },
      ],
      conversation: [
        {
          role: "user",
          content:
            "Can you review this function?\n\nfunction add(a, b) { return a + b; }",
        },
        {
          role: "agent",
          content:
            "Here's my review of the function:\n\n1. **Type safety**: The function lacks type annotations. Consider using TypeScript.\n2. **Edge cases**: No input validation for non-numeric values.\n3. **Naming**: The function name is clear and concise.\n\nSuggested improvement:\n```typescript\nfunction add(a: number, b: number): number {\n  return a + b;\n}\n```",
          actions: [
            {
              functionCallName: "calendar-list-events",
              status: "failed",
              params: {},
              output: "Error: not relevant to the current task",
            },
          ],
        },
        {
          role: "user",
          content:
            "Good review, but why did it try to access my calendar? That's weird for a code review.",
          feedback: {
            direction: "down",
            comment:
              "The Calendar tool has nothing to do with code review and caused a confusing error.",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [
        editSkillWithTool("skill_code_review", "mcp_calendar"),
      ],
      judgeCriteria: `The analyst MUST call edit_skill with toolEdits to suggest removing the Calendar tool
(mcp_calendar) from skill "skill_code_review". The suggestion should:
- Recommend removing Calendar (toolId: mcp_calendar) with action "remove"
- Include an analysis explaining that Calendar is irrelevant to code review and caused confusion
- Reference the failed tool call and user complaint

Score 0 if no edit_skill with toolEdits call is made.
Score 0-1 if edit_skill with toolEdits is called but with the wrong action (add instead of remove).
Score 2 if the correct tool removal is suggested but the analysis is weak.
Score 3 if the correct removal is suggested with a clear analysis referencing the confusion it caused.`,
    },
    {
      scenarioId: "instruction-and-tool-gap",
      type: "analysis",
      skillConfigs: [
        {
          name: "Bug Reporter",
          sId: "skill_bug_reporter",
          description: "Helps file bug reports from user descriptions",
          instructions:
            "When a user describes a bug, create a well-structured bug report with steps to reproduce, expected behavior, and actual behavior. File the bug report in the project tracker.",
        },
      ],
      conversation: [
        {
          role: "user",
          content:
            "The login page crashes when I enter a special character in the password field. Can you file a bug for this?",
        },
        {
          role: "agent",
          content:
            "I've prepared a bug report:\n\n**Title**: Login page crash on special characters in password\n**Steps to reproduce**: Enter a special character in the password field on the login page\n**Expected**: Password field accepts special characters\n**Actual**: Page crashes\n\nHowever, I don't have access to a project tracker to file this. You'll need to copy this into JIRA or your tracker manually.",
        },
        {
          role: "user",
          content:
            "The instructions say to file it in the tracker but the skill can't actually do that. Pretty broken.",
          feedback: {
            direction: "down",
            comment:
              "Skill promises to file bugs but has no tool to do it. Instructions and tools are mismatched.",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [
        editSkillWithInstructions("skill_bug_reporter"),
        editSkillWithTool("skill_bug_reporter", "mcp_jira"),
      ],
      judgeCriteria: `The analyst MUST make BOTH types of suggestions for skill "skill_bug_reporter":
1. edit_skill with instructionEdits to update instructions to reference the JIRA tool for filing
2. edit_skill with toolEdits to add JIRA (mcp_jira) so the skill can actually file bugs

The suggestions should be co-dependent — the instructions should reference using JIRA,
and the tool addition provides the capability.

Score 0 if only one type of suggestion is made.
Score 1 if both are made but the instructions don't reference the tool, or the analysis is weak.
Score 2 if both are made with decent analysis but the instruction/tool connection isn't explicit.
Score 3 if both are made with clear co-dependency: instructions reference JIRA, tool provides the capability, and analysis explains the mismatch.`,
    },
    {
      scenarioId: "successful-conversation",
      type: "analysis",
      skillConfigs: [
        {
          name: "Data Lookup",
          sId: "skill_data_lookup",
          description: "Looks up data in Notion for the team",
          instructions:
            "Search Notion for the requested information. Present findings clearly with source references. If multiple results match, show the most relevant ones.",
          tools: [{ name: "Notion", sId: "mcp_notion" }],
        },
      ],
      conversation: [
        {
          role: "user",
          content: "What's the Q1 revenue target for 2026?",
        },
        {
          role: "agent",
          content:
            'According to the "2026 Revenue Targets" page in Notion, the Q1 target is **$2.5M**, representing 15% growth over Q4 2025.',
          actions: [
            {
              functionCallName: "notion-search",
              status: "succeeded",
              params: { query: "Q1 2026 revenue target" },
              output:
                '{"results": [{"title": "2026 Revenue Targets", "content": "Q1: $2.5M (15% QoQ growth)"}]}',
            },
          ],
          feedback: {
            direction: "up",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [noSuggestion()],
      judgeCriteria: `This is a smooth, successful conversation. The skill searched Notion, found accurate data,
cited the source, and presented it clearly. The user gave a thumbs up.

There is nothing to improve — no negative feedback, no tool errors, no confusion.

Score 0 if any substantive suggestion is made.
Score 3 if no suggestion is created (empty suggestions arrays only).`,
    },
    {
      scenarioId: "user-feedback-driven",
      type: "analysis",
      skillConfigs: [
        {
          name: "Email Drafter",
          sId: "skill_email_drafter",
          description: "Drafts professional emails",
          instructions:
            "Draft emails based on user requests. Keep them professional and concise.",
          tools: [{ name: "Slack", sId: "mcp_slack" }],
        },
      ],
      conversation: [
        {
          role: "user",
          content:
            "Draft an email to the client apologizing for the delayed shipment.",
        },
        {
          role: "agent",
          content:
            "Subject: Shipment Delay Notification\n\nDear Customer,\n\nWe regret to inform you that your shipment has been delayed. We are working to resolve this.\n\nRegards,\nThe Team",
        },
        {
          role: "user",
          content:
            "This is way too generic. I need it to sound empathetic and offer a specific remedy, like a discount or expedited shipping. The skill should know our company's tone — we're a premium brand.",
          feedback: {
            direction: "down",
            comment:
              "Email is generic and doesn't match our premium brand voice. Should include specific remedies for delays.",
          },
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [editSkillWithInstructions("skill_email_drafter")],
      judgeCriteria: `The analyst MUST call edit_skill with instructionEdits for skill "skill_email_drafter".
The suggestion should:
- Add guidance about using a premium, empathetic brand voice
- Include direction to offer specific remedies when addressing complaints
- Reference the user's explicit feedback about generic tone and missing remedies
- Preserve the existing instruction about being professional and concise

Score 0 if no edit_skill with instructionEdits call is made.
Score 0-1 if the suggestion is generic and doesn't address the specific feedback points.
Score 2 if the suggestion addresses tone but misses the remedy guidance (or vice versa).
Score 3 if the suggestion addresses both brand voice and remedy guidance with a clear analysis.`,
    },
    {
      scenarioId: "multi-skill-targeted-feedback",
      type: "analysis",
      skillConfigs: [
        {
          name: "GitHub Reporter",
          sId: "skill_github_reporter",
          description:
            "Extracts data from GitHub repositories including issues, PRs, and project boards for the engineering team",
          instructions: `You are the GitHub Reporter skill for Acme Corp's engineering team. Use this skill to extract repository activity, issues, and pull requests from our GitHub organization.

## Projects

Our GitHub organization contains the following repositories:
- **CoreEngine**: The main backend service handling API requests, authentication, and data processing.
- **FrontendUI**: The customer-facing React web application and design system.
- **InfraOps**: Infrastructure-as-code, CI/CD pipelines, and deployment tooling.
- **MobileApp**: The iOS and Android mobile application built with React Native.

## Tools

- Use \`github-list-issues\` to retrieve open and closed issues for one or more repositories. Always specify the project names in the \`projects\` parameter.
- Use \`github-list-prs\` to retrieve pull requests (open, merged, closed) for one or more repositories. Always specify the project names in the \`projects\` parameter.
- Use \`github-get-repo-stats\` to retrieve commit activity, contributor stats, and release history for a single repository.

When reporting, group results by repository and include issue/PR status.`,
          tools: [{ name: "GitHub", sId: "mcp_github" }],
        },
        {
          name: "Jira Extractor",
          sId: "skill_jira_extractor",
          description:
            "Extracts tickets, sprint data, and project status from Jira for the engineering and product teams",
          instructions: `You are the Jira Extractor skill for Acme Corp. Use this skill to retrieve tickets, sprint progress, and project status from our Jira instance.

## Projects

Our Jira workspace contains the following projects:
- **ENG** (Engineering): Backend and infrastructure work items, bugs, and technical debt.
- **FRONT** (Frontend): UI/UX tasks, design implementation, and frontend bugs.
- **MOBILE** (Mobile): Mobile app features, platform-specific bugs, and release tracking.
- **PROD** (Product): Product requirements, feature specifications, and roadmap items.

## Tools

- Use \`jira-get-sprint-status\` to retrieve the current sprint's progress, including ticket counts by status and completion percentage. Specify the \`board\` parameter (e.g., "Engineering", "Frontend", "Mobile").
- Use \`jira-search-issues\` to search for issues using JQL queries. Use this for filtered searches (e.g., by assignee, label, priority, or date range).
- Use \`jira-create-issue\` to create new tickets. Always set the \`project\`, \`summary\`, \`description\`, and \`issueType\` fields. Default issue type is "Task" unless the user specifies otherwise.

When presenting sprint data, always include the sprint name, overall progress percentage, and a breakdown of tickets by status (To Do, In Progress, Done).`,
          tools: [{ name: "JIRA", sId: "mcp_jira" }],
        },
        {
          name: "Notion Publisher",
          sId: "skill_notion_publisher",
          description:
            "Publishes reports and documents to the Acme Corp Notion workspace",
          instructions: `You are the Notion Publisher skill for Acme Corp. Use this skill to read content from Notion, create new pages, and update existing pages in our shared workspace.

## Workspace sections

Our Notion workspace is organized into the following top-level sections:
- **Engineering Reports**: Weekly and monthly engineering reports, incident post-mortems, and architecture decision records.
- **Product Specs**: Product requirements documents, feature specs, and design briefs.
- **Meeting Notes**: Agendas and notes from team standups, retrospectives, and planning sessions.
- **Team Wiki**: Onboarding guides, process documentation, and team directories.

## Tools

- Use \`notion-search\` to find existing pages by title or content. Use this before creating a new page to avoid duplicates.
- Use \`notion-get-page\` to retrieve the full content of an existing Notion page by its page ID.
- Use \`notion-create-page\` to create a new page. Always specify the \`database\` (section name) and \`title\`. Use the appropriate section based on the content type.
- Use \`notion-update-page\` to edit the content of an existing page by its page ID. Use this to append or replace sections of a page.

## Content structure

When creating or updating pages, follow these formatting rules:
- Start with an H1 title matching the page title.
- Use H2 headings for major sections (e.g., "GitHub Activity", "Jira Sprint Status").
- Use tables for structured data (issues, PRs, tickets) with columns for key, title, status, and assignee.
- Use bullet points for summaries and highlights.
- Always include a "Generated on" date at the bottom of reports.`,
          tools: [{ name: "Notion", sId: "mcp_notion" }],
        },
      ],
      conversation: [
        {
          role: "user",
          content:
            "I need a combined report of our GitHub activity and Jira sprint status. Pull the data from both and publish it as a report on Notion.",
        },
        {
          role: "agent",
          content:
            "I'll gather data from both GitHub and Jira, then publish the combined report to Notion.",
          actions: [
            {
              functionCallName: "github-list-issues",
              status: "succeeded",
              params: {
                projects: ["CoreEngine", "FrontendUI", "InfraOps", "MobileApp"],
              },
              output:
                '{"issues": [{"project": "CoreEngine", "title": "Fix auth flow", "status": "open"}, {"project": "FrontendUI", "title": "Update dashboard", "status": "closed"}]}',
            },
            {
              functionCallName: "github-list-prs",
              status: "succeeded",
              params: {
                projects: ["CoreEngine", "FrontendUI", "InfraOps", "MobileApp"],
              },
              output:
                '{"prs": [{"project": "CoreEngine", "title": "Refactor auth module", "status": "merged"}, {"project": "MobileApp", "title": "Add push notifications", "status": "open"}]}',
            },
            {
              functionCallName: "jira-get-sprint-status",
              status: "succeeded",
              params: { board: "Engineering" },
              output:
                '{"sprint": "Sprint 24", "progress": "75%", "tickets": [{"key": "ENG-401", "summary": "API rate limiting", "status": "In Progress"}, {"key": "ENG-402", "summary": "DB migration", "status": "Done"}]}',
            },
            {
              functionCallName: "notion-create-page",
              status: "succeeded",
              params: {
                database: "Engineering Reports",
                title: "GitHub & Jira Combined Report",
                content:
                  "# GitHub & Jira Combined Report\n\n## GitHub Activity\n\n| Project | Title | Type | Status |\n|---|---|---|---|\n| CoreEngine | Fix auth flow | Issue | Open |\n| CoreEngine | Refactor auth module | PR | Merged |\n| FrontendUI | Update dashboard | Issue | Closed |\n| MobileApp | Add push notifications | PR | Open |\n\n## Jira Sprint Status\n\n**Sprint 24** — 75% complete\n\n| Key | Summary | Status |\n|---|---|---|\n| ENG-401 | API rate limiting | In Progress |\n| ENG-402 | DB migration | Done |\n\n*Generated on 2026-04-10*",
              },
              output:
                '{"pageId": "page_abc123", "url": "https://notion.so/report-abc123"}',
            },
          ],
        },
        {
          role: "agent",
          content:
            "I've published the combined report to Notion. Here's a summary:\n\n**GitHub Activity:**\n- CoreEngine: 1 open issue (Fix auth flow), 1 merged PR (Refactor auth module)\n- FrontendUI: 1 closed issue (Update dashboard)\n- MobileApp: 1 open PR (Add push notifications)\n\n**Jira Sprint 24 (75% complete):**\n- ENG-401: API rate limiting (In Progress)\n- ENG-402: DB migration (Done)\n\nFull report: https://notion.so/report-abc123",
        },
        {
          role: "user",
          content:
            "The info looks wrong for GitHub — you are missing all the tickets from project DevCode. That's one of our most active repos and it's not in the report at all.",
        },
        {
          role: "agent",
          content:
            "You're right, I'm sorry about that. Let me pull the data from the DevCode repository and update the report.",
          actions: [
            {
              functionCallName: "github-list-issues",
              status: "succeeded",
              params: { projects: ["DevCode"] },
              output:
                '{"issues": [{"project": "DevCode", "title": "Implement caching layer", "status": "open"}, {"project": "DevCode", "title": "Fix race condition in worker", "status": "open"}, {"project": "DevCode", "title": "Add retry logic for webhooks", "status": "closed"}]}',
            },
            {
              functionCallName: "github-list-prs",
              status: "succeeded",
              params: { projects: ["DevCode"] },
              output:
                '{"prs": [{"project": "DevCode", "title": "Add caching middleware", "status": "open"}, {"project": "DevCode", "title": "Fix worker pool exhaustion", "status": "merged"}]}',
            },
            {
              functionCallName: "notion-update-page",
              status: "succeeded",
              params: {
                pageId: "page_abc123",
                content:
                  "## DevCode Activity\n\n| Title | Type | Status |\n|---|---|---|\n| Implement caching layer | Issue | Open |\n| Fix race condition in worker | Issue | Open |\n| Add retry logic for webhooks | Issue | Closed |\n| Add caching middleware | PR | Open |\n| Fix worker pool exhaustion | PR | Merged |",
              },
              output: '{"success": true}',
            },
          ],
        },
        {
          role: "agent",
          content:
            "I've updated the Notion report with the DevCode data. Here's what was added:\n\n**DevCode:**\n- 2 open issues (Implement caching layer, Fix race condition in worker), 1 closed issue (Add retry logic for webhooks)\n- 1 open PR (Add caching middleware), 1 merged PR (Fix worker pool exhaustion)\n\nThe report at https://notion.so/report-abc123 now includes all five repositories.",
        },
      ],
      workspaceContext: WORKSPACE_CONTEXT,
      expectedToolCalls: [editSkillWithInstructions("skill_github_reporter")],
      judgeCriteria: `The analyst MUST call edit_skill with instructionEdits for skill "skill_github_reporter" ONLY.
The suggestion should:
- Add "DevCode" to the list of known GitHub projects in the skill instructions
- Reference that the current project list is incomplete and caused missing data in the report
- Keep the existing projects (CoreEngine, FrontendUI, InfraOps, MobileApp) and add DevCode

CRITICAL constraints:
- There MUST NOT be any edit_skill call targeting "skill_jira_extractor" or "skill_notion_publisher"
- The user's complaint is specifically about GitHub missing the DevCode project — the Jira and Notion skills worked correctly
- Only the GitHub Reporter skill needs updating

Score 0 if no edit_skill call is made for skill_github_reporter, or if edit_skill is called for skill_jira_extractor or skill_notion_publisher.
Score 1 if edit_skill is called only for skill_github_reporter but the suggestion doesn't specifically mention adding DevCode to the project list.
Score 3 if edit_skill is called only for skill_github_reporter, the suggestion adds DevCode to the project list, and no other skills are modified.`,
    },
  ],
};
