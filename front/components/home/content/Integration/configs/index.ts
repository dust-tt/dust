import type { IntegrationEnrichment } from "../types";

// Enrichment configurations for integrations
// These provide additional SEO content, use cases, and FAQs
export const INTEGRATION_ENRICHMENTS: Record<string, IntegrationEnrichment> = {
  slack: {
    seoTitle: "AI Assistant for Slack",
    seoSubtitle:
      "Connect Slack to Dust AI agents. Get instant answers, automate workflows, and boost team productivity.",
    tagline: "Your AI-powered Slack assistant",
    longDescription:
      "Connect Slack to Dust and get AI-powered assistance directly in your channels. Ask questions, automate workflows, and boost team productivity.",
    useCases: [
      {
        title: "Instant Q&A",
        description:
          "Get immediate answers to questions about your company, projects, or processes directly in Slack.",
        icon: "ActionMagnifyingGlassIcon",
      },
      {
        title: "Meeting Summaries",
        description:
          "Automatically summarize long Slack threads and share key takeaways with your team.",
        icon: "ActionDocumentTextIcon",
      },
      {
        title: "Onboarding Assistant",
        description:
          "Help new team members find information and get up to speed quickly.",
        icon: "ActionLightbulbIcon",
      },
    ],
    faq: [
      {
        question: "How does Dust integrate with Slack?",
        answer:
          "Dust connects to Slack via a secure OAuth integration. Once connected, you can interact with AI agents directly in any Slack channel by mentioning @Dust.",
      },
      {
        question: "Can Dust read all my Slack messages?",
        answer:
          "No, Dust only accesses channels you explicitly configure. You have full control over which channels and data sources are available to AI agents.",
      },
      {
        question: "Is my Slack data secure?",
        answer:
          "Yes, Dust uses enterprise-grade security with SOC 2 compliance. Your data is encrypted in transit and at rest, and we never use it to train AI models.",
      },
    ],
    relatedIntegrations: ["notion", "google_drive", "github"],
  },

  notion: {
    seoTitle: "AI-Powered Notion Automation",
    seoSubtitle:
      "Connect Notion to Dust AI. Search docs, create pages, and automate your knowledge base.",
    tagline: "Your AI-powered Notion assistant",
    longDescription:
      "Connect Notion to Dust and let AI agents help you search, create, and organize your knowledge base automatically.",
    useCases: [
      {
        title: "Smart Search",
        description:
          "Find any document or information across your entire Notion workspace instantly.",
        icon: "ActionMagnifyingGlassIcon",
      },
      {
        title: "Auto Documentation",
        description:
          "Generate documentation, meeting notes, and project updates automatically.",
        icon: "ActionDocumentTextIcon",
      },
      {
        title: "Knowledge Base Q&A",
        description: "Get instant answers based on your Notion documentation.",
        icon: "ActionLightbulbIcon",
      },
    ],
    faq: [
      {
        question: "What Notion content can Dust access?",
        answer:
          "Dust can access pages and databases you explicitly share. You control exactly which workspaces and pages are connected.",
      },
      {
        question: "Can Dust create and update Notion pages?",
        answer:
          "Yes, with the appropriate permissions, Dust can create new pages, update existing content, and manage databases.",
      },
    ],
    relatedIntegrations: ["slack", "google_drive", "confluence"],
  },

  github: {
    seoTitle: "AI Coding Assistant for GitHub",
    seoSubtitle:
      "Connect GitHub to Dust AI. Automate issues, PRs, and code reviews with AI agents.",
    tagline: "Your AI-powered GitHub assistant",
    longDescription:
      "Connect GitHub to Dust and accelerate your development workflow with AI-powered issue management, code reviews, and documentation.",
    useCases: [
      {
        title: "Issue Triage",
        description:
          "Automatically categorize, prioritize, and assign issues based on content and context.",
        icon: "ActionGitBranchIcon",
      },
      {
        title: "PR Reviews",
        description:
          "Get AI-assisted code review suggestions and automate common review tasks.",
        icon: "ActionDocumentTextIcon",
      },
      {
        title: "Documentation",
        description: "Generate and update documentation based on code changes.",
        icon: "ActionLightbulbIcon",
      },
    ],
    faq: [
      {
        question: "Which GitHub features does Dust support?",
        answer:
          "Dust supports issues, pull requests, repositories, and discussions. You can read, create, and update these resources.",
      },
      {
        question: "Can Dust push code to my repositories?",
        answer:
          "Dust can create branches and pull requests, but actual code changes require human review and approval.",
      },
    ],
    relatedIntegrations: ["jira", "slack", "notion"],
  },

  salesforce: {
    seoTitle: "AI Sales Assistant for Salesforce",
    seoSubtitle:
      "Connect Salesforce to Dust AI. Automate CRM tasks, update records, and get sales insights.",
    tagline: "Your AI-powered Salesforce assistant",
    longDescription:
      "Connect Salesforce to Dust and let AI agents automate your CRM workflows, update records, and provide actionable sales insights.",
    useCases: [
      {
        title: "Lead Enrichment",
        description:
          "Automatically enrich lead data and prioritize high-value opportunities.",
        icon: "ActionMagnifyingGlassIcon",
      },
      {
        title: "Activity Logging",
        description:
          "Auto-log calls, emails, and meetings to the right contacts and opportunities.",
        icon: "ActionDocumentTextIcon",
      },
      {
        title: "Pipeline Analysis",
        description:
          "Get AI-powered insights on deal health and pipeline forecasts.",
        icon: "ActionPieChartIcon",
      },
    ],
    faq: [
      {
        question: "What Salesforce objects can Dust access?",
        answer:
          "Dust can access standard and custom objects including Leads, Contacts, Accounts, Opportunities, Cases, and more.",
      },
      {
        question: "Can Dust update Salesforce records?",
        answer:
          "Yes, with appropriate permissions, Dust can create and update records across supported Salesforce objects.",
      },
    ],
    relatedIntegrations: ["slack", "gmail", "hubspot"],
  },

  google_drive: {
    seoTitle: "AI Document Assistant for Google Drive",
    seoSubtitle:
      "Connect Google Drive to Dust AI. Search, summarize, and analyze documents with AI.",
    tagline: "Your AI-powered Google Drive assistant",
    longDescription:
      "Connect Google Drive to Dust and unlock AI-powered document search, summarization, and analysis across your entire drive.",
    useCases: [
      {
        title: "Document Search",
        description:
          "Find any document instantly using natural language queries.",
        icon: "ActionMagnifyingGlassIcon",
      },
      {
        title: "Content Summary",
        description:
          "Get quick summaries of long documents, reports, and presentations.",
        icon: "ActionDocumentTextIcon",
      },
      {
        title: "Cross-Doc Analysis",
        description:
          "Analyze information across multiple documents to find insights.",
        icon: "ActionLightbulbIcon",
      },
    ],
    faq: [
      {
        question: "Which Google Drive files can Dust access?",
        answer:
          "Dust can access Google Docs, Sheets, Slides, PDFs, and other common file types that you explicitly share.",
      },
      {
        question: "Can Dust edit my Google Drive files?",
        answer:
          "Currently, Dust provides read access to Google Drive files. Editing capabilities may be added in future updates.",
      },
    ],
    relatedIntegrations: ["slack", "notion", "gmail"],
  },

  zendesk: {
    seoTitle: "AI Customer Support for Zendesk",
    seoSubtitle:
      "Connect Zendesk to Dust AI. Automate ticket responses, routing, and customer support.",
    tagline: "Your AI-powered Zendesk assistant",
    longDescription:
      "Connect Zendesk to Dust and transform your customer support with AI-powered ticket automation, smart routing, and instant resolutions.",
    useCases: [
      {
        title: "Auto-Response",
        description:
          "Automatically draft responses to common support questions.",
        icon: "ActionMegaphoneIcon",
      },
      {
        title: "Smart Routing",
        description:
          "Route tickets to the right team based on content and urgency.",
        icon: "ActionCloudArrowLeftRightIcon",
      },
      {
        title: "Knowledge Lookup",
        description: "Instantly find relevant help articles and documentation.",
        icon: "ActionMagnifyingGlassIcon",
      },
    ],
    faq: [
      {
        question: "Can Dust respond to customers automatically?",
        answer:
          "Dust can draft responses and suggest answers, but human agents review and send all customer communications.",
      },
      {
        question: "Does Dust integrate with Zendesk Guide?",
        answer:
          "Yes, Dust can search your Zendesk Guide help center to provide relevant articles and documentation.",
      },
    ],
    relatedIntegrations: ["slack", "intercom", "freshservice"],
  },

  intercom: {
    seoTitle: "AI Customer Support for Intercom",
    seoSubtitle:
      "Connect Intercom to Dust AI. Automate conversations, resolve tickets, and boost support efficiency.",
    tagline: "Your AI-powered Intercom assistant",
    longDescription:
      "Connect Intercom to Dust and supercharge your customer support with AI-powered conversation handling and instant resolutions.",
    useCases: [
      {
        title: "Conversation AI",
        description: "Get AI-suggested responses for customer conversations.",
        icon: "ActionMegaphoneIcon",
      },
      {
        title: "Ticket Resolution",
        description:
          "Automatically resolve common issues with knowledge base integration.",
        icon: "ActionDocumentTextIcon",
      },
      {
        title: "Customer Insights",
        description:
          "Analyze conversation patterns and identify improvement opportunities.",
        icon: "ActionPieChartIcon",
      },
    ],
    relatedIntegrations: ["slack", "zendesk", "notion"],
  },

  snowflake: {
    seoTitle: "Query Snowflake with AI",
    seoSubtitle:
      "Connect Snowflake to Dust AI. Ask questions in plain English and get instant data insights.",
    tagline: "Your AI-powered Snowflake assistant",
    longDescription:
      "Connect Snowflake to Dust and query your data warehouse using natural language. No SQL required.",
    useCases: [
      {
        title: "Natural Language Queries",
        description:
          "Ask questions in plain English and get SQL generated automatically.",
        icon: "ActionMagnifyingGlassIcon",
      },
      {
        title: "Data Exploration",
        description: "Explore your data without writing complex queries.",
        icon: "ActionTableIcon",
      },
      {
        title: "Report Generation",
        description:
          "Generate reports and dashboards from conversational requests.",
        icon: "ActionPieChartIcon",
      },
    ],
    faq: [
      {
        question: "Does Dust require write access to Snowflake?",
        answer:
          "No, Dust only requires read access to run queries. We recommend using a read-only service account.",
      },
      {
        question: "How does Dust handle large query results?",
        answer:
          "Dust optimizes queries and handles pagination automatically. Large results are summarized intelligently.",
      },
    ],
    relatedIntegrations: ["bigquery", "databricks", "slack"],
  },

  bigquery: {
    seoTitle: "Query BigQuery with AI",
    seoSubtitle:
      "Connect BigQuery to Dust AI. Analyze data with natural language. No SQL required.",
    tagline: "Your AI-powered BigQuery assistant",
    longDescription:
      "Connect BigQuery to Dust and unlock AI-powered data analysis. Ask questions in plain English and get insights instantly.",
    useCases: [
      {
        title: "Plain English Queries",
        description: "Query your data using natural language instead of SQL.",
        icon: "ActionMagnifyingGlassIcon",
      },
      {
        title: "Automated Reports",
        description:
          "Generate reports and visualizations from conversational requests.",
        icon: "ActionPieChartIcon",
      },
      {
        title: "Data Discovery",
        description: "Explore and understand your data schemas effortlessly.",
        icon: "ActionTableIcon",
      },
    ],
    relatedIntegrations: ["snowflake", "google_drive", "slack"],
  },

  gong: {
    seoTitle: "AI Meeting Assistant for Gong",
    seoSubtitle:
      "Connect Gong to Dust AI. Analyze sales calls, extract insights, and improve team performance.",
    tagline: "Your AI-powered Gong assistant",
    longDescription:
      "Connect Gong to Dust and unlock AI-powered analysis of your sales calls. Extract key insights, action items, and coaching opportunities.",
    useCases: [
      {
        title: "Call Summaries",
        description: "Get instant summaries of sales calls with key takeaways.",
        icon: "ActionDocumentTextIcon",
      },
      {
        title: "Action Items",
        description:
          "Automatically extract and track follow-up tasks from calls.",
        icon: "ActionLightbulbIcon",
      },
      {
        title: "Coaching Insights",
        description: "Identify coaching opportunities and best practices.",
        icon: "ActionSpeakIcon",
      },
    ],
    relatedIntegrations: ["salesforce", "slack", "google-meet"],
  },

  "google-meet": {
    seoTitle: "AI Meeting Assistant for Google Meet",
    seoSubtitle:
      "Connect Google Meet to Dust AI. Summarize meetings, extract action items, and never miss follow-ups.",
    tagline: "Your AI-powered Google Meet assistant",
    longDescription:
      "Connect Google Meet recordings to Dust and let AI automatically summarize your meetings, extract action items, and sync insights to your workspace.",
    useCases: [
      {
        title: "Meeting Summaries",
        description:
          "Get instant summaries of every meeting with key decisions and topics.",
        icon: "ActionDocumentTextIcon",
      },
      {
        title: "Action Items",
        description:
          "Automatically extract and assign action items from meetings.",
        icon: "ActionLightbulbIcon",
      },
      {
        title: "Searchable Archive",
        description:
          "Search across all your meetings to find specific discussions.",
        icon: "ActionMagnifyingGlassIcon",
      },
    ],
    faq: [
      {
        question: "How does Dust access Google Meet recordings?",
        answer:
          "Dust connects via Google Drive where your Meet recordings are stored. You control which recordings are accessible.",
      },
      {
        question: "Can Dust transcribe meetings in real-time?",
        answer:
          "Currently, Dust processes recorded meetings. Real-time transcription may be available in future updates.",
      },
    ],
    relatedIntegrations: ["gong", "slack", "notion"],
  },

  modjo: {
    seoTitle: "AI Meeting Assistant for Modjo",
    seoSubtitle:
      "Connect Modjo to Dust AI. Analyze sales calls, extract insights, and accelerate deals.",
    tagline: "Your AI-powered Modjo assistant",
    longDescription:
      "Connect Modjo call recordings to Dust and let AI analyze your sales conversations, extract key insights, and help close more deals.",
    useCases: [
      {
        title: "Call Analysis",
        description:
          "Get AI-powered analysis of every sales call with key moments highlighted.",
        icon: "ActionMagnifyingGlassIcon",
      },
      {
        title: "Deal Intelligence",
        description:
          "Extract buying signals and objections to improve deal strategy.",
        icon: "ActionLightbulbIcon",
      },
      {
        title: "Team Coaching",
        description:
          "Identify best practices and coaching opportunities from top performers.",
        icon: "ActionSpeakIcon",
      },
    ],
    relatedIntegrations: ["salesforce", "gong", "slack"],
  },

  gmail: {
    seoTitle: "AI Email Assistant for Gmail",
    seoSubtitle:
      "Connect Gmail to Dust AI. Draft replies, summarize threads, and manage your inbox with AI.",
    tagline: "Your AI-powered Gmail assistant",
    longDescription:
      "Connect Gmail to Dust and let AI help you draft emails, summarize threads, and stay on top of your inbox.",
    useCases: [
      {
        title: "Email Drafts",
        description:
          "Get AI-generated draft replies based on context and your writing style.",
        icon: "ActionDocumentTextIcon",
      },
      {
        title: "Thread Summaries",
        description:
          "Summarize long email threads to quickly understand conversations.",
        icon: "ActionMagnifyingGlassIcon",
      },
      {
        title: "Smart Search",
        description: "Find emails using natural language queries.",
        icon: "ActionLightbulbIcon",
      },
    ],
    relatedIntegrations: ["google_calendar", "slack", "notion"],
  },

  google_calendar: {
    seoTitle: "AI Calendar Management with Google Calendar",
    seoSubtitle:
      "Connect Google Calendar to Dust AI. Automate scheduling, manage meetings, and save time.",
    tagline: "Your AI-powered calendar assistant",
    longDescription:
      "Connect Google Calendar to Dust and let AI manage your meetings, find availability, and automate scheduling tasks.",
    useCases: [
      {
        title: "Smart Scheduling",
        description:
          "Find optimal meeting times based on attendee availability.",
        icon: "GcalLogo",
      },
      {
        title: "Meeting Prep",
        description: "Get AI-generated briefings before important meetings.",
        icon: "ActionDocumentTextIcon",
      },
      {
        title: "Calendar Insights",
        description:
          "Analyze how you spend your time and optimize your schedule.",
        icon: "ActionPieChartIcon",
      },
    ],
    relatedIntegrations: ["gmail", "slack", "google-meet"],
  },

  jira: {
    seoTitle: "AI Coding Assistant for Jira",
    seoSubtitle:
      "Connect Jira to Dust AI. Automate issues, track projects, and boost team productivity.",
    tagline: "Your AI-powered Jira assistant",
    longDescription:
      "Connect Jira to Dust and accelerate your project management with AI-powered issue creation, updates, and insights.",
    useCases: [
      {
        title: "Issue Creation",
        description:
          "Create well-structured Jira issues from natural language descriptions.",
        icon: "JiraLogo",
      },
      {
        title: "Sprint Planning",
        description:
          "Get AI suggestions for sprint planning and capacity management.",
        icon: "ActionPieChartIcon",
      },
      {
        title: "Status Updates",
        description:
          "Generate project status updates from Jira data automatically.",
        icon: "ActionDocumentTextIcon",
      },
    ],
    relatedIntegrations: ["github", "confluence", "slack"],
  },

  confluence: {
    seoTitle: "AI Coding Assistant for Confluence",
    seoSubtitle:
      "Connect Confluence to Dust AI. Search docs, create pages, and manage your wiki with AI.",
    tagline: "Your AI-powered Confluence assistant",
    longDescription:
      "Connect Confluence to Dust and transform your wiki with AI-powered search, content creation, and knowledge management.",
    useCases: [
      {
        title: "Knowledge Search",
        description:
          "Find any information across your Confluence spaces instantly.",
        icon: "ActionMagnifyingGlassIcon",
      },
      {
        title: "Page Creation",
        description:
          "Generate documentation and wiki pages from templates and descriptions.",
        icon: "ActionDocumentTextIcon",
      },
      {
        title: "Content Updates",
        description: "Keep documentation up-to-date with AI-assisted updates.",
        icon: "ActionLightbulbIcon",
      },
    ],
    relatedIntegrations: ["jira", "slack", "notion"],
  },

  hubspot: {
    seoTitle: "AI Sales Assistant for HubSpot",
    seoSubtitle:
      "Connect HubSpot to Dust AI. Automate CRM tasks, enrich contacts, and close more deals.",
    tagline: "Your AI-powered HubSpot assistant",
    longDescription:
      "Connect HubSpot to Dust and supercharge your CRM with AI-powered contact enrichment, deal tracking, and sales automation.",
    useCases: [
      {
        title: "Contact Enrichment",
        description:
          "Automatically enrich contact and company records with relevant data.",
        icon: "ActionMagnifyingGlassIcon",
      },
      {
        title: "Deal Tracking",
        description: "Get AI insights on deal health and next best actions.",
        icon: "ActionPieChartIcon",
      },
      {
        title: "Activity Logging",
        description: "Auto-log sales activities and interactions.",
        icon: "ActionDocumentTextIcon",
      },
    ],
    relatedIntegrations: ["salesforce", "gmail", "slack"],
  },

  freshservice: {
    seoTitle: "AI Customer Support for Freshservice",
    seoSubtitle:
      "Connect Freshservice to Dust AI. Automate IT tickets, resolve issues faster, and improve service.",
    tagline: "Your AI-powered Freshservice assistant",
    longDescription:
      "Connect Freshservice to Dust and transform your IT service management with AI-powered ticket automation and smart resolutions.",
    useCases: [
      {
        title: "Ticket Automation",
        description:
          "Automatically categorize, prioritize, and route IT tickets.",
        icon: "ActionCloudArrowLeftRightIcon",
      },
      {
        title: "Self-Service",
        description:
          "Enable employees to resolve common issues without IT intervention.",
        icon: "ActionLightbulbIcon",
      },
      {
        title: "Knowledge Base",
        description: "Build and maintain IT documentation with AI assistance.",
        icon: "ActionDocumentTextIcon",
      },
    ],
    relatedIntegrations: ["zendesk", "slack", "jira"],
  },
};
