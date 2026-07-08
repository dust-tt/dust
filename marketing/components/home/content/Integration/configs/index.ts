import type { IntegrationEnrichment } from "../types";

// Per-integration marketing enrichment: one self-contained entry per slug.
// An entry may include a `chatStoryline` (chat mockup) and/or `benefits`
// (the "what you can do" cards). When either is absent, IntegrationTemplate
// falls back to the heuristic generator for that section; a slug with no entry
// here is fully heuristic.
export const integrationEnrichments: Record<string, IntegrationEnrichment> = {
  slack: {
    tagline:
      "Post messages, search conversations, and automate your Slack workflows",
    faq: [
      {
        question: "Can Dust post to private Slack channels?",
        answer:
          "Yes, Dust can post to private channels once the Dust bot is invited to the channel. Simply invite @Dust to any private channel you want AI agents to access.",
      },
      {
        question: "Does Dust have access to all my Slack messages?",
        answer:
          "Dust only accesses channels and messages that you explicitly connect. You have full control over which channels and data sources are synchronized.",
      },
      {
        question: "Can I trigger Dust agents from Slack messages?",
        answer:
          "Yes! You can mention @Dust in any channel where the bot is present, or use Slack workflows to trigger Dust agents based on specific events.",
      },
    ],
    relatedIntegrations: ["microsoft_teams", "gmail", "notion"],
    chatStoryline: {
      userPrompt:
        "I was OOO yesterday — catch me up on the #incident-payments channel and the launch thread I was tagged in.",
      toolCalls: [
        "search_channels",
        "list_messages",
        "read_thread_messages",
        "semantic_search_messages",
      ],
      completedInSeconds: 14,
      responseIntro: "Here's what you missed across Slack while you were out.",
      responseSections: [
        {
          heading: "#incident-payments (47 new messages)",
          bullets: [
            {
              title: "Root cause found",
              body: "Maria flagged a Stripe webhook timeout at 2:14pm; Dev confirmed it was a retry-queue backlog, now drained.",
            },
            {
              title: "Status",
              body: "Incident marked resolved at 4:40pm. No customer refunds required — only checkout was delayed ~6 min.",
            },
            {
              title: "Action item for you",
              body: "Priya asked you to review the postmortem doc before Friday's sync.",
            },
          ],
        },
        {
          heading: "Launch thread (you were @-mentioned)",
          bullets: [
            {
              title: "Date locked",
              body: "GTM confirmed the Q3 launch ships July 8; eng signed off on the feature freeze.",
            },
            {
              title: "Open question",
              body: "Sam asked whether you want the announcement posted to #general or #customers first.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to post a quick 'I'm caught up, reviewing the postmortem today' reply in the incident thread?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Find any past decision fast",
        description:
          "Search across channels and messages by keyword or meaning to surface the exact thread, decision, or canvas you need — even when you can't remember which channel it was in.",
        toolMatches: [
          "search_messages",
          "semantic_search_messages",
          "search_channels",
          "read_thread_messages",
        ],
      },
      {
        icon: "ActionMegaphoneIcon",
        color: "green",
        title: "Post and schedule updates",
        description:
          "Draft and send messages, schedule them for the right time zone, and spin up a new channel with the right people invited — all without switching tabs.",
        toolMatches: [
          "post_message",
          "schedule_message",
          "create_channel",
          "invite_to_channel",
        ],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "golden",
        title: "Keep canvases up to date",
        description:
          "Read existing channel canvases and write new ones so meeting notes, runbooks, and project docs stay current alongside the conversation.",
        toolMatches: ["read_canvas", "write_canvas", "get_channel_canvases"],
      },
    ],
  },
  slack_bot: {
    tagline:
      "Enable conversational AI directly in Slack with the Dust bot interface",
    useCases: [
      {
        title: "Ask Questions Anywhere",
        description:
          "Get instant answers from your knowledge base by mentioning @Dust in any Slack channel.",
        icon: "ActionMagnifyingGlassIcon",
      },
      {
        title: "Collaborative Problem-Solving",
        description:
          "Work with AI agents in threads to brainstorm, analyze, and make decisions as a team.",
        icon: "ActionBrainIcon",
      },
    ],
    faq: [
      {
        question: "How do I add the Dust bot to my Slack workspace?",
        answer:
          "Navigate to your Dust workspace settings and click 'Connect Slack'. Follow the OAuth flow to authorize the bot in your Slack workspace.",
      },
    ],
    relatedIntegrations: ["slack", "microsoft_teams"],
  },
  microsoft_teams: {
    tagline: "Bring AI agents to Microsoft Teams for seamless collaboration",
    faq: [
      {
        question: "Does Dust work with Microsoft 365?",
        answer:
          "Yes, Dust integrates with the full Microsoft 365 suite including Teams, OneDrive, Outlook, and Excel.",
      },
    ],
    relatedIntegrations: ["slack", "outlook", "microsoft_drive"],
    chatStoryline: {
      userPrompt:
        "I missed this morning's product sync call in the Roadmap team. Catch me up on what was decided and any action items for me.",
      toolCalls: [
        "list_teams",
        "list_meetings",
        "get_transcript_content",
        "search_messages_content",
      ],
      completedInSeconds: 14,
      responseIntro:
        "I pulled the product sync meeting from your Roadmap team in Microsoft Teams and went through the transcript plus the follow-up channel discussion.",
      responseSections: [
        {
          heading: "Decisions from the product sync",
          bullets: [
            {
              title: "Beta launch moved to July 8",
              body: "The team pushed the public beta back two weeks to finish the onboarding rework Priya flagged.",
            },
            {
              title: "Dropped the in-app survey",
              body: "Consensus to cut it for v1 and revisit after launch; analytics will cover the gap for now.",
            },
          ],
        },
        {
          heading: "Action items assigned to you",
          bullets: [
            {
              title: "Finalize pricing copy by Thursday",
              body: "Marco asked you to send the updated tier descriptions so design can lock the pricing page.",
            },
            {
              title: "Reply in #roadmap thread",
              body: "Daniela tagged you asking whether the API rate limits change affects the beta scope.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to post a quick recap with your two action items to the #roadmap channel?",
    },
    benefits: [
      {
        icon: "ActionDocumentTextIcon",
        color: "golden",
        title: "Catch up on meetings you missed",
        description:
          "Pull the transcript from any Teams meeting and get a tight summary of decisions, owners, and deadlines without rewatching the recording.",
        toolMatches: ["list_meetings", "get_transcript_content"],
      },
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Find answers across chats and channels",
        description:
          "Search message content across your teams, channels, and direct chats to surface that decision, file, or thread you half-remember from last week.",
        toolMatches: [
          "search_messages_content",
          "list_channels",
          "list_messages",
          "list_chats",
        ],
      },
      {
        icon: "ActionMegaphoneIcon",
        color: "green",
        title: "Post updates straight to a channel",
        description:
          "Draft and send messages into the right Teams channel, from status recaps to action-item follow-ups, so updates land where your team already works.",
        toolMatches: ["post_message", "list_channels", "list_teams"],
      },
    ],
  },
  notion: {
    tagline:
      "Connect your Notion workspace to build AI agents that understand your documentation",
    faq: [
      {
        question: "Can Dust create pages in Notion?",
        answer:
          "Yes, Dust agents can create and update Notion pages, databases, and blocks through the Notion API.",
      },
      {
        question: "How often does Dust sync with Notion?",
        answer:
          "Dust syncs with Notion regularly to keep your knowledge base up to date. The sync frequency depends on your plan.",
      },
    ],
    relatedIntegrations: ["google_drive", "confluence", "slab"],
    chatStoryline: {
      userPrompt:
        "Find our Q3 product roadmap page in Notion and summarize what's slipped since last quarter.",
      toolCalls: [
        "search",
        "retrieve_page",
        "retrieve_block_children",
        "fetch_comments",
      ],
      completedInSeconds: 12,
      responseIntro:
        "I found the Q3 roadmap in Notion and pulled together the status changes and open discussion.",
      responseSections: [
        {
          heading: "What slipped since Q2",
          bullets: [
            {
              title: "Billing redesign pushed to Q4",
              body: "Marked 'At Risk' on the roadmap; the linked spec page shows engineering re-scoped it after the payments migration ran long.",
            },
            {
              title: "Mobile offline mode delayed 3 weeks",
              body: "Status moved from 'On Track' to 'Blocked', waiting on the sync API.",
            },
            {
              title: "SSO for Enterprise still on track",
              body: "No date change, owned by Priya, targeted for Aug 30.",
            },
          ],
        },
        {
          heading: "Open discussion on the page",
          bullets: [
            {
              title: "2 unresolved comments",
              body: "Maya asked whether billing should swap priority with onboarding; no reply yet.",
            },
            {
              title: "Resourcing flag",
              body: "A comment from Tom notes the mobile team is one engineer short for the new timeline.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to update the roadmap page with a 'Status as of June 22' summary block at the top?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Pull answers from across your workspace",
        description:
          "Search every page and database, then open the exact one and read its blocks, comments, and properties so the agent works from what your team actually wrote.",
        toolMatches: [
          "search",
          "retrieve_page",
          "retrieve_block_children",
          "fetch_comments",
        ],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Draft and update pages for you",
        description:
          "Create new pages, append content, edit existing ones, and leave comments, so meeting notes, specs, and project updates land in Notion without manual copy-paste.",
        toolMatches: [
          "create_page",
          "add_page_content",
          "update_page",
          "create_comment",
        ],
      },
      {
        icon: "ActionDatabaseIcon",
        color: "golden",
        title: "Keep your databases in sync",
        description:
          "Query a database, add or update rows, and adjust its schema, so trackers, CRMs, and task boards stay current as work moves.",
        toolMatches: [
          "query_database",
          "insert_row_into_database",
          "update_row_database",
          "update_schema_database",
        ],
      },
    ],
  },
  google_sheets: {
    tagline: "Analyze and manipulate spreadsheet data with AI agents",
    faq: [
      {
        question: "Can Dust modify my Google Sheets?",
        answer:
          "Yes, with proper permissions, Dust agents can read, write, and update data in your Google Sheets.",
      },
    ],
    relatedIntegrations: ["microsoft_excel", "google_drive"],
    chatStoryline: {
      userPrompt:
        "Take the raw signups in the 'Imports' tab of my Q2 Leads spreadsheet, add a clean 'Qualified' worksheet, and drop in the rows where deal size is over $5k.",
      toolCalls: [
        "list_spreadsheets",
        "get_worksheet",
        "add_worksheet",
        "append_data",
      ],
      completedInSeconds: 14,
      responseIntro:
        "Done. I pulled your Q2 Leads spreadsheet from Google Sheets, filtered the imports, and built a clean qualified list.",
      responseSections: [
        {
          heading: "What I built",
          bullets: [
            {
              title: "Read 218 rows from 'Imports'",
              body: "Scanned the raw signups tab and parsed the Deal Size column to find qualifying leads.",
            },
            {
              title: "Created a 'Qualified' worksheet",
              body: "Added a new tab with the same headers so it stays consistent with your existing layout.",
            },
            {
              title: "Appended 47 qualifying rows",
              body: "Every row with a deal size above $5k was copied over, e.g. Northwind Retail ($12,400) and Acme Logistics ($7,900).",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to format the header row in bold and freeze it so the Qualified tab is presentation-ready?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Pull data from any spreadsheet",
        description:
          "Agents can locate the right spreadsheet, open a specific tab, and read its cells so you can ask questions about your data without hunting through files yourself.",
        toolMatches: ["list_spreadsheets", "get_spreadsheet", "get_worksheet"],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Build and update sheets for you",
        description:
          "From creating a brand-new spreadsheet to adding tabs, appending rows, writing cells, and clearing ranges, agents do the data entry and formatting work directly in Google Sheets.",
        toolMatches: [
          "create_spreadsheet",
          "add_worksheet",
          "append_data",
          "update_cells",
        ],
      },
      {
        icon: "ActionTableIcon",
        color: "golden",
        title: "Reorganize messy workbooks",
        description:
          "Rename, move, copy, or delete worksheets and reformat cells to turn a cluttered workbook into a clean, structured one ready to share.",
        toolMatches: [
          "rename_worksheet",
          "move_worksheet",
          "copy_sheet",
          "format_cells",
        ],
      },
    ],
  },
  microsoft_excel: {
    tagline: "Work with Excel data through AI-powered automation",
    faq: [
      {
        question: "Does Dust work with Excel files in OneDrive?",
        answer:
          "Yes, Dust can access and work with Excel files stored in your connected Microsoft OneDrive.",
      },
    ],
    relatedIntegrations: ["google_sheets", "microsoft_drive"],
    chatStoryline: {
      userPrompt:
        "Pull the Q2 numbers from our regional sales workbook and add a summary tab comparing each region to target.",
      toolCalls: [
        "list_excel_files",
        "read_worksheet",
        "create_worksheet",
        "write_worksheet",
      ],
      completedInSeconds: 14,
      responseIntro:
        "I opened your Microsoft Excel workbook, read the regional Q2 figures, and built a new summary worksheet comparing actuals to target.",
      responseSections: [
        {
          heading: "Q2 actuals vs. target by region",
          bullets: [
            {
              title: "North America",
              body: "$1.42M actual against a $1.30M target, 109% of plan and the top performer for the quarter.",
            },
            {
              title: "EMEA",
              body: "$980K actual against $1.10M target, 89% of plan and the only region trailing goal.",
            },
            {
              title: "APAC",
              body: "$1.05M actual against $1.00M target, 105% of plan with the strongest quarter-over-quarter growth.",
            },
          ],
        },
        {
          heading: "New Summary worksheet",
          bullets: [
            {
              title: "Created and populated",
              body: "Added a 'Q2 Summary' tab with region, actual, target, % of plan, and variance columns ready to chart.",
            },
            {
              title: "Variance flagged",
              body: "Total company actual of $3.45M lands 4% above the combined $3.40M target.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to add a variance column with conditional flags for any region under 95% of target?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Pull data from any workbook",
        description:
          "Locate the right file across your Excel library, list its tabs, and read exact cell ranges so the agent works from real worksheet values, not guesses.",
        toolMatches: ["list_excel_files", "get_worksheets", "read_worksheet"],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Build and update worksheets",
        description:
          "Write values into specific ranges, spin up brand-new tabs, and clear out stale cells so the agent can populate reports and models directly in your workbook.",
        toolMatches: ["write_worksheet", "create_worksheet", "clear_range"],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Turn rows into a summary",
        description:
          "Read across multiple tabs and write back a clean summary worksheet that rolls up totals, variances, and comparisons from your raw Excel data.",
        toolMatches: [
          "read_worksheet",
          "get_worksheets",
          "create_worksheet",
          "write_worksheet",
        ],
      },
    ],
  },
  monday: {
    tagline:
      "Automate project management workflows with Monday.com integration",
    faq: [
      {
        question: "Can Dust create items in Monday.com?",
        answer:
          "Yes, Dust agents can create, update, and manage items across your Monday.com boards.",
      },
    ],
    relatedIntegrations: ["jira", "notion", "slack"],
    chatStoryline: {
      userPrompt:
        "Pull every item on the Q3 Product Roadmap board that's still marked Stuck and tell me who owns each one.",
      toolCalls: [
        "get_boards",
        "get_items_by_column_value",
        "find_user_by_name",
      ],
      completedInSeconds: 12,
      responseIntro:
        "I checked the Q3 Product Roadmap board in Monday.com and pulled the items currently in a Stuck status.",
      responseSections: [
        {
          heading: "Stuck items (4)",
          bullets: [
            {
              title: "Checkout redesign",
              body: "Owner: Priya Shah - Stuck for 9 days, blocked on the payments API review.",
            },
            {
              title: "Mobile push notifications",
              body: "Owner: Marcus Lee - Stuck for 5 days, waiting on design sign-off.",
            },
            {
              title: "SSO for Enterprise",
              body: "Owner: Dana Okoro - Stuck for 12 days, dependency on the security audit.",
            },
          ],
        },
        {
          heading: "What stands out",
          bullets: [
            {
              title: "Oldest blocker",
              body: "SSO for Enterprise has been Stuck the longest at 12 days and sits on the critical path.",
            },
            {
              title: "Single owner overloaded",
              body: "Priya Shah owns 2 of the 4 Stuck items, both tied to the same payments dependency.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to post an update on the SSO item flagging the 12-day block and tagging the security reviewer?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Surface what's stuck or overdue",
        description:
          "Search across boards, filter items by any column value like status or owner, and read full item details so the agent answers questions about your work without you opening Monday.com.",
        toolMatches: [
          "search_items",
          "get_items_by_column_value",
          "get_board_items",
          "get_item_details",
        ],
      },
      {
        icon: "ActionListCheckIcon",
        color: "green",
        title: "Create and update items hands-free",
        description:
          "Spin up new items, subitems, and whole groups, change statuses and column values, rename items, and post updates so the agent keeps boards current as work moves.",
        toolMatches: [
          "create_item",
          "create_multiple_items",
          "update_item",
          "create_update",
        ],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Roll up board health and activity",
        description:
          "Pull board analytics and activity logs to summarize progress, spot bottlenecks, and report who changed what across a board over a given period.",
        toolMatches: [
          "get_board_analytics",
          "get_activity_logs",
          "get_board_values",
        ],
      },
    ],
  },
  slab: {
    tagline: "Connect your Slab knowledge base for AI-powered documentation",
    faq: [
      {
        question: "Can Dust access all my Slab content?",
        answer:
          "Dust can access the Slab content you choose to connect, respecting your existing permissions.",
      },
    ],
    relatedIntegrations: ["notion", "confluence"],
    chatStoryline: {
      userPrompt:
        "What's our current employee PTO and remote-work policy? Pull the official answer from Slab.",
      toolCalls: ["search_posts", "get_post_metadata", "get_post_contents"],
      completedInSeconds: 11,
      responseIntro:
        "I searched your Slab knowledge base and found the authoritative HR posts covering PTO and remote work.",
      responseSections: [
        {
          heading: "Source posts in Slab",
          bullets: [
            {
              title: "Time Off & PTO Policy",
              body: 'Last updated May 2026 by Dana Okafor (People Ops), filed under the "HR / Policies" topic. Marked as a verified post.',
            },
            {
              title: "Remote & Hybrid Work Guidelines",
              body: 'Last updated April 2026 by the People team, also under "HR / Policies" — so both are the current canonical versions, not drafts.',
            },
          ],
        },
        {
          heading: "What the policy says",
          bullets: [
            {
              title: "PTO",
              body: "20 days accrued annually, plus 11 company holidays; unused days roll over up to a 5-day cap into the next year.",
            },
            {
              title: "Remote work",
              body: "Fully remote-eligible roles can work from anywhere in an approved timezone band; hybrid roles are expected on-site Tuesdays and Thursdays.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to draft a short summary post you can publish under the HR topic so people stop asking in Slack?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Answer questions from your wiki",
        description:
          "Search across every Slab post and pull the full text of the most relevant ones, so agents answer policy, process, and onboarding questions straight from your knowledge base.",
        toolMatches: ["search_posts", "get_post_contents"],
      },
      {
        icon: "ActionListCheckIcon",
        color: "golden",
        title: "Verify the source is current",
        description:
          "Check each post's metadata — author, last-updated date, and assigned topics — so answers cite the canonical, up-to-date version instead of a stale draft.",
        toolMatches: ["get_post_metadata", "search_posts"],
      },
      {
        icon: "ActionTableIcon",
        color: "violet",
        title: "Navigate the topic hierarchy",
        description:
          "Read your Slab topic tree to map how documentation is organized, then drill into the posts within a topic like HR Policies or Engineering Runbooks.",
        toolMatches: ["get_topics", "get_post_contents"],
      },
    ],
  },
  productboard: {
    tagline:
      "Connect Productboard to enhance product management with AI insights",
    faq: [
      {
        question: "What is Productboard?",
        answer:
          "Productboard is a product management platform that helps teams understand user needs, prioritize features, and align everyone on the roadmap.",
      },
      {
        question: "Can Dust help with product decisions?",
        answer:
          "Yes, Dust can analyze feedback and feature requests in Productboard to help inform product decisions.",
      },
    ],
    relatedIntegrations: ["jira", "slack", "notion"],
    chatStoryline: {
      userPrompt:
        "We're scoping the Q3 roadmap. What are customers asking for around our reporting dashboards, and which features should I link that feedback to?",
      toolCalls: [
        "query_notes",
        "query_entities",
        "get_relationships",
        "create_note",
      ],
      completedInSeconds: 14,
      responseIntro:
        "I searched your Productboard notes and features for everything related to reporting dashboards and mapped the feedback to existing roadmap items.",
      responseSections: [
        {
          heading: "What customers are saying",
          bullets: [
            {
              title: "47 notes mention reporting",
              body: "Spanning sales calls, support tickets, and the in-app portal over the last 90 days, with 'export to CSV' and 'scheduled email reports' as the two loudest themes.",
            },
            {
              title: "Enterprise weighted heavily",
              body: "31 of the 47 notes come from accounts on the Enterprise plan, including Acme Corp and Northwind, raising the prioritization signal.",
            },
          ],
        },
        {
          heading: "How it maps to your roadmap",
          bullets: [
            {
              title: "Two existing features cover it",
              body: "'Dashboard CSV export' is in Discovery and 'Scheduled reports' has no feature yet; get_relationships shows 18 notes already linked to the export feature.",
            },
            {
              title: "Gap to close",
              body: "29 reporting notes are still unlinked to any feature, so the demand isn't showing up in your prioritization scores yet.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to create a 'Scheduled email reports' feature and link the 29 unattached notes to it so it scores correctly?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Surface what customers really want",
        description:
          "Search across thousands of feedback notes and roadmap entities to find the themes, mentions, and demand signals buried in your Productboard workspace.",
        toolMatches: [
          "query_notes",
          "query_entities",
          "get_note",
          "get_relationships",
        ],
      },
      {
        icon: "ActionGitBranchIcon",
        color: "green",
        title: "Turn feedback into roadmap items",
        description:
          "Capture new customer feedback as notes, create features and initiatives, and update entities so prioritization scores reflect the latest demand.",
        toolMatches: [
          "create_note",
          "create_entity",
          "update_entity",
          "update_note",
        ],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Trace demand to delivery",
        description:
          "Follow the links between notes, features, and initiatives to show which feedback drives each roadmap item and where evidence is still missing.",
        toolMatches: ["get_relationships", "query_notes", "get_configuration"],
      },
    ],
  },
  github: {
    tagline:
      "Connect GitHub to build AI agents that understand your codebase and workflows",
    faq: [
      {
        question: "Can Dust create GitHub issues?",
        answer:
          "Yes, Dust agents can create issues, comment on PRs, and manage labels through the GitHub integration.",
      },
      {
        question: "Does Dust have access to my private repositories?",
        answer:
          "Dust only accesses repositories you explicitly connect. You control which repos are synced.",
      },
    ],
    relatedIntegrations: ["jira", "confluence", "slack"],
    chatStoryline: {
      userPrompt:
        "Catch me up on the open PRs and issues blocking our v2.4 release in the api-gateway repo.",
      toolCalls: [
        "search_advanced",
        "list_pull_requests",
        "list_issues",
        "get_pull_request",
      ],
      completedInSeconds: 14,
      responseIntro:
        "Here's the current state of everything tagged for v2.4 across your GitHub repo:",
      responseSections: [
        {
          heading: "Pull requests awaiting review",
          bullets: [
            {
              title: "#812 Rate-limit middleware",
              body: "Open 4 days, 2 approvals, but failing the integration CI check — blocked on a flaky Redis test.",
            },
            {
              title: "#824 Refactor auth handler",
              body: "Requested changes from @maria, 1 unresolved review thread on token expiry logic.",
            },
            {
              title: "#829 Bump grpc to 1.62",
              body: "Approved and green — ready to merge, just needs a maintainer to hit the button.",
            },
          ],
        },
        {
          heading: "Issues still tagged v2.4",
          bullets: [
            {
              title: "#776 502s under load",
              body: "Labeled bug + priority:high, assigned to @devon, no update in 6 days.",
            },
            {
              title: "#791 Missing OpenAPI docs",
              body: "Labeled docs, unassigned — likely safe to defer past the release.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to comment on #812 asking the author to rerun the Redis CI job, and ping @devon for a status update on #776?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Triage issues and PRs in seconds",
        description:
          "Search across repos and pull the full picture of any pull request, issue, or discussion — review state, labels, comments, and custom fields — without clicking through tabs.",
        toolMatches: [
          "search_advanced",
          "list_pull_requests",
          "list_issues",
          "get_pull_request",
        ],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Move work forward, not just read it",
        description:
          "File issues, open discussions, leave a pull request review, and reply on threads directly from chat so follow-ups happen the moment you spot them.",
        toolMatches: [
          "create_issue",
          "create_pull_request_review",
          "comment_on_issue",
          "create_discussion",
        ],
      },
      {
        icon: "ActionDashboardIcon",
        color: "golden",
        title: "Keep roadmaps and projects current",
        description:
          "Pull organization project boards, add fresh issues onto the right board, and roll up open work into a release-readiness summary your team can act on.",
        toolMatches: [
          "list_organization_projects",
          "add_issue_to_project",
          "list_issues",
          "get_issue",
        ],
      },
    ],
  },
  jira: {
    tagline: "Integrate Jira for AI-powered issue tracking and project updates",
    faq: [
      {
        question: "Can Dust update Jira issues?",
        answer:
          "Yes, Dust agents can create, update, transition, and comment on Jira issues.",
      },
    ],
    relatedIntegrations: ["github", "confluence", "slack"],
    chatStoryline: {
      userPrompt:
        "What's blocking the Mobile App v3 release? Pull the open bugs assigned to the payments squad.",
      toolCalls: [
        "get_projects",
        "get_issues_using_jql",
        "get_issue",
        "get_transitions",
      ],
      completedInSeconds: 12,
      responseIntro:
        "I queried the Jira project for the Mobile App v3 release and found the blockers held by the payments squad.",
      responseSections: [
        {
          heading: "Open blockers (Mobile App v3)",
          bullets: [
            {
              title: "PAY-412 - Apple Pay token refresh fails on retry",
              body: "Priority: Highest, assignee Marta Reyes, status In Progress, flagged as a release blocker for 6 days.",
            },
            {
              title:
                "PAY-389 - Double charge on declined-then-retried checkout",
              body: "Priority: High, assignee Sam Okoro, status In Review, linked to incident INC-1187.",
            },
            {
              title: "PAY-401 - Currency rounding off by 0.01 in EUR carts",
              body: "Priority: Medium, assignee unassigned, status To Do, no fix version set yet.",
            },
          ],
        },
        {
          heading: "What this means for the release",
          bullets: [
            {
              title: "2 of 3 are actively worked",
              body: "PAY-412 and PAY-389 have owners; PAY-401 still needs an assignee before it can move.",
            },
            {
              title: "Next valid transitions",
              body: "PAY-389 can move from In Review to Done; PAY-412 can move to Ready for QA once the retry fix lands.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to assign PAY-401 to the payments squad lead and move PAY-389 to Done?",
    },
    benefits: [
      {
        icon: "ActionFilterIcon",
        color: "blue",
        title: "Surface blockers with JQL",
        description:
          "Run JQL queries across projects to pull exactly the issues you need - open blockers, overdue tickets, a sprint backlog - then read the full context of any issue including its comments and attachments.",
        toolMatches: [
          "get_issues_using_jql",
          "get_issues",
          "get_issue",
          "get_attachments",
        ],
      },
      {
        icon: "ActionListCheckIcon",
        color: "green",
        title: "Triage and move work forward",
        description:
          "File new issues, post comments, reassign or update fields, and transition tickets through your workflow - so agents can clear triage and keep boards current without manual clicking.",
        toolMatches: [
          "create_issue",
          "update_issue",
          "transition_issue",
          "create_comment",
        ],
      },
      {
        icon: "ActionGitBranchIcon",
        color: "golden",
        title: "Map dependencies and releases",
        description:
          "Link related issues, inspect link types, and review project versions to understand what blocks what and which fixes are scoped to an upcoming release.",
        toolMatches: [
          "create_issue_link",
          "get_issue_link_types",
          "get_project_versions",
          "get_project",
        ],
      },
    ],
  },
  confluence: {
    tagline:
      "Connect Confluence to make your documentation searchable and actionable",
    faq: [
      {
        question: "Can Dust create Confluence pages?",
        answer:
          "Yes, Dust agents can create and update Confluence pages through the API.",
      },
    ],
    relatedIntegrations: ["jira", "notion", "github"],
    chatStoryline: {
      userPrompt:
        "Draft a release notes page for v3.2 in our Product space and base it on the v3.1 page format",
      toolCalls: ["get_spaces", "get_pages", "get_page", "create_page"],
      completedInSeconds: 14,
      responseIntro:
        "I found your Product space in Confluence, matched the v3.1 release notes format, and drafted the new v3.2 page.",
      responseSections: [
        {
          heading: "What I pulled from Confluence",
          bullets: [
            {
              title: "Located the Product space",
              body: 'Found the "Product (PROD)" space and its "Release Notes" parent page among 38 pages.',
            },
            {
              title: "Matched the v3.1 template",
              body: "Reused the same section layout: Highlights, Fixes, Known Issues, and Upgrade Notes.",
            },
            {
              title: "Carried over conventions",
              body: 'Kept the version-date heading style and the labels "release" and "product-updates".',
            },
          ],
        },
        {
          heading: "Draft v3.2 release notes",
          bullets: [
            {
              title: "Highlights",
              body: "Added 4 placeholder highlights including SSO support and the redesigned dashboard.",
            },
            {
              title: "Fixes & known issues",
              body: "Scaffolded a fixes table (12 rows) and a known-issues section ready for your input.",
            },
          ],
        },
      ],
      followUpPrompt:
        'Want me to publish this page under the Release Notes parent and apply the "release" label?',
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Find the right page across spaces",
        description:
          "Agents can browse your spaces, list pages, and read full page content to surface the exact documentation, runbook, or meeting note you need without hunting through Confluence.",
        toolMatches: ["get_spaces", "get_pages", "get_page"],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Draft and update pages for you",
        description:
          "Agents can create new Confluence pages from a template or brief and update existing ones, so release notes, specs, and docs get written and kept current automatically.",
        toolMatches: ["create_page", "update_page", "get_page"],
      },
      {
        icon: "ActionDocumentTextIcon",
        color: "golden",
        title: "Summarize a space's knowledge",
        description:
          "Agents can pull pages across a space and condense them into a single brief or status page, turning scattered Confluence docs into a clear recap your team can act on.",
        toolMatches: ["get_spaces", "get_pages", "get_page", "create_page"],
      },
    ],
  },
  http_client: {
    tagline: "Make HTTP requests to external APIs and services",
    useCases: [
      {
        title: "API Integration",
        description:
          "Connect to any REST API to fetch data or trigger actions from your agents.",
        icon: "ActionCloudArrowLeftRightIcon",
      },
      {
        title: "Webhooks",
        description:
          "Send data to external services when certain events occur in your workflows.",
        icon: "ActionGlobeAltIcon",
      },
    ],
    faq: [
      {
        question: "Can I call any external API?",
        answer:
          "Yes, the HTTP client allows you to make requests to any accessible HTTP endpoint with custom headers and authentication.",
      },
    ],
    relatedIntegrations: ["val_town", "github"],
  },
  val_town: {
    tagline: "Run custom code and scripts with Val Town integration",
    faq: [
      {
        question: "What can I do with Val Town?",
        answer:
          "Val Town allows you to run serverless functions that can perform custom data processing, API calls, and complex logic.",
      },
    ],
    relatedIntegrations: ["http_client", "github"],
    chatStoryline: {
      userPrompt:
        "My Slack-notify val keeps timing out — find it, check the HTTP handler, and add a 5s fetch timeout.",
      toolCalls: [
        "search_vals",
        "list_val_files",
        "get_file_content",
        "update_file_content",
      ],
      completedInSeconds: 14,
      responseIntro:
        "I tracked down the failing val in Val Town, found the unbounded fetch in its HTTP handler, and patched it.",
      responseSections: [
        {
          heading: "What I found",
          bullets: [
            {
              title: "Val: slack-notify-webhook",
              body: "An HTTP val with 3 files — main.tsx, lib/format.ts, and deps.ts. The handler in main.tsx is the live endpoint receiving Slack events.",
            },
            {
              title: "Root cause",
              body: "Line 24 calls fetch(SLACK_URL) with no timeout, so a slow Slack response hangs the request until Val Town's execution limit kills it.",
            },
            {
              title: "Fix applied",
              body: "Wrapped the call with AbortSignal.timeout(5000) and added a try/catch that returns a 504 instead of hanging. Saved — redeployed live in ~100ms.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to spin off a small cron val that pings the endpoint every 5 minutes and alerts you if it 504s again?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Locate and read any val",
        description:
          "Search and browse your whole Val Town account, then open the exact file inside a val to read its handler, helpers, or dependencies.",
        toolMatches: [
          "search_vals",
          "list_vals",
          "list_val_files",
          "get_file_content",
        ],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Ship code that deploys live",
        description:
          "Create new vals and add, rewrite, or delete files inside them — every save redeploys to a live URL in milliseconds, no build step.",
        toolMatches: [
          "create_val",
          "create_file",
          "write_file",
          "update_file_content",
        ],
      },
      {
        icon: "ActionRocketIcon",
        color: "golden",
        title: "Trigger your deployed endpoints",
        description:
          "Call an HTTP val's live URL to test a webhook, run an API route, or fire a deployed function and inspect the real response.",
        toolMatches: ["call_http_endpoint", "get_val", "get_file_content"],
      },
    ],
  },
  salesforce: {
    tagline: "Connect Salesforce to automate CRM workflows with AI agents",
    faq: [
      {
        question: "Can Dust create Salesforce records?",
        answer:
          "Yes, Dust agents can create, update, and query Salesforce records including leads, accounts, contacts, and custom objects.",
      },
      {
        question: "Is my Salesforce data secure with Dust?",
        answer:
          "Yes, Dust is SOC 2 Type II certified and follows enterprise security best practices for data handling.",
      },
    ],
    relatedIntegrations: ["hubspot", "gmail", "slack"],
    chatStoryline: {
      userPrompt:
        "Which open opportunities closing this quarter are stuck — no activity in the last 14 days?",
      toolCalls: ["describe_object", "execute_read_query", "list_objects"],
      completedInSeconds: 12,
      responseIntro:
        "I queried your Salesforce Opportunity records and cross-checked their recent activity to find the deals that have gone quiet.",
      responseSections: [
        {
          heading: "Stalled opportunities closing this quarter",
          bullets: [
            {
              title: "Acme Corp — Enterprise Renewal",
              body: "$120,000, Stage: Negotiation, Close 6/30. Last activity 18 days ago, owner Priya Shah.",
            },
            {
              title: "Globex — Platform Expansion",
              body: "$85,000, Stage: Proposal, Close 6/28. Last activity 21 days ago, owner Tom Reyes.",
            },
            {
              title: "Initech — Add-on Seats",
              body: "$32,500, Stage: Negotiation, Close 6/24. Last activity 15 days ago, owner Priya Shah.",
            },
          ],
        },
        {
          heading: "Where the risk concentrates",
          bullets: [
            {
              title: "$237,500 at risk",
              body: "Three deals totaling $237.5K are within the close window with zero touches in two-plus weeks.",
            },
            {
              title: "Owner concentration",
              body: "Two of the three stalled deals belong to Priya Shah — worth a check-in on her pipeline.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to update these three opportunities with a follow-up task and a flag on the records so the owners get nudged?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Answer any CRM question in SOQL",
        description:
          "Ask in plain language about pipeline, accounts, leads, or cases — the agent inspects your object schema and runs SOQL reads to pull the exact records, fields, and totals you need.",
        toolMatches: ["execute_read_query", "describe_object", "list_objects"],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Keep records current automatically",
        description:
          "Create new leads, contacts, or opportunities and update existing records — stage changes, owner reassignments, field edits — directly from a conversation, no manual data entry.",
        toolMatches: ["create_object", "update_object", "describe_object"],
      },
      {
        icon: "ActionDocumentTextIcon",
        color: "golden",
        title: "Pull insight from attached files",
        description:
          "Surface and read the documents attached to accounts, opportunities, or cases — contracts, proposals, signed orders — so the agent can summarize terms and quote details without opening each record.",
        toolMatches: ["list_attachments", "read_attachment"],
      },
    ],
  },
  hubspot: {
    tagline: "Automate HubSpot workflows with AI-powered agents",
    faq: [
      {
        question: "Can Dust sync data with HubSpot?",
        answer:
          "Yes, Dust can read and write data to HubSpot including contacts, companies, deals, and custom properties.",
      },
    ],
    relatedIntegrations: ["salesforce", "gmail", "slack"],
    chatStoryline: {
      userPrompt:
        "Pull up everything on the deal with acme.com and log a note that we agreed on a Q3 pilot",
      toolCalls: [
        "get_object_by_email",
        "get_deal",
        "list_associations",
        "create_note",
      ],
      completedInSeconds: 12,
      responseIntro:
        "Here's the full picture from HubSpot on the Acme account, and I've logged your note on the deal.",
      responseSections: [
        {
          heading: "Acme Corp - deal status",
          bullets: [
            {
              title: "Deal: Acme Q3 Platform Expansion",
              body: "$48,000 - stage Decision Maker Bought-In, close date Sep 30. Owner: Dana Reyes.",
            },
            {
              title: "Associated contacts",
              body: "3 contacts linked, including Priya Shah (VP Eng, primary) and Tom Vance (Procurement).",
            },
            {
              title: "Last activity",
              body: "Meeting on Jun 18 - technical eval call. No open tasks on the record.",
            },
          ],
        },
        {
          heading: "Note logged",
          bullets: [
            {
              title: "Added to the deal timeline",
              body: '"Agreed on a Q3 pilot scope and timeline on the Jun 22 call." Visible to the deal owner now.',
            },
            {
              title: "Linked to the right record",
              body: "Note is attached directly to the Acme Q3 Platform Expansion deal, not just the contact.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to create a follow-up task for Dana to send the pilot agreement by Friday?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Look up any record instantly",
        description:
          "Find a contact, company, or deal by email or property, then pull its full details, associations, and meeting history without clicking through HubSpot.",
        toolMatches: [
          "get_object_by_email",
          "get_contact",
          "get_deal",
          "list_associations",
        ],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Log deals, notes, and tasks",
        description:
          "Create contacts, companies, and deals, then capture follow-ups by logging notes, tasks, and meetings and linking them to the right records.",
        toolMatches: [
          "create_deal",
          "create_contact",
          "create_note",
          "create_task",
        ],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Report on pipeline and campaigns",
        description:
          "Count CRM objects by property, export filtered records to CSV, and check marketing email performance to build pipeline and campaign reports.",
        toolMatches: [
          "count_objects_by_properties",
          "export_crm_objects_csv",
          "get_marketing_email_statistics",
        ],
      },
    ],
  },
  ashby: {
    tagline: "Connect Ashby ATS to streamline your hiring workflows with AI",
    faq: [
      {
        question: "Can Dust help with candidate screening?",
        answer:
          "Yes, Dust can analyze candidate data in Ashby and help with initial screening based on job requirements.",
      },
      {
        question: "What is Ashby?",
        answer:
          "Ashby is an all-in-one recruiting platform (ATS) that helps companies manage their hiring process from sourcing to offer.",
      },
    ],
    relatedIntegrations: ["slack", "gmail", "google_calendar"],
    chatStoryline: {
      userPrompt:
        "How is our Senior Backend Engineer opening tracking, and which active candidates have the strongest interview feedback so far?",
      toolCalls: [
        "list_openings",
        "search_candidates",
        "get_interview_feedback",
        "get_report_data",
      ],
      completedInSeconds: 13,
      responseIntro:
        "Here's where the Senior Backend Engineer opening stands in Ashby, with the candidates carrying the strongest feedback.",
      responseSections: [
        {
          heading: "Opening status",
          bullets: [
            {
              title: "Pipeline depth",
              body: "18 active candidates: 6 in Onsite, 4 in Technical Screen, 8 in Recruiter Screen.",
            },
            {
              title: "Velocity",
              body: "Median time from application to Onsite is 11 days, about 3 days faster than your other engineering reqs.",
            },
            {
              title: "Offer stage",
              body: "1 candidate in final review; the opening has been live for 24 days against a 35-day target.",
            },
          ],
        },
        {
          heading: "Strongest feedback",
          bullets: [
            {
              title: "Priya Nadkarni",
              body: "Onsite complete with 3 of 4 'Strong Hire' scorecards; system-design panel flagged her as the standout.",
            },
            {
              title: "Marcus Lee",
              body: "Technical screen rated 'Strong Hire'; reviewers noted clean problem decomposition and strong testing instincts.",
            },
            {
              title: "Dani Okafor",
              body: "Two 'Hire' scorecards so far, with the coding round still pending feedback from one interviewer.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to add a summary note to Priya's profile so the hiring manager has it before the debrief?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Vet candidates across the pipeline",
        description:
          "Search candidates against any open req, then pull their interview feedback and existing notes so you can see who is moving fastest and who has the strongest scorecards without opening every profile.",
        toolMatches: [
          "search_candidates",
          "get_interview_feedback",
          "get_candidate_notes",
          "list_openings",
        ],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Keep records and reqs current",
        description:
          "Capture debrief takeaways as candidate notes, log a new referral from a sourced lead, and update a job posting's details directly in Ashby as decisions are made.",
        toolMatches: [
          "create_candidate_note",
          "create_referral",
          "update_job_posting",
          "get_referral_form",
        ],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Turn recruiting data into answers",
        description:
          "Pull report and hiring data to track pipeline velocity, source quality, and offer outcomes, and review which postings are open across teams.",
        toolMatches: ["get_report_data", "get_hire_data", "list_job_postings"],
      },
    ],
  },
  salesloft: {
    tagline: "Integrate Salesloft for AI-enhanced sales engagement",
    faq: [
      {
        question: "Can Dust automate Salesloft tasks?",
        answer:
          "Yes, Dust can interact with Salesloft to help manage tasks, cadences, and contact engagement.",
      },
    ],
    relatedIntegrations: ["salesforce", "gmail", "hubspot"],
    chatStoryline: {
      userPrompt:
        "What Salesloft actions are due for me today, and which should I knock out first?",
      toolCalls: ["get_actions", "get_actions", "get_actions"],
      completedInSeconds: 11,
      responseIntro:
        "I pulled your due and overdue actions from Salesloft and grouped them so you can clear the highest-leverage ones first.",
      responseSections: [
        {
          heading: "Due today (14 actions)",
          bullets: [
            {
              title: "5 phone calls",
              body: "Including 2 overdue calls on the 'Enterprise Outbound' cadence to Priya Nair (Step 3) and Marcus Webb (Step 5).",
            },
            {
              title: "7 emails",
              body: "6 on 'Q2 Re-engagement' and 1 manual follow-up to Dana Liu, who replied yesterday but the step is still open.",
            },
            {
              title: "2 other tasks",
              body: "A LinkedIn touch and a 'send pricing one-pager' step, both on the 'Closing Push' cadence.",
            },
          ],
        },
        {
          heading: "Suggested order",
          bullets: [
            {
              title: "Start with the 2 overdue calls",
              body: "They are the oldest actions in your queue and both contacts are mid-cadence on your top opportunities.",
            },
            {
              title: "Then the Dana Liu follow-up",
              body: "She is your only engaged reply today, so striking while warm beats batching it with the cold emails.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to draft the follow-up email to Dana Liu so you can send it the moment you finish your calls?",
    },
    benefits: [
      {
        icon: "ActionListCheckIcon",
        color: "blue",
        title: "See every due action at a glance",
        description:
          "Pull all of a rep's currently due and overdue Salesloft actions across every cadence, so calls, emails, and tasks land in one prioritized view instead of buried in separate step queues.",
        toolMatches: ["get_actions", "get_actions"],
      },
      {
        icon: "ActionFireIcon",
        color: "golden",
        title: "Surface what is overdue and slipping",
        description:
          "Filter actions by due date to spot what is overdue, which cadences are stalling, and where contacts are going untouched, so nothing falls through before the next touch.",
        toolMatches: ["get_actions", "get_actions"],
      },
      {
        icon: "ActionTimeIcon",
        color: "violet",
        title: "Plan the day around the queue",
        description:
          "Group due actions by type and cadence to build a focused daily plan, batching calls together and clustering email steps so reps clear their Salesloft workload faster.",
        toolMatches: ["get_actions", "get_actions"],
      },
    ],
  },
  gong: {
    tagline: "Unlock insights from your Gong call recordings and analytics",
    faq: [
      {
        question: "Can Dust access my Gong recordings?",
        answer:
          "Yes, Dust can sync with Gong to access call transcripts and metadata for analysis.",
      },
    ],
    relatedIntegrations: ["salesforce", "slack"],
    chatStoryline: {
      userPrompt:
        "Pull up my discovery call with Northwind last week and tell me what objections came up and what we committed to.",
      toolCalls: ["list_calls", "get_call", "get_call_transcript"],
      completedInSeconds: 13,
      responseIntro:
        "I found your Northwind discovery call in Gong and read through the full transcript — here is what stood out.",
      responseSections: [
        {
          heading: "Objections raised",
          bullets: [
            {
              title: "Pricing vs. incumbent",
              body: "Their VP Ops, Dana Reyes, pushed back twice that your annual list price was roughly 20% above the tool they already use.",
            },
            {
              title: "Implementation timeline",
              body: "Concern that onboarding would take 'most of Q3' and pull their team off a migration already in flight.",
            },
            {
              title: "Security review",
              body: "They flagged that any new vendor needs to clear a SOC 2 review before procurement signs.",
            },
          ],
        },
        {
          heading: "Commitments made on the call",
          bullets: [
            {
              title: "You agreed to",
              body: "Send a tailored ROI estimate and loop in your solutions engineer for a technical deep-dive next week.",
            },
            {
              title: "They agreed to",
              body: "Share the security questionnaire by Friday and bring their CFO to the follow-up.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to scan your other Northwind calls and build a single objection-and-commitment timeline for the deal?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Find the right call in seconds",
        description:
          "List and filter calls by account, rep, or date range, then pull a single call's metadata to confirm participants, duration, and topic before diving in.",
        toolMatches: ["list_calls", "get_call"],
      },
      {
        icon: "ActionDocumentTextIcon",
        color: "violet",
        title: "Read full transcripts on demand",
        description:
          "Retrieve the complete word-for-word transcript of any call so an agent can quote exactly what a customer said, who said it, and when.",
        toolMatches: ["get_call", "get_call_transcript"],
      },
      {
        icon: "ActionLightbulbIcon",
        color: "golden",
        title: "Surface objections and commitments",
        description:
          "Comb across recent calls and their transcripts to extract recurring objections, competitor mentions, and the next steps both sides committed to.",
        toolMatches: ["list_calls", "get_call_transcript"],
      },
    ],
  },
  attio: {
    tagline: "Automate your Attio CRM workflows with AI agents",
    chatStoryline: {
      userPrompt: "Give me a recap of our sales performance last week.",
      toolCalls: [
        "search-records",
        "semantic-search-notes",
        "semantic-search-call-recordings",
        "search-meetings",
      ],
      completedInSeconds: 14,
      responseIntro:
        "Pulled your Attio workspace for last week's sales activity. Here's what stood out:",
      responseSections: [
        {
          heading: "New deals closed (3)",
          bullets: [
            {
              title: "Acme Corp — $45k",
              body: "Closed Tuesday. Owner: Sarah Chen. Sales cycle: 2 calls + 4 emails.",
            },
            {
              title: "Globex — $120k",
              body: "Multi-quarter expansion landed Friday. Tagged 'enterprise' in the deal record.",
            },
            {
              title: "Initech — $30k",
              body: "Quick close, inbound origin. No post-close notes attached yet.",
            },
          ],
        },
        {
          heading: "Stalled accounts (2)",
          bullets: [
            {
              title: "Hooli",
              body: "No activity in 14 days. Last touch was a discovery call on May 22.",
            },
            {
              title: "Pied Piper",
              body: "Engagement dropped after the demo. Status: pending, owner: Mark.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to draft follow-up tasks for Hooli and Pied Piper?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Pre-call account snapshot",
        description:
          "Before a call, get a 360° view of any account in one prompt — records, recent notes, meetings, calls, and emails, summarized.",
        toolMatches: [
          "search-records",
          "semantic-search-notes",
          "search-meetings",
          "semantic-search-emails",
        ],
      },
      {
        icon: "ActionDocumentTextIcon",
        color: "green",
        title: "Turn meeting notes into action",
        description:
          "Drop your raw notes into Dust and it writes them into Attio, creates follow-up tasks, and updates the deal's fields.",
        toolMatches: ["create-note", "create-task", "upsert-record"],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Weekly pipeline recap",
        description:
          "Ask Dust what closed, what's stalled, and what shifted this week — get the recap your team actually reads.",
        toolMatches: ["search-records", "list-attribute-definitions"],
      },
    ],
    faq: [
      {
        question: "What can Dust agents do in Attio?",
        answer:
          "Dust agents can read records, notes, meetings, calls, and emails; create records, notes, and tasks; and upsert records. They can pre-brief calls, write up post-call notes, and generate pipeline recaps.",
      },
      {
        question: "How does authentication work?",
        answer:
          "Attio uses OAuth. You'll be prompted to sign in with your Attio account and approve the requested scopes directly from the Dust chat.",
      },
    ],
    relatedIntegrations: ["salesforce", "hubspot", "gong"],
  },
  gmail: {
    tagline:
      "Connect Gmail to automate email workflows and extract insights from conversations",
    faq: [
      {
        question: "Can Dust send emails on my behalf?",
        answer:
          "Yes, with proper authorization, Dust agents can draft and send emails through your Gmail account.",
      },
      {
        question: "Does Dust read all my emails?",
        answer:
          "No, Dust only accesses emails that you explicitly include in your connected data sources.",
      },
    ],
    relatedIntegrations: ["outlook", "slack", "salesforce"],
    chatStoryline: {
      userPrompt:
        "Find the contract email from Acme legal this week, then draft a reply confirming we'll sign by Friday.",
      toolCalls: ["get_messages", "get_thread", "create_draft"],
      completedInSeconds: 12,
      responseIntro:
        "I searched your Gmail, pulled up the Acme thread, and prepared a reply draft for your review.",
      responseSections: [
        {
          heading: "What I found",
          bullets: [
            {
              title: "Matching message",
              body: '"Re: Master Services Agreement – final" from sarah.chen@acme-legal.com, received Tuesday at 9:14 AM, in a 6-message thread.',
            },
            {
              title: "Attachment present",
              body: "The latest message includes MSA_v4_signature.pdf (412 KB), the version awaiting countersignature.",
            },
            {
              title: "Open ask",
              body: "Sarah asked whether your side can return the signed copy before end of week.",
            },
          ],
        },
        {
          heading: "Draft prepared",
          bullets: [
            {
              title: "Reply saved to Drafts",
              body: '"Confirmed – we\'ll have the MSA signed and returned by Friday EOD. Thanks for the quick turnaround."',
            },
            {
              title: "Threaded correctly",
              body: "The draft is attached to the existing Acme thread so it keeps the full conversation history.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to send the reply now, or add the signed PDF as an attachment first?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Find any email or attachment fast",
        description:
          "Search across your inbox and threads to surface the exact message, conversation, or file you need, then pull down attachments without digging through Gmail manually.",
        toolMatches: [
          "get_messages",
          "get_thread",
          "get_attachment",
          "get_drafts",
        ],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Draft and send replies for you",
        description:
          "Compose drafts that stay attached to the right thread, clean up stale drafts, and send messages on your behalf once you approve the wording.",
        toolMatches: ["create_draft", "send_mail", "delete_draft"],
      },
      {
        icon: "ActionTagIcon",
        color: "golden",
        title: "Keep your inbox organized",
        description:
          "Apply, swap, or remove labels on messages and read your existing label set so important mail gets filed, triaged, and prioritized automatically.",
        toolMatches: ["get_labels", "set_message_labels", "get_messages"],
      },
    ],
  },
  outlook: {
    tagline: "Integrate Outlook for AI-powered email management",
    faq: [
      {
        question: "Does Dust work with Outlook?",
        answer:
          "Yes, Dust integrates with Microsoft Outlook for both email and calendar functionality.",
      },
    ],
    relatedIntegrations: ["gmail", "outlook_calendar", "microsoft_teams"],
    chatStoryline: {
      userPrompt:
        "Find the contract PDF Priya sent me last week and forward it to legal@acme.com with a short note.",
      toolCalls: [
        "get_messages",
        "get_attachments",
        "create_draft",
        "send_mail",
      ],
      completedInSeconds: 12,
      responseIntro:
        "I searched your Outlook inbox, pulled the attachment, and sent it on to legal.",
      responseSections: [
        {
          heading: "What I found and sent",
          bullets: [
            {
              title: "Located the message",
              body: 'Found "Re: Acme MSA - final redlines" from Priya Nair, received June 17, with one PDF attached (Acme_MSA_v4.pdf, 248 KB).',
            },
            {
              title: "Forwarded to legal",
              body: 'Sent the PDF to legal@acme.com with the note: "Sharing the latest Acme MSA from Priya for your review - signature block on p.12."',
            },
            {
              title: "Confirmed delivery",
              body: "Mail sent from your account at 9:42 AM; a copy is in your Sent Items folder.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to draft a reply to Priya letting her know it's been passed to legal?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Dig through mail and attachments",
        description:
          "Search your inbox, open full message bodies, and pull files off threads so the agent can find the email or document you need without you scrolling through folders.",
        toolMatches: [
          "get_messages",
          "get_message_body",
          "get_attachments",
          "list_folders",
        ],
      },
      {
        icon: "ActionMailIcon",
        color: "green",
        title: "Send and tidy your inbox",
        description:
          "Compose and send mail, prepare drafts for review, and move messages into the right folders to keep your Outlook inbox under control.",
        toolMatches: [
          "send_mail",
          "create_draft",
          "move_messages",
          "delete_draft",
        ],
      },
      {
        icon: "ActionUserGroupIcon",
        color: "violet",
        title: "Keep contacts current",
        description:
          "Look up, add, and update Outlook contacts as people change roles or you meet someone new, so your address book stays accurate.",
        toolMatches: ["get_contacts", "create_contact", "update_contact"],
      },
    ],
  },
  google_calendar: {
    tagline: "Connect Google Calendar for AI-powered scheduling assistance",
    faq: [
      {
        question: "Can Dust create calendar events?",
        answer:
          "Yes, Dust agents can create, update, and manage events on your Google Calendar.",
      },
    ],
    relatedIntegrations: ["outlook_calendar", "gmail", "slack"],
    chatStoryline: {
      userPrompt:
        "Set up a 30-min sync with Maya and Tom next week — find a slot that works for all of us and send the invite.",
      toolCalls: [
        "get_user_timezones",
        "check_availability",
        "list_events",
        "create_event",
      ],
      completedInSeconds: 12,
      responseIntro:
        "I checked everyone's Google Calendar availability for next week and booked the first slot that works for all three of you.",
      responseSections: [
        {
          heading: "Open slot found",
          bullets: [
            {
              title: "Tuesday, June 30, 10:30–11:00 AM PT",
              body: "Free for you, Maya, and Tom — no conflicts on any of your primary calendars.",
            },
            {
              title: "Time zones reconciled",
              body: "Tom is in EST, so this lands at 1:30 PM his time — flagged on the invite so no one shows up an hour off.",
            },
            {
              title: "Alternatives if needed",
              body: "Wed 9:00 AM PT and Thu 2:00 PM PT were also open across all three calendars.",
            },
          ],
        },
        {
          heading: "Invite sent",
          bullets: [
            {
              title: "Event created",
              body: '"Maya / Tom / You — Weekly Sync" added with a Google Meet link and all three attendees invited.',
            },
            {
              title: "Reminders set",
              body: "Default 10-minute pop-up notification applied for each guest.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to make this a recurring weekly event and add a short agenda to the description?",
    },
    benefits: [
      {
        icon: "ActionTimeIcon",
        color: "blue",
        title: "Find a slot that works for everyone",
        description:
          "Reconcile time zones and scan multiple people's calendars to surface conflict-free meeting times before you ever send an invite.",
        toolMatches: [
          "check_availability",
          "get_user_timezones",
          "list_events",
          "list_calendars",
        ],
      },
      {
        icon: "ActionCalendarIcon",
        color: "green",
        title: "Book and reschedule on autopilot",
        description:
          "Create events with attendees and reminders, push meetings when plans change, and clear cancellations off the calendar — all by asking.",
        toolMatches: ["create_event", "update_event", "delete_event"],
      },
      {
        icon: "ActionListCheckIcon",
        color: "golden",
        title: "Brief yourself on the week ahead",
        description:
          "Pull your upcoming events and the details of any meeting to get a clear read on what's scheduled and what each block is for.",
        toolMatches: ["list_events", "get_event", "list_calendars"],
      },
    ],
  },
  outlook_calendar: {
    tagline: "Integrate Outlook Calendar for scheduling automation",
    faq: [
      {
        question: "Can Dust access my Outlook Calendar?",
        answer:
          "Yes, Dust can read and write to your Outlook Calendar with proper authorization.",
      },
    ],
    relatedIntegrations: ["google_calendar", "outlook", "microsoft_teams"],
    chatStoryline: {
      userPrompt:
        "Find a 45-min slot next week where Priya, Marcus and I are all free and book a project kickoff.",
      toolCalls: [
        "get_user_timezone",
        "list_events",
        "check_availability",
        "create_event",
      ],
      completedInSeconds: 13,
      responseIntro:
        "I checked everyone's Outlook Calendar availability for next week and booked the kickoff in the first slot that works for all three of you.",
      responseSections: [
        {
          heading: "Common free slots (next week)",
          bullets: [
            {
              title: "Tue 24 Jun, 10:00-10:45 (CET)",
              body: "All three free. Picked this one — earliest mutual opening.",
            },
            {
              title: "Wed 25 Jun, 14:00-15:30",
              body: "Free, but Marcus has back-to-back meetings until 14:00.",
            },
            {
              title: "Thu 26 Jun, 9:00 onward",
              body: "Priya is out of office, so Thursday was ruled out.",
            },
          ],
        },
        {
          heading: "Event created",
          bullets: [
            {
              title: "Project Kickoff",
              body: "Tue 24 Jun, 10:00-10:45 CET. Invites sent to Priya and Marcus.",
            },
            {
              title: "Conflict check",
              body: "No overlaps found on any attendee's calendar before booking.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to add a Teams link and a short agenda to the event description?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Find open slots across calendars",
        description:
          "Pull upcoming events and check who's free or busy before proposing a time, accounting for each person's time zone so nothing lands at 6 a.m. for someone.",
        toolMatches: [
          "list_events",
          "check_availability",
          "check_self_availability",
          "get_user_timezone",
        ],
      },
      {
        icon: "ActionCalendarIcon",
        color: "green",
        title: "Book and reschedule meetings",
        description:
          "Create new events with attendees, move or update existing ones when plans change, and cancel meetings that no longer make sense.",
        toolMatches: ["create_event", "update_event", "delete_event"],
      },
      {
        icon: "ActionListCheckIcon",
        color: "golden",
        title: "Review your day and details",
        description:
          "Look across all your calendars and open up any single event to see attendees, location, and timing before a meeting starts.",
        toolMatches: ["list_calendars", "list_events", "get_event"],
      },
    ],
  },
  google_drive: {
    tagline:
      "Connect Google Drive to make your files searchable and accessible to AI agents",
    faq: [
      {
        question: "What file types does Dust support?",
        answer:
          "Dust can process Google Docs, Sheets, Slides, PDFs, and many other common file formats.",
      },
      {
        question: "Can Dust access shared drives?",
        answer:
          "Yes, Dust can access files in shared drives that you connect to your workspace.",
      },
    ],
    relatedIntegrations: ["microsoft_drive", "notion", "slack"],
    chatStoryline: {
      userPrompt:
        "Pull together the Q3 launch assets in our shared drive into a single brief doc for the leadership review",
      toolCalls: [
        "search_files",
        "get_document_structure",
        "get_spreadsheet",
        "create_document",
      ],
      completedInSeconds: 14,
      responseIntro:
        "I searched your Google Drive, pulled the latest Q3 launch files, and drafted a leadership brief that links back to each source.",
      responseSections: [
        {
          heading: "Source files found",
          bullets: [
            {
              title: "Q3 Launch Plan (Doc)",
              body: "Owned by Priya, last edited 2 days ago",
            },
            {
              title: "Launch Budget & Spend (Sheet)",
              body: "Actuals tab shows $182K of $200K used",
            },
            {
              title: "GTM Messaging v4 (Doc)",
              body: "3 open comments still unresolved",
            },
          ],
        },
        {
          heading: "New brief: 'Q3 Launch — Leadership Review'",
          bullets: [
            {
              title: "One-page summary",
              body: "Timeline, budget status, and the 3 open risks pulled from the source files",
            },
            {
              title: "Deep-linked sources",
              body: "Each section links back to the original file in the shared drive",
            },
            {
              title: "Saved and ready",
              body: "Placed in the 'Leadership' folder, ready to share",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to share the new brief with the leadership group and add a comment tagging Priya on the open messaging items?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Locate files across every shared drive",
        description:
          "Search by name, owner, or content across My Drive and shared drives, then pull the full text of any doc, sheet, or slide deck to actually read what's inside.",
        toolMatches: [
          "search_files",
          "list_drives",
          "get_file_content",
          "get_document_structure",
        ],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Draft and update docs in place",
        description:
          "Create new documents, spreadsheets, and presentations or edit existing ones, then leave comments and replies so collaborators get the context without leaving Drive.",
        toolMatches: [
          "create_document",
          "update_document",
          "append_to_spreadsheet",
          "create_comment",
        ],
      },
      {
        icon: "ActionLockIcon",
        color: "violet",
        title: "Audit and fix file sharing",
        description:
          "Review exactly who can access a file, grant or change permissions for the right people, and revoke sharing on anything that's been exposed too broadly.",
        toolMatches: [
          "list_file_permissions",
          "share_file",
          "update_file_permission",
          "revoke_file_sharing",
        ],
      },
    ],
  },
  microsoft_drive: {
    tagline: "Connect Microsoft OneDrive for cloud storage integration",
    faq: [
      {
        question: "Does Dust work with SharePoint?",
        answer:
          "Yes, Dust can access files stored in SharePoint through the Microsoft integration.",
      },
    ],
    relatedIntegrations: ["google_drive", "microsoft_excel"],
    chatStoryline: {
      userPrompt:
        "Find the latest signed MSA with Northwind in OneDrive and put a copy in the Closed Deals folder",
      toolCalls: [
        "search_drive_items",
        "search_in_files",
        "get_file_content",
        "copy_file",
      ],
      completedInSeconds: 13,
      responseIntro:
        "I searched your Microsoft OneDrive, confirmed the right version, and copied it into Closed Deals.",
      responseSections: [
        {
          heading: "What I found",
          bullets: [
            {
              title: "Matched file",
              body: "Northwind_MSA_v4_SIGNED.docx in /Contracts/2026 — last modified May 28, 2026.",
            },
            {
              title: "Confirmed it's the executed copy",
              body: "Full-text search found 'DocuSign Envelope ID' and both countersignatures inside the document, ruling out the v3 draft.",
            },
          ],
        },
        {
          heading: "Action taken",
          bullets: [
            {
              title: "Copied to destination",
              body: "Placed a copy in /Closed Deals/Northwind without touching the original in /Contracts/2026.",
            },
            {
              title: "No duplicates",
              body: "Checked the target folder first — no existing Northwind MSA there, so nothing was overwritten.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to rename the copy to follow your Closed Deals naming convention?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Locate the right file fast",
        description:
          "Search across your OneDrive by file name or by text inside documents, then pull the exact content you need so the agent reads the correct version instead of guessing.",
        toolMatches: [
          "search_drive_items",
          "search_in_files",
          "get_file_content",
          "list_drive_items",
        ],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Edit and file documents for you",
        description:
          "Update Word documents in place, upload new files, copy files into the right folder, and rename items to match your conventions — all without opening OneDrive.",
        toolMatches: [
          "update_word_document",
          "upload_file",
          "copy_file",
          "rename_drive_item",
        ],
      },
      {
        icon: "ActionListCheckIcon",
        color: "golden",
        title: "Keep folders clean and consistent",
        description:
          "Have the agent walk your folder structure, flag stray or misnamed files, and rename or relocate them so your OneDrive stays organized and easy to navigate.",
        toolMatches: [
          "list_drive_items",
          "rename_drive_item",
          "copy_file",
          "search_drive_items",
        ],
      },
    ],
  },
  zendesk: {
    tagline:
      "Connect Zendesk to automate support workflows and improve response times",
    faq: [
      {
        question: "Can Dust respond to Zendesk tickets?",
        answer:
          "Yes, Dust agents can draft responses and update ticket status in Zendesk.",
      },
    ],
    relatedIntegrations: ["intercom", "freshservice", "slack"],
    chatStoryline: {
      userPrompt:
        "A customer says their checkout keeps failing on ticket 48213 — pull it up and draft a reply.",
      toolCalls: [
        "get_ticket",
        "search_tickets",
        "draft_reply",
        "update_ticket_tags",
      ],
      completedInSeconds: 12,
      responseIntro:
        "I pulled ticket 48213 from Zendesk, checked for related reports, and drafted a reply for your review.",
      responseSections: [
        {
          heading: "Ticket 48213 — checkout failure",
          bullets: [
            {
              title: "Requester",
              body: "Maria Lopez (Pro plan), opened 2h ago, priority Normal, status Open.",
            },
            {
              title: "Pattern",
              body: "Found 4 other open tickets in the last 24h citing the same 'payment declined at checkout' error — likely a wider issue, not isolated.",
            },
            {
              title: "Suggested tags",
              body: "Proposed adding checkout-error and needs-engineering so it routes to the right queue.",
            },
          ],
        },
        {
          heading: "Drafted reply",
          bullets: [
            {
              title: "Tone",
              body: "Apologetic and concrete: acknowledges the failed checkout and asks for the exact error text and browser.",
            },
            {
              title: "Next step",
              body: "Flags that engineering is investigating a related issue, with an offer to apply a manual order workaround.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to post this reply to the customer and apply the checkout-error and needs-engineering tags?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Find the right tickets fast",
        description:
          "Search across your Zendesk tickets and open any one in full, including the requester, status, custom fields, and conversation history, without digging through views.",
        toolMatches: ["search_tickets", "get_ticket", "list_ticket_fields"],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Draft and send replies",
        description:
          "Draft an on-brand reply for review, then post it to the customer directly in the ticket once you approve the wording.",
        toolMatches: ["draft_reply", "post_reply"],
      },
      {
        icon: "ActionTagIcon",
        color: "golden",
        title: "Triage and route automatically",
        description:
          "Update ticket tags to categorize issues, surface patterns across similar tickets, and route them to the right team using your existing ticket fields.",
        toolMatches: [
          "update_ticket_tags",
          "search_tickets",
          "list_ticket_fields",
        ],
      },
    ],
  },
  freshservice: {
    tagline: "Integrate Freshservice for IT service management automation",
    faq: [
      {
        question: "Can Dust create Freshservice tickets?",
        answer:
          "Yes, Dust agents can create, update, and manage tickets in Freshservice.",
      },
    ],
    relatedIntegrations: ["zendesk", "slack", "jira"],
    chatStoryline: {
      userPrompt:
        "A user can't connect to the VPN after the latest update — open a ticket for them and check if we have a fix article already.",
      toolCalls: [
        "get_requester",
        "list_solution_articles",
        "create_ticket",
        "add_ticket_reply",
      ],
      completedInSeconds: 13,
      responseIntro:
        "Done — I checked Freshservice for an existing fix, then opened and replied to a ticket for the requester.",
      responseSections: [
        {
          heading: "Ticket created",
          bullets: [
            {
              title: "INC-4821 opened",
              body: "Subject: 'VPN connection fails after 6.4 client update' — logged against requester Maria Chen (maria.chen@acme.com), priority High, category Network.",
            },
            {
              title: "Reply sent to requester",
              body: "Posted the matching KB steps as the first public reply so Maria can try the workaround immediately while the agent investigates.",
            },
          ],
        },
        {
          heading: "Existing fix found",
          bullets: [
            {
              title: "Solution article #312 matches",
              body: "'Reauthenticate VPN after 6.4 update' — covers exactly this symptom and has resolved 40+ prior incidents.",
            },
            {
              title: "Linked in the reply",
              body: "Article steps were pasted into the ticket reply so the fix is one click away for the user.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to add an internal note assigning this to the Network team and tagging it for SLA tracking?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Find the fix before escalating",
        description:
          "Search solution articles, pull requester context, and read full ticket history so agents resolve incidents with known answers instead of starting from scratch.",
        toolMatches: [
          "list_solution_articles",
          "get_solution_article",
          "get_ticket",
          "get_requester",
        ],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Open and progress tickets",
        description:
          "Create tickets and tasks, post public replies or internal notes, and publish new solution articles — all without leaving the conversation.",
        toolMatches: [
          "create_ticket",
          "add_ticket_reply",
          "add_ticket_note",
          "create_solution_article",
        ],
      },
      {
        icon: "ActionShoppingBasketIcon",
        color: "golden",
        title: "Run the service catalog & ITSM",
        description:
          "Browse service items, departments, and SLA policies, and check approvals or on-call schedules to route requests and answer ops questions fast.",
        toolMatches: [
          "list_service_items",
          "get_service_item",
          "list_sla_policies",
          "list_oncall_schedules",
        ],
      },
    ],
  },
  front: {
    tagline: "Connect Front for AI-powered team inbox management",
    faq: [
      {
        question: "Can Dust help with Front conversations?",
        answer:
          "Yes, Dust can analyze Front conversations and suggest responses based on context.",
      },
    ],
    relatedIntegrations: ["zendesk", "gmail", "slack"],
    chatStoryline: {
      userPrompt:
        "We have a backlog of unassigned billing emails in the Support inbox — triage them and route each one to the right teammate.",
      toolCalls: [
        "search_conversations",
        "get_conversation_messages",
        "list_teammates",
        "assign_conversation",
      ],
      completedInSeconds: 14,
      responseIntro:
        "I went through the unassigned billing conversations in your Front Support inbox and routed each to the best-matched teammate.",
      responseSections: [
        {
          heading: "Triaged 8 unassigned billing conversations",
          bullets: [
            {
              title: "Refund & dispute requests (3)",
              body: "Assigned to Maya Chen, who handles all chargeback and refund cases.",
            },
            {
              title: "Invoice & PO questions (4)",
              body: "Routed to Diego Alvarez on the finance-ops rotation.",
            },
            {
              title: "Failed payment / card declines (1)",
              body: "Escalated to Priya Nair given the enterprise account ($24k ARR).",
            },
          ],
        },
        {
          heading: "Two flagged for your review",
          bullets: [
            {
              title: "Angry tone detected",
              body: 'A conversation from acme.co mentions "cancel our contract" — left unassigned and tagged for you.',
            },
            {
              title: "Possible duplicate thread",
              body: "Two emails from the same sender 20 minutes apart look like the same issue.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to add an internal comment on the acme.co thread summarizing the risk so whoever picks it up has context?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Triage the shared inbox fast",
        description:
          "Search across inboxes for the conversations that matter, read the full message thread, and pull a contact's prior interactions before anyone replies.",
        toolMatches: [
          "search_conversations",
          "get_conversation_messages",
          "get_customer_history",
          "get_contact",
        ],
      },
      {
        icon: "ActionShakeHandsIcon",
        color: "green",
        title: "Route and reply without leaving Front",
        description:
          "Assign conversations to the right teammate, draft and send replies, and move threads to the correct status so nothing stalls in the queue.",
        toolMatches: [
          "assign_conversation",
          "send_message",
          "create_draft",
          "update_conversation_status",
        ],
      },
      {
        icon: "ActionTagIcon",
        color: "violet",
        title: "Keep conversations organized",
        description:
          "Apply tags, attach reference links, and leave internal comments so every thread carries the context teammates need to follow up.",
        toolMatches: ["add_tags", "add_links", "add_comment", "list_tags"],
      },
    ],
  },
  intercom: {
    tagline: "Connect Intercom for AI-enhanced customer messaging",
    faq: [
      {
        question: "Can Dust respond to Intercom conversations?",
        answer:
          "Yes, Dust can help draft responses and manage conversations in Intercom.",
      },
    ],
    relatedIntegrations: ["zendesk", "slack"],
    chatStoryline: {
      userPrompt:
        "A customer named Sarah Chen keeps writing in about failed SSO logins. Pull her recent conversations and check if we have a help article that covers it.",
      toolCalls: [
        "search_contacts",
        "search_conversations",
        "get_conversation",
        "search",
      ],
      completedInSeconds: 13,
      responseIntro:
        "Here's what I found across Sarah's Intercom contact record, her recent conversations, and the help center.",
      responseSections: [
        {
          heading: "Sarah Chen's recent SSO conversations",
          bullets: [
            {
              title: "3 open conversations in 8 days",
              body: "All tagged 'login' and assigned to the Tier 2 queue; the latest is from this morning and still awaiting a reply.",
            },
            {
              title: "Recurring error",
              body: "Each thread mentions 'SAML assertion expired' after her Okta session refreshes, suggesting a clock-skew or session-timeout issue rather than a password problem.",
            },
            {
              title: "Plan context",
              body: "Her contact record shows she's an admin on the Acme Corp workspace (Enterprise plan), so this is a high-priority account.",
            },
          ],
        },
        {
          heading: "Matching help center coverage",
          bullets: [
            {
              title: "One relevant article",
              body: "'Troubleshooting SAML SSO timeouts' covers the expired-assertion error and recommends checking the IdP clock sync.",
            },
            {
              title: "Gap to flag",
              body: "The article doesn't mention Okta specifically, which is likely why Fin couldn't resolve it automatically for Sarah.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to draft a reply to Sarah's open conversation with the troubleshooting steps and a link to that article?",
    },
    benefits: [
      {
        icon: "ActionInboxIcon",
        color: "blue",
        title: "Trace a customer's full history",
        description:
          "Pull up any contact's record and surface every conversation they've had, so agents walk into a reply already knowing the account, the plan, and what's been tried.",
        toolMatches: [
          "search_contacts",
          "get_contact",
          "search_conversations",
          "get_conversation",
        ],
      },
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "violet",
        title: "Answer from your help center",
        description:
          "Search Intercom's help center and fetch full article content to ground replies in published guidance, and spot the topics where no article exists yet.",
        toolMatches: ["search", "fetch"],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Spot patterns across tickets",
        description:
          "Search and read conversations in bulk to surface recurring issues, common error messages, and accounts that keep writing in, turning raw inbox volume into a clear picture of what's breaking.",
        toolMatches: [
          "search_conversations",
          "get_conversation",
          "search_contacts",
        ],
      },
    ],
  },
  snowflake: {
    tagline: "Query your Snowflake data warehouse directly from AI agents",
    faq: [
      {
        question: "Can Dust write to Snowflake?",
        answer:
          "Dust can query Snowflake for read operations. Write permissions depend on your configuration.",
      },
      {
        question: "Is my Snowflake data secure?",
        answer:
          "Yes, Dust uses secure connections and follows enterprise security practices for data warehouse access.",
      },
    ],
    relatedIntegrations: ["bigquery", "databricks"],
    chatStoryline: {
      userPrompt:
        "What were our top 5 products by revenue last quarter? The sales data is somewhere in the ANALYTICS database.",
      toolCalls: ["list_schemas", "list_tables", "describe_table", "query"],
      completedInSeconds: 14,
      responseIntro:
        "I explored the ANALYTICS database in Snowflake, found the sales fact table, and ran the revenue query for last quarter.",
      responseSections: [
        {
          heading: "Top 5 products by Q1 2026 revenue",
          bullets: [
            {
              title: "Aurora Pro Headset",
              body: "$1.84M across 12,300 orders, up 22% from the prior quarter.",
            },
            {
              title: "Nimbus Standing Desk",
              body: "$1.51M, the highest average order value at $612.",
            },
            {
              title: "Vertex Mechanical Keyboard",
              body: "$980K, with the strongest repeat-purchase rate of the five.",
            },
          ],
        },
        {
          heading: "How I found it",
          bullets: [
            {
              title: "Located the data",
              body: "Used SALES_PROD schema, then the FACT_ORDER_LINES table joined to DIM_PRODUCT.",
            },
            {
              title: "Filtered to last quarter",
              body: "Summed NET_REVENUE where ORDER_DATE fell in 2026-01-01 to 2026-03-31, grouped by product.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to break the top 5 down by sales region or month so you can spot the trend?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Map your warehouse before you query",
        description:
          "Walk from databases down to schemas, tables, and column types so the agent grounds every question in the right object. No more guessing which table holds the data or how it is structured.",
        toolMatches: [
          "list_databases",
          "list_schemas",
          "list_tables",
          "describe_table",
        ],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Answer business questions in SQL",
        description:
          "Run real SELECT statements against your warehouse to pull revenue, usage, or cohort numbers, then get them back summarized in plain language instead of a raw result grid.",
        toolMatches: ["query", "describe_table"],
      },
      {
        icon: "ActionBrainIcon",
        color: "violet",
        title: "Query through your semantic layer",
        description:
          "Inspect Snowflake semantic views to read the governed metrics, dimensions, and join paths your team defined, so answers follow approved business logic rather than ad-hoc SQL.",
        toolMatches: ["describe_semantic_view", "query"],
      },
    ],
  },
  bigquery: {
    tagline: "Connect BigQuery to analyze your data warehouse with AI",
    useCases: [
      {
        title: "SQL Generation",
        description:
          "Let AI agents generate SQL queries based on natural language questions.",
        icon: "ActionTableIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust query BigQuery?",
        answer:
          "Yes, Dust can connect to your BigQuery datasets and run queries securely.",
      },
    ],
    relatedIntegrations: ["snowflake", "google_drive"],
  },
  databricks: {
    tagline: "Integrate Databricks for data and AI workload automation",
    faq: [
      {
        question: "Does Dust work with Databricks notebooks?",
        answer:
          "Dust can interact with Databricks SQL endpoints for data queries.",
      },
    ],
    relatedIntegrations: ["snowflake", "bigquery"],
    chatStoryline: {
      userPrompt:
        "Audit all our Databricks SQL warehouses and flag any that are oversized or set to never auto-stop.",
      toolCalls: ["list_warehouses", "list_warehouses", "list_warehouses"],
      completedInSeconds: 11,
      responseIntro:
        "I pulled the full inventory of SQL warehouses from your Databricks workspace and checked each one's size and auto-stop settings.",
      responseSections: [
        {
          heading: "Warehouse inventory (7 total)",
          bullets: [
            {
              title: "analytics-prod",
              body: "Serverless, Size 2X-Large, RUNNING, auto-stop 10 min",
            },
            {
              title: "finance-reporting",
              body: "Pro, Size Large, STOPPED, auto-stop 30 min",
            },
            {
              title: "data-science-sandbox",
              body: "Serverless, Size X-Large, RUNNING, auto-stop OFF",
            },
          ],
        },
        {
          heading: "Flagged for review",
          bullets: [
            {
              title: "Idle compute burning DBUs",
              body: "data-science-sandbox has auto-stop disabled and has been RUNNING idle — likely incurring cost around the clock.",
            },
            {
              title: "Scaling cap on production",
              body: "analytics-prod is sized 2X-Large but its cluster scaling is capped at 1, so it can't absorb concurrent query spikes.",
            },
            {
              title: "Legacy Classic warehouses",
              body: "etl-batch and adhoc-old are still provisioned on Classic and could move to Serverless for lower idle cost.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to draft a short summary of these findings with recommended sizes and auto-stop values to send to your platform team?",
    },
    benefits: [
      {
        icon: "ActionDatabaseIcon",
        color: "blue",
        title: "See every SQL warehouse at once",
        description:
          "Pull a complete inventory of your Databricks SQL warehouses with their type, size, state, and auto-stop settings, so nobody has to click through the workspace UI to know what compute exists.",
        toolMatches: ["list_warehouses", "list_warehouses"],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Spot idle and oversized compute",
        description:
          "Have an agent review warehouse sizing, scaling limits, and auto-stop configuration to surface the warehouses quietly driving up your DBU spend.",
        toolMatches: ["list_warehouses", "list_warehouses"],
      },
      {
        icon: "ActionCheckCircleIcon",
        color: "violet",
        title: "Keep warehouse config in line",
        description:
          "Check that every Databricks SQL warehouse follows your standards — Serverless where it should be, sensible auto-stop, no stragglers left running idle.",
        toolMatches: ["list_warehouses", "list_warehouses"],
      },
    ],
  },
  webcrawler: {
    tagline: "Crawl and index web content for your AI knowledge base",
    useCases: [
      {
        title: "Web Content Sync",
        description:
          "Automatically crawl and index content from websites and documentation.",
        icon: "ActionGlobeAltIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust crawl any website?",
        answer:
          "Dust can crawl publicly accessible websites that allow crawling. You can configure specific domains and pages to index.",
      },
    ],
    relatedIntegrations: ["notion", "confluence"],
  },
  vanta: {
    tagline: "Connect Vanta for security and compliance automation",
    faq: [
      {
        question: "Can Dust help with security compliance?",
        answer:
          "Yes, Dust can integrate with Vanta to help track and report on compliance status.",
      },
    ],
    relatedIntegrations: ["slack", "jira"],
    chatStoryline: {
      userPrompt:
        "We're a week out from our SOC 2 Type II audit — which controls have failing tests right now and what's blocking them?",
      toolCalls: [
        "list_frameworks",
        "list_framework_controls",
        "list_tests",
        "list_test_entities",
      ],
      completedInSeconds: 13,
      responseIntro:
        "I pulled your SOC 2 scope from Vanta and checked every control's test status — here's what still needs attention before the audit window.",
      responseSections: [
        {
          heading: "Controls with failing tests",
          bullets: [
            {
              title: "CC6.1 — Logical access",
              body: "Test 'MFA enforced on all admin accounts' is failing for 3 of 47 people; the rest of the control is passing.",
            },
            {
              title: "CC7.2 — Vulnerability monitoring",
              body: "Test 'Production hosts scanned in last 30 days' is failing on 2 EC2 instances that fell out of the agent's inventory.",
            },
            {
              title: "CC8.1 — Change management",
              body: "Test 'PRs require approval before merge' is failing on one repo where branch protection was disabled.",
            },
          ],
        },
        {
          heading: "Failing test entities to remediate",
          bullets: [
            {
              title: "3 accounts missing MFA",
              body: "j.okafor, devops-svc, and a contractor account flagged across the CC6.1 test entities.",
            },
            {
              title: "2 unscanned hosts",
              body: "prod-api-04 and prod-worker-02 have no scan evidence in the current test window.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to pull the owner and the affected document or policy for each failing control so you can route remediation today?",
    },
    benefits: [
      {
        icon: "ActionCheckCircleIcon",
        color: "blue",
        title: "Audit-readiness at a glance",
        description:
          "Pull your frameworks, their controls, and every automated test result so the agent can tell you exactly which controls are passing and which are blocking your next audit.",
        toolMatches: [
          "list_frameworks",
          "list_framework_controls",
          "list_controls",
          "list_tests",
        ],
      },
      {
        icon: "ActionScanIcon",
        color: "rose",
        title: "Triage risks and vulnerabilities",
        description:
          "Surface open risks and the vulnerabilities found across your monitored systems, then cross-reference the specific test entities behind each failing check to prioritize remediation.",
        toolMatches: [
          "list_risks",
          "list_vulnerabilities",
          "list_test_entities",
        ],
      },
      {
        icon: "ActionDocumentTextIcon",
        color: "golden",
        title: "Verify evidence and coverage",
        description:
          "Check which policies and documents back each control, confirm people are covered, and review the connected integrations producing your continuous compliance evidence.",
        toolMatches: [
          "list_documents",
          "list_control_documents",
          "list_people",
          "list_integrations",
        ],
      },
    ],
  },
  openai_usage: {
    tagline: "Monitor and analyze your OpenAI API usage",
    useCases: [
      {
        title: "Usage Analytics",
        description:
          "Track API costs, token usage, and performance metrics across your organization.",
        icon: "ActionPieChartIcon",
      },
    ],
    faq: [
      {
        question: "What can I learn from OpenAI usage data?",
        answer:
          "You can track costs, identify usage patterns, and optimize your API consumption.",
      },
    ],
    relatedIntegrations: ["slack"],
  },
  youtrust: {
    tagline:
      "Send documents for signature and chase what's outstanding — from one prompt",
    chatStoryline: {
      userPrompt:
        "Send our standard NDA to the three new vendors, then tell me what's still unsigned from last week.",
      toolCalls: [
        "search-templates",
        "create-signature-request-from-template",
        "send-signature-request",
        "search-signature-requests",
      ],
      completedInSeconds: 13,
      responseIntro:
        "I found your NDA template in Youtrust, drafted and sent a request to each vendor, then pulled last week's still-open signatures.",
      responseSections: [
        {
          heading: "Sent for signature (3)",
          bullets: [
            {
              title: "Acme Corp",
              body: "Drafted from the Mutual NDA template and sent to legal@acme.example — awaiting first open.",
            },
            {
              title: "Globex",
              body: "Sent to procurement@globex.example; two signers in sequence, reminders on by default.",
            },
            {
              title: "Initech",
              body: "Sent to ops@initech.example — single signer, expires in 14 days.",
            },
          ],
        },
        {
          heading: "Still awaiting signature (2)",
          bullets: [
            {
              title: "Order form #4187",
              body: "Open 8 days. The activity feed shows the signer opened it twice but hasn't signed.",
            },
            {
              title: "Consulting agreement #4172",
              body: "Open 11 days with no activity since it was sent — likely needs a nudge.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to send a reminder to the signers on the two outstanding requests?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "See what's still unsigned",
        description:
          "Ask which signature requests are pending, who is holding them up, and how long they have been open — Dust reads the request list and each request's activity feed.",
        toolMatches: [
          "search-signature-requests",
          "get-signature-request-activity-feed",
        ],
      },
      {
        icon: "ActionDocumentTextIcon",
        color: "green",
        title: "Send from a template in one prompt",
        description:
          "Point Dust at a Youtrust template — NDA, offer letter, order form — and it drafts the request and sends it to the right signers without leaving the conversation.",
        toolMatches: [
          "search-templates",
          "create-signature-request-from-template",
          "send-signature-request",
        ],
      },
      {
        icon: "ActionListCheckIcon",
        color: "golden",
        title: "Signature status recap",
        description:
          "Get a digest of what got signed, what is stalled, and what needs a nudge across all your active requests, pulled straight from the activity feeds.",
        toolMatches: [
          "search-signature-requests",
          "get-signature-request-activity-feed",
        ],
      },
    ],
    faq: [
      {
        question: "What can Dust agents do in Youtrust?",
        answer:
          "Dust can search your signature requests and templates, read a request's activity feed, and create and send new signature requests from an existing template.",
      },
      {
        question: "How does authentication work?",
        answer:
          "Youtrust uses OAuth 2.1 with dynamic client registration — you sign in with your Youtrust account and approve access directly from the Dust chat.",
      },
    ],
    relatedIntegrations: ["gmail", "google_drive", "notion"],
  },
  adomik: {
    chatStoryline: {
      userPrompt:
        "Our open-auction CPM dropped 14% last week on US display — what happened and how do we compare to the market?",
      toolCalls: [
        "jp_market_analyst",
        "confluence_search",
        "confluence_get_page",
        "confluence_get_page_children",
      ],
      completedInSeconds: 13,
      responseIntro:
        "Here's what Adomik's market data shows behind last week's US display CPM dip, cross-checked against your team's internal yield playbook.",
      responseSections: [
        {
          heading: "What the data shows",
          bullets: [
            {
              title: "CPM movement",
              body: "Open-auction CPM fell from $2.84 to $2.44 (-14%) week-over-week, while your overall market benchmark held at -3% — so the drop is specific to your supply, not the broader US programmatic market.",
            },
            {
              title: "Demand shift",
              body: "Two top buyers (a CPG and a retail brand) cut open-auction spend ~40% and moved budget into PMP deals, pulling high-CPM demand out of the open exchange.",
            },
            {
              title: "Channel mix",
              body: "PMP and programmatic-guaranteed held steady; the decline is concentrated in open-auction desktop 300x250 inventory.",
            },
          ],
        },
        {
          heading: "Against your playbook",
          bullets: [
            {
              title: "Floor guidance",
              body: "Your internal 'US Display Floor Strategy' page recommends not chasing CPM with reactive floor cuts when demand shifts to deals — current behavior matches a buyer reallocation, not undervaluation.",
            },
            {
              title: "Recommended next step",
              body: "Re-engage the two buyers on equivalent open-auction deal terms before adjusting floors, per the linked yield runbook.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to pull the named buyers and their PMP deal CPMs so you can prep the re-engagement outreach?",
    },
    benefits: [
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Explain revenue and CPM swings",
        description:
          "Ask JP, Adomik's market analyst, why your programmatic revenue, CPM, or win rates moved and get an answer benchmarked against the broader market — buyer shifts, channel mix changes, and demand trends, not just raw numbers.",
        toolMatches: ["jp_market_analyst", "confluence_search"],
      },
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Find the yield playbook fast",
        description:
          "Search your team's Confluence knowledge base for floor strategies, methodology docs, and monetization runbooks, then open the exact page so analysis follows your established practices.",
        toolMatches: ["confluence_search", "confluence_get_page"],
      },
      {
        icon: "ActionBrainIcon",
        color: "violet",
        title: "Ground analysis in your docs",
        description:
          "Combine Adomik's live market and revenue data with your internal documentation — JP reads the right Confluence pages and their child pages so recommendations reflect both market reality and your team's playbooks.",
        toolMatches: [
          "jp_market_analyst",
          "confluence_get_page",
          "confluence_get_page_children",
        ],
      },
    ],
  },
  amplitude: {
    chatStoryline: {
      userPrompt:
        "Why did our checkout conversion drop last week? Break it down by step and tell me where users are dropping off.",
      toolCalls: ["search", "get_charts", "query_chart", "get_session_replays"],
      completedInSeconds: 14,
      responseIntro:
        "I pulled your Amplitude checkout funnel and session replays for the affected window — here is where conversion is leaking.",
      responseSections: [
        {
          heading: "Funnel breakdown (last 7 days vs. prior 7)",
          bullets: [
            {
              title: "Cart to Shipping",
              body: "Held steady at 71% conversion, no meaningful change.",
            },
            {
              title: "Shipping to Payment",
              body: "Dropped from 64% to 48% — the single biggest contributor to the overall decline.",
            },
            {
              title: "Payment to Confirmation",
              body: "Slipped slightly from 89% to 85%, within normal weekly variance.",
            },
          ],
        },
        {
          heading: "What the session replays show",
          bullets: [
            {
              title: "Coupon field error",
              body: "In 12 of 20 sampled replays, users hit a silent validation error on the promo-code field and abandoned at the Payment step.",
            },
            {
              title: "Mobile Safari concentration",
              body: "The drop-off skews heavily to mobile Safari, suggesting a browser-specific rendering bug rather than a pricing issue.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to build a saved Amplitude dashboard tracking this funnel by browser so you can monitor the fix?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Investigate metric drops fast",
        description:
          "Pull existing charts, run ad-hoc funnel and segmentation queries, and watch the matching session replays to find exactly where and why a metric moved — without clicking through the Amplitude UI.",
        toolMatches: [
          "search",
          "get_charts",
          "query_chart",
          "get_session_replays",
        ],
      },
      {
        icon: "ActionLightbulbIcon",
        color: "golden",
        title: "Turn feedback into insights",
        description:
          "Summarize themes from surveys and support tickets, surface what users actually said, and tie feedback back to the behavioral cohorts and experiments it relates to for a complete picture.",
        toolMatches: [
          "get_feedback_insights",
          "get_feedback_comments",
          "get_feedback_mentions",
          "get_cohorts",
        ],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Build dashboards and experiments",
        description:
          "Spin up new charts, dashboards, cohorts, and A/B experiments directly from a conversation, so the analysis you just ran becomes a saved, shareable surface in Amplitude.",
        toolMatches: [
          "create_chart",
          "create_dashboard",
          "create_cohort",
          "create_experiment",
        ],
      },
    ],
  },
  apify: {
    chatStoryline: {
      userPrompt:
        "I need to scrape the pricing pages of our top 5 competitors and pull the data into a table.",
      toolCalls: [
        "search-actors",
        "fetch-actor-details",
        "call-actor",
        "get-dataset-items",
      ],
      completedInSeconds: 14,
      responseIntro:
        "I found the right tool in the Apify Store, ran it across all five competitor sites, and pulled the results from the dataset.",
      responseSections: [
        {
          heading: "What I ran",
          bullets: [
            {
              title: "Picked the Actor",
              body: "Searched the Store and selected Web Scraper (apify/web-scraper), confirming its input schema accepts a list of start URLs and CSS selectors before launching.",
            },
            {
              title: "Scraped all 5 sites",
              body: "Ran one job over the five pricing pages, rendering JavaScript so dynamically-loaded plans were captured. Run finished SUCCEEDED with 38 plan rows.",
            },
          ],
        },
        {
          heading: "Pricing data extracted",
          bullets: [
            {
              title: "Plan tiers and prices",
              body: "Acme Starter $29/mo, Pro $79/mo, Enterprise custom; Northwind charges $25 / $69 / $199 with no free tier.",
            },
            {
              title: "Notable differences",
              body: "3 of 5 competitors offer annual discounts of 15-20%; only one (Globex) advertises a free trial longer than 14 days.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to run this scrape on a schedule and abort any run that exceeds your time budget?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Find the right scraper instantly",
        description:
          "Search the Apify Store of thousands of Actors and inspect any Actor's input schema, docs, and pricing before you commit to running it.",
        toolMatches: [
          "search-actors",
          "fetch-actor-details",
          "search-apify-docs",
          "fetch-apify-docs",
        ],
      },
      {
        icon: "ActionRobotIcon",
        color: "green",
        title: "Run scrapers and crawl the web",
        description:
          "Launch any Store Actor with your parameters, or query Google and read top pages as clean Markdown with the RAG Web Browser, and abort a run the moment it goes off track.",
        toolMatches: [
          "call-actor",
          "apify--rag-web-browser",
          "abort-actor-run",
          "get-actor-run",
        ],
      },
      {
        icon: "ActionTableIcon",
        color: "golden",
        title: "Pull results into clean data",
        description:
          "Retrieve scraped records from an Actor's dataset with filtering and pagination, or read a specific value from its key-value store, ready to analyze or hand off.",
        toolMatches: [
          "get-dataset-items",
          "get-key-value-store-record",
          "get-actor-run",
        ],
      },
    ],
  },
  asana: {
    chatStoryline: {
      userPrompt:
        "What's the status of the Q3 Website Redesign project, and what's overdue?",
      toolCalls: [
        "search_objects",
        "get_project",
        "get_status_overview",
        "get_tasks",
      ],
      completedInSeconds: 12,
      responseIntro:
        "Here's where the Q3 Website Redesign project stands in Asana right now.",
      responseSections: [
        {
          heading: "Project status",
          bullets: [
            {
              title: "On track, slightly behind",
              body: "42 of 58 tasks complete (72%). Latest status update from Maya Chen flagged the project as At Risk on the homepage redesign milestone.",
            },
            {
              title: "Upcoming milestone",
              body: '"Design handoff to engineering" is due Jun 27, with 3 dependent tasks still in progress.',
            },
          ],
        },
        {
          heading: "Overdue tasks",
          bullets: [
            {
              title: "Finalize hero copy",
              body: "Assigned to Tom Reyes, due Jun 18 (4 days overdue).",
            },
            {
              title: "Mobile nav prototype review",
              body: "Assigned to Priya Nair, due Jun 20 (2 days overdue).",
            },
            {
              title: "Accessibility audit signoff",
              body: "Unassigned, due Jun 19 (3 days overdue).",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to reassign the unassigned accessibility audit and bump the overdue due dates to this Friday?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Find any task or project instantly",
        description:
          "Search across tasks, projects, and portfolios, then pull the full details, assignees, and due dates without clicking through Asana boards.",
        toolMatches: [
          "search_objects",
          "search_tasks",
          "get_task",
          "get_project",
        ],
      },
      {
        icon: "ActionListCheckIcon",
        color: "green",
        title: "Create and update work in flow",
        description:
          "Spin up new tasks and projects, then reassign owners, shift due dates, or move work between sections directly from the conversation.",
        toolMatches: [
          "create_task",
          "update_task",
          "create_project",
          "get_tasks",
        ],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Roll up portfolio health",
        description:
          "Read status overviews and portfolio items to summarize progress, surface at-risk projects, and brief leadership across every initiative.",
        toolMatches: [
          "get_status_overview",
          "get_portfolio",
          "get_items_for_portfolio",
          "get_portfolios",
        ],
      },
    ],
  },
  canva: {
    chatStoryline: {
      userPrompt:
        "Find our Q3 product launch deck in Canva and export it as a PDF I can email to the leadership team",
      toolCalls: [
        "search_designs",
        "get_design",
        "get_export_formats",
        "export_design",
      ],
      completedInSeconds: 14,
      responseIntro:
        "I found the launch deck in Canva, confirmed the available formats, and exported it as a PDF for you.",
      responseSections: [
        {
          heading: "Design located",
          bullets: [
            {
              title: "Q3 Product Launch — Leadership Review",
              body: "12-page presentation, last edited 2 days ago by Maya, in the Product Marketing folder.",
            },
            {
              title: "Format confirmed",
              body: "Checked available export formats and PDF Print was supported, so I exported at full resolution.",
            },
            {
              title: "Export ready",
              body: "Generated Q3-Product-Launch.pdf (12 pages, 8.4 MB) — download link is valid for 24 hours.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to drop a comment on the design tagging Maya so she knows the leadership PDF went out?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Locate any design instantly",
        description:
          "Search across your Canva account by keyword and pull a design's pages, text content, and folder structure so agents always work from the right file.",
        toolMatches: [
          "search_designs",
          "get_design",
          "get_design_pages",
          "get_design_content",
        ],
      },
      {
        icon: "ActionCloudArrowLeftRightIcon",
        color: "green",
        title: "Export and import without the manual steps",
        description:
          "Bring external files in from a URL, organize them into folders, and export finished designs as PDF or image formats ready to share.",
        toolMatches: [
          "import_design_from_url",
          "export_design",
          "upload_asset_from_url",
          "move_item_to_folder",
        ],
      },
      {
        icon: "ActionSparklesIcon",
        color: "violet",
        title: "Generate on-brand designs from a prompt",
        description:
          "Turn a brief into fresh Canva design candidates and create the one you like, while keeping review moving with comments and replies.",
        toolMatches: [
          "generate_design",
          "create_design_from_candidate",
          "comment_on_design",
          "reply_to_comment",
        ],
      },
    ],
  },
  clari_copilot: {
    chatStoryline: {
      userPrompt:
        "Pull the last 3 discovery calls on the Acme renewal and tell me what objections came up about pricing.",
      toolCalls: ["search_calls", "get_call_details", "get_call_details"],
      completedInSeconds: 13,
      responseIntro:
        "I searched your Clari Copilot recordings for the Acme renewal and pulled the transcripts of the three most recent discovery calls.",
      responseSections: [
        {
          heading: "Pricing objections raised",
          bullets: [
            {
              title: "Per-seat cost vs. value",
              body: "On the Jun 9 call, Dana Reyes (VP Ops) pushed back twice on the $120/seat tier, asking how it compares to their current tool at $85.",
            },
            {
              title: "Budget timing",
              body: "Their procurement lead flagged that the renewal budget isn't locked until Q3, so an annual commitment now is a stretch.",
            },
            {
              title: "Discount expectation",
              body: "Across all three calls, Acme referenced the 15% multi-year discount you offered last cycle and expects it to carry over.",
            },
          ],
        },
        {
          heading: "Where the rep handled it well",
          bullets: [
            {
              title: "ROI reframe landed",
              body: "On the Jun 16 call, the rep tied pricing to 6 hours/week saved per seat, and Dana's tone shifted noticeably positive after.",
            },
            {
              title: "Open thread",
              body: "No one addressed the Q3 budget timing concern with a phased start date, which is still unresolved.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to pull the full transcript of the Jun 16 call so you can quote the exact ROI framing in your follow-up?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Find the call that matters",
        description:
          "Search across every recorded conversation to surface the right calls by account, rep, or topic without scrubbing through hours of recordings.",
        toolMatches: ["search_calls", "get_call_details"],
      },
      {
        icon: "ActionDocumentTextIcon",
        color: "golden",
        title: "Replay any call in seconds",
        description:
          "Locate a conversation, then pull its full transcript, participants, and recording details to recap what was said and what was committed.",
        toolMatches: ["search_calls", "get_call_details"],
      },
      {
        icon: "ActionUserGroupIcon",
        color: "violet",
        title: "Coach reps on real moments",
        description:
          "Find calls where a competitor, objection, or pricing question came up, then dig into the transcript to see exactly how the rep responded.",
        toolMatches: ["search_calls", "get_call_details"],
      },
    ],
  },
  contentsquare: {
    chatStoryline: {
      userPrompt:
        "Checkout conversion on our EU site dropped last week. What's killing it and which page is the worst offender?",
      toolCalls: [
        "list-projects",
        "computeFunnel",
        "getTopPageGroupsByLostConversions",
        "getTopErrorsByImpactOnGoal",
      ],
      completedInSeconds: 14,
      responseIntro:
        "I pulled the checkout funnel and friction data from your Contentsquare EU project. Here's where conversions are leaking.",
      responseSections: [
        {
          heading: "Where the funnel breaks",
          bullets: [
            {
              title: "Cart to Shipping is the cliff",
              body: "Step-through drops from 71% to 48% week over week, a 23-point fall concentrated entirely in this transition.",
            },
            {
              title: "Shipping page group is the worst offender",
              body: "The Shipping page group accounts for an estimated 4,180 lost conversions, more than the next three page groups combined.",
            },
          ],
        },
        {
          heading: "What's driving the drop",
          bullets: [
            {
              title: "A JS error is blocking the Continue button",
              body: "A 'promoCode is undefined' error fires on ~6% of Shipping sessions and maps directly to the checkout goal, with the highest impact-on-goal of any error.",
            },
            {
              title: "Mobile is hit hardest",
              body: "Sessions with this error convert at roughly one-third the rate of clean sessions, and the gap is widest on mobile Safari.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to log this as MCP feedback so the team can prioritize the Shipping-page error fix?",
    },
    benefits: [
      {
        icon: "ActionFilterIcon",
        color: "blue",
        title: "Pinpoint where conversions leak",
        description:
          "Build and analyze checkout or signup funnels, then surface the exact page groups and journeys losing you the most conversions across any project, goal, or segment.",
        toolMatches: [
          "computeFunnel",
          "getTopPageGroupsByLostConversions",
          "computeJourney",
          "list-projects",
        ],
      },
      {
        icon: "ActionFireIcon",
        color: "rose",
        title: "Find the friction killing revenue",
        description:
          "Rank the JavaScript errors and broken pages by their real impact, showing which ones hit sessions hardest, drag down a specific goal, or represent the biggest missed opportunity.",
        toolMatches: [
          "getTopErrorsByImpactOnGoal",
          "getTopErrorsByMissedOpportunity",
          "getTopErrorsBySessionsWithErrors",
          "getTopPagesBySessionsWithErrors",
        ],
      },
      {
        icon: "ActionLightbulbIcon",
        color: "golden",
        title: "Get guided next steps to measure",
        description:
          "Let the agent recommend the right mappings, goals, segments, and page groups to set up, then quantify their impact so you measure what actually moves engagement and conversion.",
        toolMatches: [
          "recommendGoals",
          "recommendSegments",
          "recommendMappings",
          "computeImpact",
        ],
      },
    ],
  },
  costory: {
    chatStoryline: {
      userPrompt:
        "Our AWS bill jumped about 20% week-over-week — figure out what drove it and who owns it.",
      toolCalls: ["query", "suggest_groupby", "list_events", "create_alert"],
      completedInSeconds: 14,
      responseIntro:
        "I pulled the spend from Costory, broke it down by the dimensions that moved, and lined it up against your deploys and incidents.",
      responseSections: [
        {
          heading: "What drove the increase",
          bullets: [
            {
              title: "EKS compute up $9,400/wk",
              body: "The jump is concentrated in the data-platform team's EKS clusters in us-east-1 — node count roughly doubled starting Tuesday.",
            },
            {
              title: "Correlated with a deploy",
              body: "Costory's event timeline shows a deploy event on Tuesday 09:14 that lines up with the step change, alongside a GPU autoscaling spike.",
            },
            {
              title: "Owner identified via tags",
              body: "Allocated to team:data-platform, env:prod via your existing tags — no unallocated/orphaned spend in this delta.",
            },
          ],
        },
        {
          heading: "Other movement",
          bullets: [
            {
              title: "Anthropic API +$1,200",
              body: "Steady climb across the week, not anomalous — tracking with feature launch usage.",
            },
            {
              title: "Everything else flat",
              body: "RDS, S3, and networking held within 2% of baseline.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to create an anomaly alert on data-platform EKS spend so this pings the team in Slack next time?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Trace any cost spike to its cause",
        description:
          "Query unified AWS, GCP, Azure, and AI spend, then drill down by team, service, region, or tag and overlay deploys, metrics, and incidents to see exactly what changed and why.",
        toolMatches: ["query", "list_metrics", "list_events", "get_context"],
      },
      {
        icon: "ActionLightbulbIcon",
        color: "golden",
        title: "Get guided cost investigations",
        description:
          "Let the agent suggest the right group-bys, usage metrics, and next drill-downs so you reach the driver of a spend change without knowing Costory's data model by heart.",
        toolMatches: [
          "suggest_actions",
          "suggest_groupby",
          "suggest_usage_metrics",
        ],
      },
      {
        icon: "ActionDashboardIcon",
        color: "green",
        title: "Stand up dashboards and alerts",
        description:
          "Build cost dashboards, set anomaly and threshold alerts, log events, and schedule team reports so cost context lands in your workspace instead of waiting in a console.",
        toolMatches: [
          "create_dashboard",
          "create_alert",
          "create_report",
          "create_event",
        ],
      },
    ],
  },
  datadog: {
    chatStoryline: {
      userPrompt:
        "Checkout latency spiked around 14:00 UTC — what's going on with the payments service?",
      toolCalls: ["get_metrics", "list_incidents", "search_logs", "get_trace"],
      completedInSeconds: 14,
      responseIntro:
        "I pulled the latency metrics, open incidents, and error logs for the payments service from Datadog — here's what I found.",
      responseSections: [
        {
          heading: "What spiked",
          bullets: [
            {
              title: "p95 latency jumped to 2.4s",
              body: "payments-api p95 climbed from ~310ms to 2.4s between 13:58 and 14:12 UTC, then partially recovered.",
            },
            {
              title: "Open incident already filed",
              body: 'INC-4821 "Payments slow checkout" is at SEV-2, triggered by the latency monitor at 14:01 UTC.',
            },
            {
              title: "Errors point to the DB",
              body: 'search_logs shows a burst of 504s and "connection pool exhausted" on payments-api right at the spike.',
            },
          ],
        },
        {
          heading: "Likely root cause",
          bullets: [
            {
              title: "Slow downstream call in the trace",
              body: "A sampled trace shows 1.9s spent in a single Postgres query against the orders table — the rest of the request is fast.",
            },
            {
              title: "Correlates with a deploy",
              body: "The latency rise lines up with the 13:55 UTC payments-api rollout, suggesting a regression in that query path.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to post this timeline as an update on incident INC-4821 and tag the payments on-call?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Investigate incidents in seconds",
        description:
          "Pull the open incident, the failing service's latency and error metrics, raw logs, and a sampled trace to find the root cause without clicking through five Datadog views.",
        toolMatches: [
          "get_incident",
          "search_logs",
          "get_metrics",
          "get_trace",
        ],
      },
      {
        icon: "ActionDashboardIcon",
        color: "golden",
        title: "Get a live health snapshot",
        description:
          "Summarize the state of your environment by reading active monitors, dashboards, host inventory, and the count of hosts reporting in right now.",
        toolMatches: [
          "get_monitors",
          "list_dashboards",
          "list_hosts",
          "get_active_hosts_count",
        ],
      },
      {
        icon: "ActionGlobeAltIcon",
        color: "violet",
        title: "Watch real user experience",
        description:
          "Check synthetic test results and real-user-monitoring events alongside service spans to catch slow page loads and broken user journeys before customers complain.",
        toolMatches: [
          "get_synthetics_tests",
          "search_rum_events",
          "list_services",
          "list_spans",
        ],
      },
    ],
  },
  exa_people_and_company: {
    chatStoryline: {
      userPrompt:
        "Build me a list of US-based Series A fintech startups and the VP of Engineering at each one.",
      toolCalls: ["search_companies", "search_companies", "search_people"],
      completedInSeconds: 14,
      responseIntro:
        "I searched the live web with Exa and verified each match against your criteria — here's what I found:",
      responseSections: [
        {
          heading: "Matching fintech startups (Series A, US-based)",
          bullets: [
            {
              title: "Ledgerline (San Francisco, CA)",
              body: "Raised a $14M Series A in Q1; B2B payments infrastructure, ~40 employees.",
            },
            {
              title: "Vaultwise (New York, NY)",
              body: "$11M Series A; embedded lending APIs, founded 2023.",
            },
            {
              title: "Northpeak (Austin, TX)",
              body: "$18M Series A; SMB treasury and cash-flow automation.",
            },
          ],
        },
        {
          heading: "VP of Engineering at each",
          bullets: [
            {
              title: "Ledgerline",
              body: "Priya Nair — VP Engineering, ex-Stripe, 12 yrs in payments.",
            },
            {
              title: "Vaultwise",
              body: "Marcus Webb — VP Engineering, previously eng lead at Plaid.",
            },
            {
              title: "Northpeak",
              body: "No VP Engineering listed publicly; closest match is Head of Platform, Dana Liu.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to enrich each contact with a verified work email and export the list to CSV?",
    },
    benefits: [
      {
        icon: "ActionBuildingIcon",
        color: "blue",
        title: "Build target company lists from the live web",
        description:
          "Describe the companies you want in plain English — industry, stage, funding, geography — and Exa searches the entire web to return verified matches, not a stale database slice.",
        toolMatches: ["search_companies", "search_people"],
      },
      {
        icon: "ActionUserGroupIcon",
        color: "violet",
        title: "Find the right people by role and background",
        description:
          "Surface specific people across the web by title, expertise, company, or career history — pulling from public profiles and bios rather than a fixed contact directory.",
        toolMatches: ["search_people", "search_companies"],
      },
      {
        icon: "ActionShakeHandsIcon",
        color: "green",
        title: "Map decision-makers to target accounts",
        description:
          "Pair company discovery with people search to build lead lists or account maps — find the companies that fit your criteria, then pinpoint the right contact at each one.",
        toolMatches: ["search_companies", "search_people"],
      },
    ],
  },
  fathom: {
    chatStoryline: {
      userPrompt:
        "Pull together everything the Acme team said about pricing across our calls this month",
      toolCalls: ["list_meetings", "get_transcript", "get_transcript"],
      completedInSeconds: 13,
      responseIntro:
        "I went through your Fathom recordings with Acme this month and pulled every moment pricing came up.",
      responseSections: [
        {
          heading: "Pricing signals from 3 Acme calls",
          bullets: [
            {
              title: "Budget ceiling named (Jun 4 call)",
              body: 'Their VP Ops, Dana Reyes, said they have "around 40K approved for this year" and would need finance sign-off above that.',
            },
            {
              title: "Per-seat pushback (Jun 11 call)",
              body: "Acme asked whether the per-seat model could shift to a flat platform fee since they expect headcount to grow fast in Q4.",
            },
            {
              title: "Competitor anchor (Jun 18 call)",
              body: 'They referenced a rival quote of "$12 a seat" and asked how our annual plan compares once onboarding is included.',
            },
          ],
        },
        {
          heading: "Where it points",
          bullets: [
            {
              title: "Annual + flat-fee angle",
              body: "A flat platform tier framed against the 40K budget directly answers two of their three objections.",
            },
            {
              title: "Open thread",
              body: "No one has yet addressed the $12/seat competitor anchor on a call, this is still unhandled.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to draft a pricing recap email to the Acme team quoting their exact words from these calls?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Search across every call",
        description:
          "Agents can browse your Fathom meeting history and pull the exact recording they need, by attendee, date, or topic, without you scrolling through a list of calls.",
        toolMatches: ["list_meetings", "get_transcript"],
      },
      {
        icon: "ActionDocumentTextIcon",
        color: "golden",
        title: "Mine full meeting transcripts",
        description:
          "Pull the complete word-for-word transcript of any recorded Fathom call so an agent can quote what was actually said, surface decisions, and trace who committed to what.",
        toolMatches: ["list_meetings", "get_transcript"],
      },
      {
        icon: "ActionListCheckIcon",
        color: "violet",
        title: "Turn calls into next steps",
        description:
          "Agents read transcripts across a set of meetings to extract action items, open questions, and follow-ups, turning hours of recordings into a clear list of what to do next.",
        toolMatches: ["list_meetings", "get_transcript"],
      },
    ],
  },
  gamma: {
    chatStoryline: {
      userPrompt:
        "Build a 10-slide investor pitch deck for our Series A using our brand theme, and put it in the Fundraising folder.",
      toolCalls: [
        "get_themes",
        "get_folders",
        "generate",
        "get_generation_status",
      ],
      completedInSeconds: 14,
      responseIntro:
        "Done — I generated your Series A pitch deck in Gamma using your brand theme and saved it to the Fundraising folder.",
      responseSections: [
        {
          heading: "What I created",
          bullets: [
            {
              title: "10-slide deck, on-brand",
              body: 'Applied your "Aurora Dark" theme from get_themes; cover, problem, solution, market, traction, business model, GTM, team, ask, and contact slides.',
            },
            {
              title: "Saved to the right place",
              body: 'Filed under the "Fundraising" folder (matched via get_folders) so it sits alongside your data room materials.',
            },
            {
              title: "Generation confirmed",
              body: "get_generation_status returned completed in ~12s; the deck is editable and ready to present or export.",
            },
          ],
        },
        {
          heading: "Suggested next edits",
          bullets: [
            {
              title: "Traction slide",
              body: "Placeholder shows $480K ARR and 22% MoM growth — swap in your live numbers.",
            },
            {
              title: "The ask",
              body: "Drafted a $5M raise at a $25M post; adjust to match your term sheet.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to generate a one-page executive summary from the same content using your investor-brief template?",
    },
    benefits: [
      {
        icon: "ActionRocketIcon",
        color: "green",
        title: "Generate decks from a prompt",
        description:
          "Turn a topic or brief into a full presentation, document, or site in seconds, then start a templated version when you need consistent structure. The agent kicks off the build and confirms it finished.",
        toolMatches: [
          "generate",
          "generate_from_template",
          "get_generation_status",
        ],
      },
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Pull content from existing gammas",
        description:
          "List your gammas and read any one of them to reuse slides, copy, or structure — so agents can repurpose past decks instead of starting from a blank page.",
        toolMatches: ["get_gammas", "read_gamma"],
      },
      {
        icon: "ActionTagIcon",
        color: "violet",
        title: "Stay on-brand and organized",
        description:
          "Browse available themes to keep every deck visually consistent, and target the right folder so new gammas land where your team expects them.",
        toolMatches: ["get_themes", "get_folders"],
      },
    ],
  },
  gitlab: {
    chatStoryline: {
      userPrompt:
        "Why is the pipeline on MR !482 failing? Open an issue if it's a real bug.",
      toolCalls: [
        "get_merge_request",
        "get_merge_request_pipelines",
        "get_pipeline_jobs",
        "create_issue",
      ],
      completedInSeconds: 14,
      responseIntro:
        "I traced MR !482 through GitLab from the merge request down to the failing pipeline jobs.",
      responseSections: [
        {
          heading: "What broke",
          bullets: [
            {
              title: 'MR !482 — "Add Redis cache layer"',
              body: "Latest pipeline #19204 failed on the `test:integration` stage; the `build` and `lint` stages passed.",
            },
            {
              title: "Failing job: test:integration (#88213)",
              body: "Job log ends on `ConnectionRefusedError: Redis at redis:6379` — the service container never came up, not a code defect in the diff.",
            },
            {
              title: "Pattern",
              body: "The two prior pipelines on this branch failed at the same stage, pointing to a flaky `.gitlab-ci.yml` service config rather than the feature itself.",
            },
          ],
        },
        {
          heading: "Action taken",
          bullets: [
            {
              title: "Filed issue #1337",
              body: 'Opened "Redis service container fails to start in test:integration" with the job link, error excerpt, and the three affected pipeline IDs.',
            },
            {
              title: "Labeled and routed",
              body: "Tagged it `ci/cd` and `bug` so it lands in the platform team's triage board for !482.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to comment on MR !482 linking issue #1337 and flag it to the author?",
    },
    benefits: [
      {
        icon: "ActionScanIcon",
        color: "blue",
        title: "Debug failing pipelines fast",
        description:
          "Walk a merge request down to its pipelines and individual job logs to pinpoint exactly which stage failed and why, without clicking through the CI/CD UI.",
        toolMatches: [
          "get_merge_request",
          "get_merge_request_pipelines",
          "get_pipeline_jobs",
        ],
      },
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "golden",
        title: "Search code and issues by meaning",
        description:
          "Run keyword searches across your GitLab projects or use semantic code search to find the right function, config, or discussion even when you don't know the exact terms.",
        toolMatches: ["gitlab_search", "semantic_code_search"],
      },
      {
        icon: "ActionGitBranchIcon",
        color: "green",
        title: "Open issues and MRs in flow",
        description:
          "Turn a finding into action by creating issues for confirmed bugs or opening merge requests, then read back their commits and diffs to confirm the change.",
        toolMatches: [
          "create_issue",
          "create_merge_request",
          "get_merge_request_commits",
          "get_merge_request_diffs",
        ],
      },
    ],
  },
  granola: {
    chatStoryline: {
      userPrompt:
        "Pull together everything we discussed with Acme across our last three calls so I can prep tomorrow's renewal.",
      toolCalls: [
        "query_granola_meetings",
        "list_meetings",
        "get_meetings",
        "get_meeting_transcript",
      ],
      completedInSeconds: 13,
      responseIntro:
        "I searched your Granola notes for the Acme calls and pieced together the thread across all three meetings.",
      responseSections: [
        {
          heading: "Acme account — last 3 meetings",
          bullets: [
            {
              title: "Mar 4 — Discovery call",
              body: "Acme flagged that seat-based pricing was a blocker; Priya asked for an annual contract option.",
            },
            {
              title: "Apr 18 — Technical review",
              body: "Their security team needs SSO and SOC 2 docs before sign-off. You committed to sending both.",
            },
            {
              title: "May 30 — Pricing sync",
              body: "Verbal agreement on a 40-seat annual plan, pending legal review on the DPA.",
            },
          ],
        },
        {
          heading: "Open items heading into the renewal",
          bullets: [
            {
              title: "Still owed to Acme",
              body: "SOC 2 report (promised Apr 18, transcript shows it was never confirmed as sent).",
            },
            {
              title: "Their next step",
              body: "Legal to return redlines on the DPA — last mentioned May 30, no follow-up captured since.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to draft a renewal-prep brief from these notes you can drop into tomorrow's invite?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Recall any past meeting instantly",
        description:
          "Ask about a person, account, or topic and the agent searches every Granola meeting, then loads the full notes and transcript so nothing said on a call gets lost.",
        toolMatches: [
          "query_granola_meetings",
          "list_meetings",
          "get_meetings",
        ],
      },
      {
        icon: "ActionDocumentTextIcon",
        color: "golden",
        title: "Reconstruct the thread across calls",
        description:
          "Trace a deal or project across a series of meetings by pulling each meeting's notes and reading the exact transcript to see who said what and when.",
        toolMatches: [
          "list_meetings",
          "get_meetings",
          "get_meeting_transcript",
        ],
      },
      {
        icon: "ActionListCheckIcon",
        color: "violet",
        title: "Surface commitments and follow-ups",
        description:
          "Scan recent Granola meetings for decisions, owed deliverables, and open action items, verified against the transcript so the agent flags exactly what was promised.",
        toolMatches: [
          "query_granola_meetings",
          "get_meetings",
          "get_meeting_transcript",
        ],
      },
    ],
  },
  guru: {
    chatStoryline: {
      userPrompt:
        "Our refund window changed from 14 to 30 days. Find the support card that still says 14 days and fix it.",
      toolCalls: [
        "guru_search_documents",
        "guru_get_card_by_id",
        "guru_update_card",
        "guru_create_draft",
      ],
      completedInSeconds: 12,
      responseIntro:
        "I searched your Guru knowledge base, located the outdated refund card, and updated it with the new policy.",
      responseSections: [
        {
          heading: "Card found and corrected",
          bullets: [
            {
              title: "Refund Policy (Support)",
              body: "Card ID 7f3a-91c2, last verified 84 days ago by Dana Reyes. The body still read '14-day refund window'.",
            },
            {
              title: "Updated in place",
              body: "Replaced all three mentions of '14 days' with '30 days' and refreshed the eligibility example; re-verification request sent to the Support owner.",
            },
            {
              title: "Two related cards flagged",
              body: "'Returns FAQ' and the 'Onboarding: Billing' card also reference the old window and should be reviewed.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to draft updated versions of the two related cards so the owners just have to approve them?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Find the verified answer fast",
        description:
          "Search across your Guru Cards and connected sources, then pull a specific card by ID to read its exact content, owner, and verification status before you act.",
        toolMatches: [
          "guru_search_documents",
          "guru_get_card_by_id",
          "guru_list_knowledge_agents",
        ],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Keep knowledge current",
        description:
          "Correct stale cards in place or spin up draft cards from new insights, so a fix made once flows to every search surface and AI tool with citations intact.",
        toolMatches: ["guru_update_card", "guru_create_draft"],
      },
      {
        icon: "ActionBrainIcon",
        color: "golden",
        title: "Cited answers from your Agents",
        description:
          "Route a question to the right Knowledge Agent and get a grounded, permission-aware answer that shows which trusted content it was built from.",
        toolMatches: [
          "guru_list_knowledge_agents",
          "guru_answer_generation",
          "guru_search_documents",
        ],
      },
    ],
  },
  hex: {
    chatStoryline: {
      userPrompt:
        "Why did our self-serve signups dip last week? Spin up a Thread on the growth project and dig in.",
      toolCalls: [
        "search_projects",
        "get_thread",
        "create_thread",
        "continue_thread",
      ],
      completedInSeconds: 14,
      responseIntro:
        "I found the relevant Hex project, opened a Thread on it, and traced the signup dip across your warehouse data.",
      responseSections: [
        {
          heading: "What the Thread surfaced",
          bullets: [
            {
              title: "Signups down 18% WoW",
              body: "Self-serve signups fell from 2,410 to 1,977, concentrated entirely in the mobile web funnel.",
            },
            {
              title: "Drop-off at email verification",
              body: "Verification completion slid from 71% to 54% starting Jun 16, matching a deploy to the onboarding service.",
            },
            {
              title: "Paid channels unaffected",
              body: "Signups from paid and referral held flat, isolating the issue to the organic mobile path.",
            },
          ],
        },
        {
          heading: "Next analysis to run",
          bullets: [
            {
              title: "Segment by device + OS",
              body: "Continuing the Thread to break verification failures down by browser and OS version to confirm a client-side bug.",
            },
            {
              title: "Backed by a Hex notebook",
              body: "Every step is saved as a versioned Hex project your data team can open and extend in SQL or Python.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to continue this Thread and segment the verification drop-off by device and OS version?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Find the right Hex project fast",
        description:
          "Search across your workspace for the notebook or Thread that already answers a question, then open its analysis and conversation history instead of starting from scratch.",
        toolMatches: ["search_projects", "get_thread"],
      },
      {
        icon: "ActionChatBubbleBottomCenterTextIcon",
        color: "green",
        title: "Kick off analysis in a Thread",
        description:
          "Start a new Hex Thread on a question and let the agent query your warehouse, build the analysis, and save it as a versioned notebook project the data team can extend.",
        toolMatches: ["create_thread", "search_projects"],
      },
      {
        icon: "ActionGitBranchIcon",
        color: "golden",
        title: "Pick up where analysis left off",
        description:
          "Continue an existing Thread with follow-up questions, layering deeper segmentation and new charts onto prior work without losing context or the backing notebook.",
        toolMatches: ["continue_thread", "get_thread"],
      },
    ],
  },
  lemlist: {
    chatStoryline: {
      userPrompt:
        "Why is reply rate dropping on my Q2 Outbound campaign? Pull the numbers and tell me if it's a deliverability problem.",
      toolCalls: [
        "get_campaigns_stats",
        "get_campaign_sequences",
        "check_domain_health",
        "test_email_account",
      ],
      completedInSeconds: 13,
      responseIntro:
        "I dug into your Q2 Outbound campaign in Lemlist, comparing step-by-step engagement against your sending-account health.",
      responseSections: [
        {
          heading: "What the campaign stats show",
          bullets: [
            {
              title: "Reply rate fell from 6.8% to 2.1%",
              body: "The drop starts on May 12 across all 4 steps, not just one message variant.",
            },
            {
              title: "Open rate also dropped (54% to 31%)",
              body: "Opens falling alongside replies points to a deliverability issue, not weak copy.",
            },
            {
              title: "Step 1 is the worst hit",
              body: "First-touch opens cratered, suggesting messages are landing in spam before the sequence even starts.",
            },
          ],
        },
        {
          heading: "Deliverability check",
          bullets: [
            {
              title: "DMARC record missing on outbound.acme.com",
              body: "check_domain_health flags SPF and DKIM as passing but no DMARC policy, which Gmail now penalizes.",
            },
            {
              title: "Sending account alex@acme.com is over volume",
              body: "test_email_account shows it sending 180/day against a recommended ~80 while still warming up on lemwarm.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to preview a softer 3-step rewrite of the sequence and validate the campaign is ready to relaunch once DMARC is fixed?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Source and enrich leads on your ICP",
        description:
          "Search the lemleads B2B database by role, industry, company size, and location, then pull back verified emails and phone numbers from waterfall enrichment, all from a chat prompt.",
        toolMatches: [
          "lemleads_search",
          "get_lemleads_filters",
          "search_companies",
          "bulk_get_enrichment_results",
        ],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Diagnose campaign performance",
        description:
          "Break down open, reply, and bounce rates per campaign and per sequence step so you can see exactly which message or audience is underperforming and why.",
        toolMatches: [
          "get_campaigns_stats",
          "get_campaigns_reports",
          "get_campaign_sequences",
          "search_campaign_leads",
        ],
      },
      {
        icon: "ActionCheckCircleIcon",
        color: "green",
        title: "Protect deliverability before you send",
        description:
          "Run domain DNS checks (SPF, DKIM, DMARC), test each sending account against its warm-up volume, and validate a campaign is ready before it goes live.",
        toolMatches: [
          "check_domain_health",
          "test_email_account",
          "validate_campaign_readiness",
          "preview_sequence_update",
        ],
      },
    ],
  },
  linear: {
    chatStoryline: {
      userPrompt:
        "What's on my plate this week? Pull my open issues and flag anything blocking the Billing v2 project.",
      toolCalls: [
        "list_my_issues",
        "list_projects",
        "list_issues",
        "get_issue",
      ],
      completedInSeconds: 12,
      responseIntro:
        "Here's a snapshot of your assigned work in Linear and the items tied to the Billing v2 project.",
      responseSections: [
        {
          heading: "Your open issues",
          bullets: [
            {
              title: "BIL-214 - Migrate invoice webhooks",
              body: "In Progress, due Friday, high priority. Last updated 2 days ago.",
            },
            {
              title: "BIL-228 - Proration edge cases",
              body: "Todo, medium priority, no estimate set yet.",
            },
            {
              title: "ENG-91 - Flaky checkout test",
              body: "In Review, blocking the deploy queue.",
            },
          ],
        },
        {
          heading: "Billing v2 blockers",
          bullets: [
            {
              title: "BIL-201 is blocked",
              body: "Waiting on the payments team to confirm the new API contract.",
            },
            {
              title: "2 issues unestimated",
              body: "BIL-228 and BIL-233 have no estimates, putting the milestone date at risk.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to comment on BIL-201 to nudge the payments team for the API contract?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Triage issues without the click-through",
        description:
          "Ask for issues by assignee, status, label, or project and get the details back in one go - including a specific issue, its comments, and current status.",
        toolMatches: [
          "list_my_issues",
          "list_issues",
          "get_issue",
          "list_comments",
        ],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Capture work the moment it surfaces",
        description:
          "Turn a conversation into a tracked issue, update status or assignee, comment to keep teammates in the loop, and spin up new projects - all from chat.",
        toolMatches: [
          "create_issue",
          "update_issue",
          "create_comment",
          "create_project",
        ],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Read project health at a glance",
        description:
          "Pull a project's scope, owners, and progress alongside team and user details to see who owns what and where a milestone really stands.",
        toolMatches: ["get_project", "list_projects", "get_team", "list_users"],
      },
    ],
  },
  luma: {
    chatStoryline: {
      userPrompt:
        "Set up our July product launch event on Luma for next Thursday at 6pm and invite everyone from last month's beta dinner.",
      toolCalls: ["create_event", "list_guests", "add_guests", "send_invites"],
      completedInSeconds: 14,
      responseIntro:
        "Done — I created the launch event in Luma and pulled in your beta dinner guest list to invite.",
      responseSections: [
        {
          heading: "Event created",
          bullets: [
            {
              title: "July Product Launch",
              body: "Thursday, July 9 at 6:00 PM PT, registration page live and accepting RSVPs.",
            },
            {
              title: "Capacity & visibility",
              body: "Set to 120 spots, private event with approval required to keep the list curated.",
            },
          ],
        },
        {
          heading: "Guests invited",
          bullets: [
            {
              title: "47 guests added",
              body: "Imported every attendee from the June Beta Dinner, skipping 3 duplicates already on the list.",
            },
            {
              title: "Invites sent",
              body: "Invitations went out to all 47; you'll see RSVPs flow into the guest list as they respond.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to schedule a reminder invite to anyone who hasn't RSVP'd 48 hours before the event?",
    },
    benefits: [
      {
        icon: "ActionCalendarIcon",
        color: "green",
        title: "Spin up events in seconds",
        description:
          "Create new Luma event pages with dates, capacity, and location, then update details as plans change — all from a single agent prompt.",
        toolMatches: ["create_event", "update_event", "get_event"],
      },
      {
        icon: "ActionMailIcon",
        color: "blue",
        title: "Fill your guest list fast",
        description:
          "Add guests in bulk, send invitations, and update RSVP statuses so every event launches with the right people in the room.",
        toolMatches: [
          "add_guests",
          "send_invites",
          "update_guest_status",
          "list_guests",
        ],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Know who's actually coming",
        description:
          "Pull event insights and search across guests to track registrations, RSVPs, and attendance trends without leaving the chat.",
        toolMatches: [
          "get_event_insights",
          "search_guests",
          "get_guest",
          "list_events",
        ],
      },
    ],
  },
  miro: {
    chatStoryline: {
      userPrompt:
        "Summarize the sticky notes and decisions from our Q3 Roadmap Planning board and turn the action items into a tracking table.",
      toolCalls: [
        "context_explore",
        "board_list_items",
        "diagram_get_dsl",
        "table_create",
      ],
      completedInSeconds: 14,
      responseIntro:
        "I went through your 'Q3 Roadmap Planning' Miro board and pulled together the themes, decisions, and open action items.",
      responseSections: [
        {
          heading: "What the board captured",
          bullets: [
            {
              title: "Top themes from sticky notes",
              body: "Three clusters dominated: Onboarding revamp (12 notes), Billing reliability (9 notes), and Mobile parity (7 notes).",
            },
            {
              title: "Decisions locked in",
              body: "The flow diagram shows 'Self-serve checkout' moved to In Progress and 'Legacy importer' marked as deprecated for Q3.",
            },
            {
              title: "Open questions",
              body: "Two notes flagged red: dependency on the data migration timeline and unconfirmed design capacity.",
            },
          ],
        },
        {
          heading: "Action items extracted",
          bullets: [
            {
              title: "Owners assigned",
              body: "Maya owns the onboarding spec, Devin owns billing retries, Priya owns the mobile audit.",
            },
            {
              title: "Tracking table created",
              body: "I added a new table on the board with columns for Action, Owner, Theme, and Target week so the team can update it live.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to draft a follow-up diagram on the board showing the dependencies between these action items?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Read entire boards at once",
        description:
          "Agents walk a Miro board's structure, pull every sticky note and shape, read embedded docs, and decode diagrams into text so nothing on the canvas gets missed.",
        toolMatches: [
          "context_explore",
          "board_list_items",
          "doc_get",
          "diagram_get_dsl",
        ],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Build canvas content for you",
        description:
          "Generate new diagrams, write up docs, and spin up tables directly on a Miro board so plans, flows, and trackers appear ready for the team without manual layout work.",
        toolMatches: [
          "diagram_create",
          "doc_create",
          "table_create",
          "table_sync_rows",
        ],
      },
      {
        icon: "ActionTableIcon",
        color: "golden",
        title: "Turn board tables into data",
        description:
          "Read the rows of any Miro table and keep it in sync, so workshop output and tracked items can be summarized, analyzed, or pushed back as updates.",
        toolMatches: ["table_list_rows", "table_sync_rows", "doc_update"],
      },
    ],
  },
  napta: {
    chatStoryline: {
      userPrompt:
        "We just signed the Acme data-migration project starting July 7 in our Paris office. I need 2 senior data engineers with Python and Snowflake, 80% workload for 6 weeks. Who's available?",
      toolCalls: [
        "get_locations",
        "search_skills",
        "find_employees_matching_requirements",
        "simulate_prebooking",
      ],
      completedInSeconds: 14,
      responseIntro:
        "I checked Napta for available consultants matching the Acme data-migration requirements and pre-booked the best fits:",
      responseSections: [
        {
          heading: "Top matches in the Paris office",
          bullets: [
            {
              title: "Camille Dubois — 96% match",
              body: "Python + Snowflake certified, 4 prior data-migration engagements, 90% available from July 7.",
            },
            {
              title: "Thomas Leroy — 91% match",
              body: "Strong Python, Snowflake via near-skill (dbt), fully available for the 6-week window.",
            },
            {
              title: "Sofia Marchetti — 84% match",
              body: "Senior data engineer, Python expert, currently at 60% on Globex until July 18 (partial conflict).",
            },
          ],
        },
        {
          heading: "Pre-booking simulation",
          bullets: [
            {
              title: "No hard conflicts for Camille & Thomas",
              body: "Both stay under 100% workload across the July 7 – Aug 15 window at the requested 80%.",
            },
            {
              title: "Sofia would tip to 140% the first two weeks",
              body: "Napta flags the overlap; she's only viable if the start slips to July 21.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to create the Acme staffing request and confirm the assignments for Camille and Thomas in Napta?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Find the right consultant fast",
        description:
          "Search Napta by skill, certification, business unit, or location to surface available people, and let AI rank near-matching profiles against a project's exact requirements.",
        toolMatches: [
          "search_employees",
          "search_skills",
          "find_employees_matching_requirements",
          "get_locations",
        ],
      },
      {
        icon: "ActionGitBranchIcon",
        color: "green",
        title: "Staff projects end to end",
        description:
          "Open a staffing request, simulate a pre-booking or assignment to catch workload conflicts before they happen, then create and confirm the assignment in Napta.",
        toolMatches: [
          "create_request",
          "simulate_prebooking",
          "create_assignment",
          "confirm_assignment",
        ],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Balance workload and capacity",
        description:
          "Review current assignments and open requests across teams, simulate the impact of adding a person, and adjust assignment workloads to keep utilization healthy.",
        toolMatches: [
          "search_assignment",
          "search_requests",
          "simulate_assignment",
          "update_assignment_workload",
        ],
      },
    ],
  },
  netsuite: {
    chatStoryline: {
      userPrompt:
        "Pull our top 10 overdue customer invoices across all subsidiaries and tell me how much is past 60 days.",
      toolCalls: [
        "ns_getSubsidiaries",
        "ns_listSavedSearches",
        "ns_runSavedSearch",
        "ns_runCustomSuiteQL",
      ],
      completedInSeconds: 14,
      responseIntro:
        "Here's the overdue A/R picture pulled live from NetSuite across all three subsidiaries.",
      responseSections: [
        {
          heading: "Top overdue invoices",
          bullets: [
            {
              title: "INV-10428 — Acme Logistics",
              body: "$84,200 outstanding, 78 days past due (US subsidiary).",
            },
            {
              title: "INV-10391 — Northwind Retail",
              body: "$61,750 outstanding, 64 days past due (US subsidiary).",
            },
            {
              title: "INV-10355 — Belmont GmbH",
              body: "$47,900 outstanding, 52 days past due (EU subsidiary).",
            },
          ],
        },
        {
          heading: "Aging summary",
          bullets: [
            {
              title: "Past 60 days",
              body: "$214,300 across 4 invoices — 38% of total overdue balance.",
            },
            {
              title: "Total overdue",
              body: "$561,800 across the top 10, concentrated in the US subsidiary.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to flag the 4 invoices past 60 days by updating a follow-up status field on each record in NetSuite?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Query live ERP data on demand",
        description:
          "Run saved searches, custom SuiteQL queries, and reports against your NetSuite instance to pull invoices, orders, inventory, or any record without logging in. Look up a specific record or its field metadata in seconds.",
        toolMatches: [
          "ns_runSavedSearch",
          "ns_runCustomSuiteQL",
          "ns_runReport",
          "ns_getRecord",
        ],
      },
      {
        icon: "ActionPencilSquareIcon",
        color: "green",
        title: "Create and update records in flow",
        description:
          "Spin up new customers, sales orders, or vendor bills and update existing records — like setting a follow-up status or correcting a billing field — directly from the conversation.",
        toolMatches: ["ns_createRecord", "ns_updateRecord"],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Roll up financials across subsidiaries",
        description:
          "List subsidiaries, run financial reports, and combine results into consolidated views of revenue, A/R aging, or spend so you get a board-ready picture across your whole NetSuite OneWorld setup.",
        toolMatches: [
          "ns_getSubsidiaries",
          "ns_listAllReports",
          "ns_runReport",
          "ns_runCustomSuiteQL",
        ],
      },
    ],
  },
  power_bi: {
    chatStoryline: {
      userPrompt:
        "Our Q2 revenue dashboard looks stale and a stakeholder flagged numbers that don't match finance. Can you check it and refresh the data?",
      toolCalls: [
        "get_dashboards",
        "get_tiles",
        "get_datasets",
        "refresh_dataset",
      ],
      completedInSeconds: 14,
      responseIntro:
        "I inspected your Q2 revenue dashboard in Power BI, traced its tiles back to the underlying dataset, and triggered a refresh.",
      responseSections: [
        {
          heading: "What I found",
          bullets: [
            {
              title: "Stale dataset",
              body: 'The "Q2 Revenue" dashboard\'s tiles are bound to the "Sales Mart" dataset, whose last successful refresh was 9 days ago (June 13) — explaining the mismatch with finance.',
            },
            {
              title: "Affected tiles",
              body: '3 of 7 tiles pull from this dataset: "Revenue by Region," "MRR Trend," and "Net New ARR." The other 4 read from a separate, current dataset.',
            },
            {
              title: "Refresh triggered",
              body: 'I kicked off an on-demand refresh of "Sales Mart." It\'s now processing; the dashboard tiles will reflect updated figures once it completes.',
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to run a DAX query against the refreshed dataset to reconcile the regional revenue totals against finance's numbers?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Audit reports and dashboards",
        description:
          "Agents can enumerate your reports, dashboards, and the individual tiles within them to map what exists, what each visual depends on, and which datasets feed them.",
        toolMatches: [
          "get_reports",
          "get_dashboards",
          "get_tiles",
          "get_datasets",
        ],
      },
      {
        icon: "ActionTableIcon",
        color: "golden",
        title: "Answer questions with DAX",
        description:
          "Run DAX queries directly against your Power BI datasets to pull exact figures, reconcile numbers, and surface insights without opening the report.",
        toolMatches: ["get_datasets", "execute_queries"],
      },
      {
        icon: "ActionCloudArrowLeftRightIcon",
        color: "green",
        title: "Keep data current",
        description:
          "When a dataset is stale, agents trigger an on-demand refresh so dependent dashboards and reports show up-to-date numbers.",
        toolMatches: ["refresh_dataset", "get_datasets"],
      },
    ],
  },
  praiz: {
    chatStoryline: {
      userPrompt:
        "Pull the last few discovery calls with Acme Corp and tell me which objections came up and how the reps handled them.",
      toolCalls: [
        "search_videos",
        "get_video_transcript",
        "get_transcript_around",
        "list_comments",
      ],
      completedInSeconds: 13,
      responseIntro:
        "I went through your recent Acme Corp discovery calls in Praiz and pulled out the objections and how each rep responded.",
      responseSections: [
        {
          heading: "Objections raised across 3 Acme Corp calls",
          bullets: [
            {
              title: "Pricing vs. budget (raised twice)",
              body: "On the May 28 call (28:14), the buyer pushed back on per-seat pricing. Maria reframed around ROI and offered an annual plan, and the prospect agreed to review numbers internally.",
            },
            {
              title: "Integration with existing CRM",
              body: "On the June 4 call (15:40), the champion worried about Salesforce sync. Tom walked through the native integration but didn't share a concrete timeline, leaving the concern partly open.",
            },
            {
              title: "Security review / SOC 2",
              body: "Surfaced June 4 (41:02) and flagged in a teammate comment as a likely deal blocker that needs the security one-pager sent before next week's call.",
            },
          ],
        },
        {
          heading: "Coaching note",
          bullets: [
            {
              title: "Strong reframes on price",
              body: "Both reps handled the pricing objection well by anchoring on value rather than discounting.",
            },
            {
              title: "Follow-up gap",
              body: "The integration objection was never closed with a dated next step, which is the most common reason this deal stage stalls.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to draft a follow-up email to the Acme champion with the SOC 2 one-pager and a concrete integration timeline?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Find the moment in any call",
        description:
          "Search across every recorded meeting and jump to the exact spot in a transcript where a competitor, objection, or pricing question came up, without scrubbing through hours of video.",
        toolMatches: [
          "search_videos",
          "get_video_transcript",
          "get_transcript_around",
          "get_video_timeline",
        ],
      },
      {
        icon: "ActionLightbulbIcon",
        color: "golden",
        title: "Spot deal and coaching signals",
        description:
          "Read transcripts, comments, and participant context to surface churn risks, objections, and rep behaviors across a deal or a team's calls so managers can coach with evidence.",
        toolMatches: [
          "get_video_transcript",
          "list_comments",
          "list_participants",
          "list_videos",
        ],
      },
      {
        icon: "ActionTableIcon",
        color: "green",
        title: "Keep your CRM call data current",
        description:
          "Pull the structured fields Praiz extracts from calls, like deal stage, next steps, and qualification, using its templates so agents can sync clean meeting data into your CRM.",
        toolMatches: [
          "list_templates",
          "get_template_fields",
          "get_template_values",
          "get_video",
        ],
      },
    ],
  },
  semrush: {
    chatStoryline: {
      userPrompt:
        "We're losing organic traffic to competitor.com — figure out which keywords they're beating us on and whether it's a content or backlink gap.",
      toolCalls: [
        "overview_research",
        "organic_research",
        "keyword_research",
        "backlink_research",
      ],
      completedInSeconds: 14,
      responseIntro:
        "I pulled Semrush data for both domains and compared organic visibility, ranking keywords, and link profiles.",
      responseSections: [
        {
          heading: "Where competitor.com is winning",
          bullets: [
            {
              title: "Organic traffic gap",
              body: "competitor.com draws ~248K monthly organic visits vs. your ~176K, and ranks top-3 on 412 shared keywords where you sit on page 2.",
            },
            {
              title: "High-value keywords you're missing",
              body: "They own positions 1-3 for 'enterprise crm pricing' (8.1K vol, KD 64) and 'crm migration checklist' (3.6K vol, KD 41) — both with strong commercial intent and no ranking page on your side.",
            },
            {
              title: "Mostly a content gap, not links",
              body: "Their referring domains (4,920) only slightly lead yours (4,310), but they have 23 in-depth comparison pages targeting bottom-funnel terms you haven't covered.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to build a custom Semrush report tracking these 412 gap keywords so you can watch positions shift week over week?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Map competitor search strategy",
        description:
          "Pull a domain's organic and paid keywords, traffic estimates, and the subdomains and subfolders driving its visibility — so agents can reverse-engineer exactly how a competitor ranks.",
        toolMatches: [
          "overview_research",
          "organic_research",
          "subdomain_research",
          "subfolder_research",
        ],
      },
      {
        icon: "ActionListCheckIcon",
        color: "green",
        title: "Run audits and track rankings",
        description:
          "Crawl a site for technical SEO issues and monitor keyword positions across devices and locations from your Semrush projects, with results returned straight into the conversation.",
        toolMatches: [
          "siteaudit_research",
          "tracking_research",
          "projects_research",
        ],
      },
      {
        icon: "ActionTableIcon",
        color: "golden",
        title: "Find keywords and build custom reports",
        description:
          "Surface keyword volume, difficulty, and backlink profiles, then assemble tailored Semrush reports by discovering the right report schema and running it on demand.",
        toolMatches: [
          "keyword_research",
          "backlink_research",
          "get_report_schema",
          "execute_report",
        ],
      },
    ],
  },
  statuspage: {
    chatStoryline: {
      userPrompt:
        "We're seeing elevated 500s on the checkout API — open a major incident on our public status page and flag the Payments component as degraded.",
      toolCalls: [
        "list_pages",
        "list_components",
        "create_incident",
        "get_incident",
      ],
      completedInSeconds: 12,
      responseIntro:
        "Done — I opened a new incident on your public Statuspage and marked the affected component.",
      responseSections: [
        {
          heading: "Incident published",
          bullets: [
            {
              title: "Page",
              body: '"Acme Cloud Status" (acme.statuspage.io)',
            },
            {
              title: "Incident",
              body: '"Elevated errors on Checkout API" — status Investigating, impact Major',
            },
            {
              title: "Component",
              body: '"Payments API" set to Degraded Performance',
            },
          ],
        },
        {
          heading: "What subscribers see",
          bullets: [
            {
              title: "Initial update posted",
              body: '"We are investigating elevated 500 responses affecting checkout."',
            },
            {
              title: "Notifications sent",
              body: "Email and webhook subscribers notified automatically",
            },
            {
              title: "Shareable link",
              body: "Incident URL ready to drop into your support channels",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to post a follow-up update moving this incident to Identified once you've confirmed the root cause?",
    },
    benefits: [
      {
        icon: "ActionMegaphoneIcon",
        color: "green",
        title: "Open and update incidents fast",
        description:
          "Spin up a new incident on the right status page, set its impact and status, and post updates that notify your subscribers — all without leaving the agent.",
        toolMatches: ["create_incident", "update_incident", "list_pages"],
      },
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Check live status at a glance",
        description:
          "Pull the current state of any incident and list which components and pages exist, so you always know exactly what customers are seeing right now.",
        toolMatches: ["get_incident", "list_components", "list_pages"],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Review incident history",
        description:
          "List past and active incidents across your status pages to summarize recent outages, spot recurring component issues, and report on reliability.",
        toolMatches: ["list_incidents", "get_incident", "list_components"],
      },
    ],
  },
  stripe: {
    chatStoryline: {
      userPrompt:
        "We need to refund last month's duplicate charge for Acme Corp and pause their subscription while we sort out billing.",
      toolCalls: [
        "list_customers",
        "list_payment_intents",
        "create_refund",
        "update_subscription",
      ],
      completedInSeconds: 14,
      responseIntro:
        "I found Acme Corp in Stripe, located the duplicate charge, issued the refund, and paused their subscription.",
      responseSections: [
        {
          heading: "Refund issued",
          bullets: [
            {
              title: "Customer matched",
              body: "Acme Corp (cus_Qf3kZ2a) with two payment intents of $480.00 on May 14 — the second was a duplicate.",
            },
            {
              title: "Refund processed",
              body: "Refunded $480.00 against pi_3PqL9x2eZv to the original Visa card; funds typically arrive in 5-10 business days.",
            },
          ],
        },
        {
          heading: "Subscription paused",
          bullets: [
            {
              title: "Billing on hold",
              body: "Set Acme's subscription sub_1Pk8Qd to pause collection — no invoices will be generated until you resume it.",
            },
            {
              title: "Plan retained",
              body: "The Growth plan at $480/mo stays attached, so resuming keeps their existing pricing intact.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to send Acme a refund confirmation by drafting a follow-up invoice credit, or resume their subscription once billing is sorted?",
    },
    benefits: [
      {
        icon: "ActionMagnifyingGlassIcon",
        color: "blue",
        title: "Investigate any account in seconds",
        description:
          "Look up customers, payments, invoices, subscriptions, and disputes across your Stripe account to answer billing questions without digging through the dashboard.",
        toolMatches: [
          "list_customers",
          "list_payment_intents",
          "list_invoices",
          "list_subscriptions",
        ],
      },
      {
        icon: "ActionCardIcon",
        color: "green",
        title: "Run billing operations end to end",
        description:
          "Create customers, products, prices, and payment links, draft and finalize invoices, issue refunds, and update or cancel subscriptions — all directly from chat.",
        toolMatches: [
          "create_customer",
          "create_invoice",
          "finalize_invoice",
          "create_refund",
        ],
      },
      {
        icon: "ActionPieChartIcon",
        color: "golden",
        title: "Stay on top of revenue and risk",
        description:
          "Pull your live balance, scan open disputes, and review coupons and prices to keep tabs on cash flow and resolve chargebacks before deadlines hit.",
        toolMatches: [
          "retrieve_balance",
          "list_disputes",
          "update_dispute",
          "list_coupons",
        ],
      },
    ],
  },
  ukg_ready: {
    chatStoryline: {
      userPrompt:
        "I want to take next Thursday and Friday off — do I have enough vacation banked, and does it clash with my shifts?",
      toolCalls: [
        "get_my_info",
        "get_accrual_balances",
        "get_schedules",
        "create_pto_request",
      ],
      completedInSeconds: 12,
      responseIntro:
        "I checked your accrual balances and upcoming shifts in UKG Ready, and you're clear to book both days off.",
      responseSections: [
        {
          heading: "Your time-off eligibility",
          bullets: [
            {
              title: "Vacation balance",
              body: "32.0 hours available, accruing 4.6 hrs/pay period — well above the 16 hours these two days need.",
            },
            {
              title: "No schedule conflict",
              body: "You're rostered 8:00am-4:30pm on both Thu Jun 25 and Fri Jun 26; no critical coverage flags on those shifts.",
            },
            {
              title: "Balance after request",
              body: "You'd have 16.0 vacation hours remaining once these days are approved.",
            },
          ],
        },
      ],
      followUpPrompt:
        "Want me to submit the PTO request for Jun 25-26 to your manager now?",
    },
    benefits: [
      {
        icon: "ActionCalendarIcon",
        color: "green",
        title: "Book and manage time off in chat",
        description:
          "Submit, review, or cancel PTO requests straight from a conversation. The agent reads the notes and history on each request and files or withdraws days without you opening UKG Ready.",
        toolMatches: [
          "create_pto_request",
          "delete_pto_request",
          "get_pto_requests",
          "get_pto_request_notes",
        ],
      },
      {
        icon: "ActionPieChartIcon",
        color: "blue",
        title: "Check accruals before you commit",
        description:
          "Ask whether you have enough vacation, sick, or personal time banked and the agent pulls your live accrual balances and pending requests so you never over-book a leave type.",
        toolMatches: [
          "get_accrual_balances",
          "get_pto_requests",
          "get_my_info",
        ],
      },
      {
        icon: "ActionUserGroupIcon",
        color: "golden",
        title: "Spot coverage gaps across the team",
        description:
          "Cross-reference who reports where with upcoming shifts to see who is scheduled, who is out, and where a workday is left short-staffed before it happens.",
        toolMatches: ["get_employees", "get_schedules", "get_pto_requests"],
      },
    ],
  },
};
