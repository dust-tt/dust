import type { IntegrationCategory } from "../types";

// SEO-optimized title patterns by category
// These target long-tail search queries like "AI assistant for [tool]"
const SEO_TITLE_PATTERNS: Record<IntegrationCategory, (name: string) => string> =
  {
    crm: (name) => `AI Sales Assistant for ${name}`,
    support: (name) => `AI Customer Support for ${name}`,
    communication: (name) => `AI Assistant for ${name}`,
    productivity: (name) => `AI-Powered ${name} Automation`,
    development: (name) => `AI Coding Assistant for ${name}`,
    data: (name) => `Query ${name} with AI`,
    email: (name) => `AI Email Assistant for ${name}`,
    calendar: (name) => `AI Calendar Management with ${name}`,
    storage: (name) => `AI Document Assistant for ${name}`,
    security: (name) => `AI Security Assistant for ${name}`,
    ai: (name) => `${name} AI Integration`,
    transcripts: (name) => `AI Meeting Assistant for ${name}`,
  };

// SEO-optimized subtitle patterns by category
const SEO_SUBTITLE_PATTERNS: Record<
  IntegrationCategory,
  (name: string) => string
> = {
  crm: (name) =>
    `Automate your ${name} CRM workflows with AI agents. Update records, log activities, and get insights automatically.`,
  support: (name) =>
    `Resolve ${name} tickets faster with AI. Automate responses, route issues, and improve customer satisfaction.`,
  communication: (name) =>
    `Connect ${name} to AI agents that help your team communicate more effectively and stay in sync.`,
  productivity: (name) =>
    `Supercharge ${name} with AI automation. Create, update, and organize content without manual work.`,
  development: (name) =>
    `Accelerate development with AI-powered ${name} workflows. Automate issues, PRs, and code reviews.`,
  data: (name) =>
    `Ask questions in plain English and get answers from ${name}. No SQL required.`,
  email: (name) =>
    `Let AI handle your ${name} inbox. Draft responses, summarize threads, and never miss important messages.`,
  calendar: (name) =>
    `AI-powered scheduling with ${name}. Manage meetings, find availability, and automate calendar tasks.`,
  storage: (name) =>
    `Search and summarize ${name} documents with AI. Find information across all your files instantly.`,
  security: (name) =>
    `AI-powered security monitoring with ${name}. Stay compliant and respond to threats faster.`,
  ai: (name) =>
    `Combine ${name} with Dust AI agents for powerful automation workflows.`,
  transcripts: (name) =>
    `Turn ${name} recordings into actionable insights with AI. Summarize calls, extract action items, and never miss follow-ups.`,
};

// Meta description patterns for SEO
const SEO_META_PATTERNS: Record<IntegrationCategory, (name: string) => string> =
  {
    crm: (name) =>
      `Connect ${name} to Dust AI agents. Automate CRM tasks, update records, log activities, and get AI-powered sales insights. Start free trial.`,
    support: (name) =>
      `AI-powered ${name} integration. Automate ticket responses, smart routing, and customer support workflows. Try Dust free for 14 days.`,
    communication: (name) =>
      `Integrate ${name} with Dust AI. Get AI assistants in your team channels, automate messages, and improve collaboration. Free trial.`,
    productivity: (name) =>
      `${name} AI automation with Dust. Create content, manage tasks, and organize work automatically with AI agents. No credit card required.`,
    development: (name) =>
      `${name} AI assistant by Dust. Automate issues, pull requests, code reviews, and development workflows. Start your free trial.`,
    data: (name) =>
      `Query ${name} with natural language using Dust AI. No SQL needed. Get instant insights from your data warehouse. Try free.`,
    email: (name) =>
      `AI email assistant for ${name}. Draft replies, summarize threads, and manage your inbox with AI agents. 14-day free trial.`,
    calendar: (name) =>
      `${name} AI scheduling assistant. Automate meeting management, find availability, and handle calendar tasks. Start free.`,
    storage: (name) =>
      `AI document search for ${name}. Find, summarize, and analyze files across your storage with Dust AI agents. Try free.`,
    security: (name) =>
      `${name} AI security integration. Monitor compliance, track vulnerabilities, and automate security workflows. Free trial.`,
    ai: (name) =>
      `Combine ${name} with Dust for powerful AI automation. Build custom workflows and agents. Start your 14-day free trial.`,
    transcripts: (name) =>
      `AI meeting assistant for ${name}. Automatically summarize calls, extract action items, and sync insights to your tools. Try free.`,
  };

export function getDefaultSEOTitle(
  name: string,
  category: IntegrationCategory
): string {
  return SEO_TITLE_PATTERNS[category](name);
}

export function getDefaultSEOSubtitle(
  name: string,
  category: IntegrationCategory
): string {
  return SEO_SUBTITLE_PATTERNS[category](name);
}

export function getDefaultSEOMetaDescription(
  name: string,
  category: IntegrationCategory
): string {
  return SEO_META_PATTERNS[category](name);
}
