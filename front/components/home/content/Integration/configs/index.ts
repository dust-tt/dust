import type { IntegrationEnrichment } from "../types";

// Integration enrichment configs
// Each key should match the integration slug from integrationRegistry.ts

export const integrationEnrichments: Record<string, IntegrationEnrichment> = {
  // ===== COMMUNICATION =====
  slack: {
    tagline:
      "Post messages, search conversations, and automate your Slack workflows",
    useCases: [
      {
        title: "Automated Updates",
        description:
          "Let AI agents post daily summaries, status updates, and alerts to relevant channels automatically.",
        icon: "ActionMegaphoneIcon",
      },
      {
        title: "Conversational Search",
        description:
          "Find past conversations, decisions, and shared information across all your Slack channels.",
        icon: "ActionMagnifyingGlassIcon",
      },
      {
        title: "Smart Notifications",
        description:
          "Set up intelligent alerts that notify the right people based on context and urgency.",
        icon: "ActionLightbulbIcon",
      },
    ],
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
    useCases: [
      {
        title: "Team Assistants",
        description:
          "Deploy AI assistants in Teams channels to answer questions and provide support.",
        icon: "ActionRobotIcon",
      },
      {
        title: "Meeting Prep",
        description:
          "Get AI-generated briefings and summaries before important meetings.",
        icon: "ActionDocumentTextIcon",
      },
    ],
    faq: [
      {
        question: "Does Dust work with Microsoft 365?",
        answer:
          "Yes, Dust integrates with the full Microsoft 365 suite including Teams, OneDrive, Outlook, and Excel.",
      },
    ],
    relatedIntegrations: ["slack", "outlook", "microsoft_drive"],
  },

  // ===== PRODUCTIVITY =====
  notion: {
    tagline:
      "Connect your Notion workspace to build AI agents that understand your documentation",
    useCases: [
      {
        title: "Documentation Search",
        description:
          "Let agents search through your entire Notion workspace to find relevant docs, wikis, and notes.",
        icon: "ActionMagnifyingGlassIcon",
      },
      {
        title: "Knowledge Base Assistant",
        description:
          "Build support agents that answer questions based on your Notion documentation.",
        icon: "ActionDocumentTextIcon",
      },
      {
        title: "Content Generation",
        description:
          "Use AI to draft new Notion pages based on templates and existing content patterns.",
        icon: "ActionLightbulbIcon",
      },
    ],
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
  },

  google_sheets: {
    tagline: "Analyze and manipulate spreadsheet data with AI agents",
    useCases: [
      {
        title: "Data Analysis",
        description:
          "Let AI agents analyze your spreadsheet data and generate insights automatically.",
        icon: "ActionPieChartIcon",
      },
      {
        title: "Report Generation",
        description:
          "Create automated reports that pull data from multiple sheets and sources.",
        icon: "ActionDocumentTextIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust modify my Google Sheets?",
        answer:
          "Yes, with proper permissions, Dust agents can read, write, and update data in your Google Sheets.",
      },
    ],
    relatedIntegrations: ["microsoft_excel", "google_drive"],
  },

  microsoft_excel: {
    tagline: "Work with Excel data through AI-powered automation",
    useCases: [
      {
        title: "Spreadsheet Automation",
        description:
          "Automate repetitive Excel tasks like data entry, formatting, and calculations.",
        icon: "ActionTableIcon",
      },
      {
        title: "Data Extraction",
        description:
          "Extract and analyze data from Excel files stored in your connected drives.",
        icon: "ActionScanIcon",
      },
    ],
    faq: [
      {
        question: "Does Dust work with Excel files in OneDrive?",
        answer:
          "Yes, Dust can access and work with Excel files stored in your connected Microsoft OneDrive.",
      },
    ],
    relatedIntegrations: ["google_sheets", "microsoft_drive"],
  },

  monday: {
    tagline:
      "Automate project management workflows with Monday.com integration",
    useCases: [
      {
        title: "Status Updates",
        description:
          "Get AI-generated project status updates across all your Monday boards.",
        icon: "ActionDocumentTextIcon",
      },
      {
        title: "Task Management",
        description:
          "Create and update tasks in Monday.com based on conversations and decisions.",
        icon: "ActionAtomIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust create items in Monday.com?",
        answer:
          "Yes, Dust agents can create, update, and manage items across your Monday.com boards.",
      },
    ],
    relatedIntegrations: ["jira", "notion", "slack"],
  },

  slab: {
    tagline: "Connect your Slab knowledge base for AI-powered documentation",
    useCases: [
      {
        title: "Internal Wiki Search",
        description:
          "Search across all your Slab posts and documentation with natural language queries.",
        icon: "ActionMagnifyingGlassIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust access all my Slab content?",
        answer:
          "Dust can access the Slab content you choose to connect, respecting your existing permissions.",
      },
    ],
    relatedIntegrations: ["notion", "confluence"],
  },

  // ===== DEVELOPMENT =====
  github: {
    tagline:
      "Connect GitHub to build AI agents that understand your codebase and workflows",
    useCases: [
      {
        title: "Code Understanding",
        description:
          "Build agents that can answer questions about your codebase, architecture, and patterns.",
        icon: "ActionGitBranchIcon",
      },
      {
        title: "Issue Management",
        description:
          "Automate issue triage, assignment, and status updates based on context.",
        icon: "ActionAtomIcon",
      },
      {
        title: "PR Summaries",
        description:
          "Generate summaries and changelog entries from pull request descriptions and commits.",
        icon: "ActionDocumentTextIcon",
      },
    ],
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
  },

  jira: {
    tagline: "Integrate Jira for AI-powered issue tracking and project updates",
    useCases: [
      {
        title: "Issue Creation",
        description:
          "Create Jira issues automatically from Slack conversations or support tickets.",
        icon: "ActionAtomIcon",
      },
      {
        title: "Sprint Reporting",
        description:
          "Generate sprint summaries and progress reports from Jira data.",
        icon: "ActionDocumentTextIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust update Jira issues?",
        answer:
          "Yes, Dust agents can create, update, transition, and comment on Jira issues.",
      },
    ],
    relatedIntegrations: ["github", "confluence", "slack"],
  },

  confluence: {
    tagline:
      "Connect Confluence to make your documentation searchable and actionable",
    useCases: [
      {
        title: "Documentation Search",
        description:
          "Search across all your Confluence spaces and pages with natural language.",
        icon: "ActionMagnifyingGlassIcon",
      },
      {
        title: "Knowledge Extraction",
        description:
          "Build agents that can answer questions based on your Confluence wiki.",
        icon: "ActionBrainIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust create Confluence pages?",
        answer:
          "Yes, Dust agents can create and update Confluence pages through the API.",
      },
    ],
    relatedIntegrations: ["jira", "notion", "github"],
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
    useCases: [
      {
        title: "Custom Logic",
        description:
          "Execute custom JavaScript/TypeScript functions for complex calculations or transformations.",
        icon: "ActionAtomIcon",
      },
    ],
    faq: [
      {
        question: "What can I do with Val Town?",
        answer:
          "Val Town allows you to run serverless functions that can perform custom data processing, API calls, and complex logic.",
      },
    ],
    relatedIntegrations: ["http_client", "github"],
  },

  // ===== CRM & SALES =====
  salesforce: {
    tagline: "Connect Salesforce to automate CRM workflows with AI agents",
    useCases: [
      {
        title: "Account Insights",
        description:
          "Get AI-generated summaries and insights about accounts and opportunities.",
        icon: "ActionBrainIcon",
      },
      {
        title: "Data Entry Automation",
        description:
          "Automatically create and update records from emails, calls, and conversations.",
        icon: "ActionCloudArrowLeftRightIcon",
      },
      {
        title: "Pipeline Analysis",
        description:
          "Analyze your sales pipeline and get recommendations for next actions.",
        icon: "ActionPieChartIcon",
      },
    ],
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
  },

  hubspot: {
    tagline: "Automate HubSpot workflows with AI-powered agents",
    useCases: [
      {
        title: "Contact Management",
        description:
          "Automatically update contact records and track interactions across channels.",
        icon: "ActionCloudArrowLeftRightIcon",
      },
      {
        title: "Marketing Insights",
        description:
          "Get AI-generated insights from your marketing campaigns and contact data.",
        icon: "ActionPieChartIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust sync data with HubSpot?",
        answer:
          "Yes, Dust can read and write data to HubSpot including contacts, companies, deals, and custom properties.",
      },
    ],
    relatedIntegrations: ["salesforce", "gmail", "slack"],
  },

  ashby: {
    tagline: "Connect Ashby to streamline recruiting workflows",
    useCases: [
      {
        title: "Candidate Insights",
        description:
          "Get AI-generated summaries of candidate applications and interview feedback.",
        icon: "ActionDocumentTextIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust help with candidate screening?",
        answer:
          "Yes, Dust can analyze candidate data in Ashby and help with initial screening based on job requirements.",
      },
    ],
    relatedIntegrations: ["slack", "gmail"],
  },

  salesloft: {
    tagline: "Integrate Salesloft for AI-enhanced sales engagement",
    useCases: [
      {
        title: "Sequence Optimization",
        description:
          "Analyze your outreach sequences and get AI recommendations for improvement.",
        icon: "ActionLightbulbIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust automate Salesloft tasks?",
        answer:
          "Yes, Dust can interact with Salesloft to help manage tasks, cadences, and contact engagement.",
      },
    ],
    relatedIntegrations: ["salesforce", "gmail", "hubspot"],
  },

  gong: {
    tagline: "Unlock insights from your Gong call recordings and analytics",
    useCases: [
      {
        title: "Call Analysis",
        description:
          "Get AI summaries and insights from your recorded sales and customer calls.",
        icon: "ActionMegaphoneIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust access my Gong recordings?",
        answer:
          "Yes, Dust can sync with Gong to access call transcripts and metadata for analysis.",
      },
    ],
    relatedIntegrations: ["salesforce", "slack"],
  },

  // ===== EMAIL =====
  gmail: {
    tagline:
      "Connect Gmail to automate email workflows and extract insights from conversations",
    useCases: [
      {
        title: "Email Drafting",
        description:
          "Let AI agents draft email responses based on context and your communication style.",
        icon: "ActionDocumentTextIcon",
      },
      {
        title: "Email Search",
        description:
          "Find relevant emails and extract information with natural language queries.",
        icon: "ActionMagnifyingGlassIcon",
      },
    ],
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
  },

  outlook: {
    tagline: "Integrate Outlook for AI-powered email management",
    useCases: [
      {
        title: "Inbox Management",
        description:
          "Automate email sorting, prioritization, and response suggestions.",
        icon: "ActionDocumentTextIcon",
      },
    ],
    faq: [
      {
        question: "Does Dust work with Outlook?",
        answer:
          "Yes, Dust integrates with Microsoft Outlook for both email and calendar functionality.",
      },
    ],
    relatedIntegrations: ["gmail", "outlook_calendar", "microsoft_teams"],
  },

  // ===== CALENDAR =====
  google_calendar: {
    tagline: "Connect Google Calendar for AI-powered scheduling assistance",
    useCases: [
      {
        title: "Schedule Management",
        description:
          "Get AI help with scheduling, rescheduling, and finding optimal meeting times.",
        icon: "ActionTimeIcon",
      },
      {
        title: "Meeting Prep",
        description:
          "Receive automated briefings before meetings based on calendar events.",
        icon: "ActionDocumentTextIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust create calendar events?",
        answer:
          "Yes, Dust agents can create, update, and manage events on your Google Calendar.",
      },
    ],
    relatedIntegrations: ["outlook_calendar", "gmail", "slack"],
  },

  outlook_calendar: {
    tagline: "Integrate Outlook Calendar for scheduling automation",
    useCases: [
      {
        title: "Availability Management",
        description:
          "Share availability and schedule meetings across your organization.",
        icon: "ActionTimeIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust access my Outlook Calendar?",
        answer:
          "Yes, Dust can read and write to your Outlook Calendar with proper authorization.",
      },
    ],
    relatedIntegrations: ["google_calendar", "outlook", "microsoft_teams"],
  },

  // ===== STORAGE =====
  google_drive: {
    tagline:
      "Connect Google Drive to make your files searchable and accessible to AI agents",
    useCases: [
      {
        title: "Document Search",
        description:
          "Search across all your Google Drive files with natural language queries.",
        icon: "ActionMagnifyingGlassIcon",
      },
      {
        title: "Content Extraction",
        description:
          "Extract information from documents, spreadsheets, and presentations.",
        icon: "ActionScanIcon",
      },
    ],
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
  },

  microsoft_drive: {
    tagline: "Connect Microsoft OneDrive for cloud storage integration",
    useCases: [
      {
        title: "File Access",
        description:
          "Access and search your OneDrive files through AI agents.",
        icon: "ActionMagnifyingGlassIcon",
      },
    ],
    faq: [
      {
        question: "Does Dust work with SharePoint?",
        answer:
          "Yes, Dust can access files stored in SharePoint through the Microsoft integration.",
      },
    ],
    relatedIntegrations: ["google_drive", "microsoft_excel"],
  },

  // ===== SUPPORT =====
  zendesk: {
    tagline:
      "Connect Zendesk to automate support workflows and improve response times",
    useCases: [
      {
        title: "Ticket Assistance",
        description:
          "Get AI-suggested responses and solutions for support tickets.",
        icon: "ActionLightbulbIcon",
      },
      {
        title: "Knowledge Base",
        description:
          "Search your help center and documentation to answer customer questions.",
        icon: "ActionMagnifyingGlassIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust respond to Zendesk tickets?",
        answer:
          "Yes, Dust agents can draft responses and update ticket status in Zendesk.",
      },
    ],
    relatedIntegrations: ["intercom", "freshservice", "slack"],
  },

  freshservice: {
    tagline: "Integrate Freshservice for IT service management automation",
    useCases: [
      {
        title: "Ticket Management",
        description:
          "Automate IT ticket triage, assignment, and resolution suggestions.",
        icon: "ActionAtomIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust create Freshservice tickets?",
        answer:
          "Yes, Dust agents can create, update, and manage tickets in Freshservice.",
      },
    ],
    relatedIntegrations: ["zendesk", "slack", "jira"],
  },

  front: {
    tagline: "Connect Front for AI-powered team inbox management",
    useCases: [
      {
        title: "Shared Inbox",
        description:
          "Get AI assistance with managing shared inboxes and customer communications.",
        icon: "ActionDocumentTextIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust help with Front conversations?",
        answer:
          "Yes, Dust can analyze Front conversations and suggest responses based on context.",
      },
    ],
    relatedIntegrations: ["zendesk", "gmail", "slack"],
  },

  intercom: {
    tagline: "Connect Intercom for AI-enhanced customer messaging",
    useCases: [
      {
        title: "Support Automation",
        description:
          "Automate common support queries and escalate complex issues to humans.",
        icon: "ActionRobotIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust respond to Intercom conversations?",
        answer:
          "Yes, Dust can help draft responses and manage conversations in Intercom.",
      },
    ],
    relatedIntegrations: ["zendesk", "slack"],
  },

  // ===== DATA =====
  snowflake: {
    tagline:
      "Query your Snowflake data warehouse directly from AI agents",
    useCases: [
      {
        title: "Data Queries",
        description:
          "Let AI agents query your Snowflake database and generate insights.",
        icon: "ActionTableIcon",
      },
      {
        title: "Business Intelligence",
        description:
          "Get natural language answers to questions about your business data.",
        icon: "ActionPieChartIcon",
      },
    ],
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
    useCases: [
      {
        title: "Data Analysis",
        description:
          "Query and analyze data stored in Databricks lakehouse.",
        icon: "ActionTableIcon",
      },
    ],
    faq: [
      {
        question: "Does Dust work with Databricks notebooks?",
        answer:
          "Dust can interact with Databricks SQL endpoints for data queries.",
      },
    ],
    relatedIntegrations: ["snowflake", "bigquery"],
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

  // ===== SECURITY =====
  vanta: {
    tagline: "Connect Vanta for security and compliance automation",
    useCases: [
      {
        title: "Compliance Tracking",
        description:
          "Get AI assistance with tracking and managing compliance requirements.",
        icon: "ActionLockIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust help with security compliance?",
        answer:
          "Yes, Dust can integrate with Vanta to help track and report on compliance status.",
      },
    ],
    relatedIntegrations: ["slack", "jira"],
  },

  // ===== AI =====
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
};
