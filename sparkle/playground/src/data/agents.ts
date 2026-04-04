import type { Agent } from "./types";

// Diverse list of agents with emojis and Tailwind colors
export const mockAgents: Agent[] = [
  {
    id: "agent-dust",
    name: "Dust",
    emoji: "✨",
    backgroundColor: "s-bg-primary-800 dark:s-bg-primary-800-night",
    description: "Default workspace assistant",
  },
  {
    id: "agent-deep-dive",
    name: "Deep-dive",
    emoji: "🤿",
    backgroundColor: "s-bg-cyan-200",
    description: "In-depth research and long-form analysis",
  },
  {
    id: "agent-1",
    name: "Translator",
    emoji: "💬",
    backgroundColor: "s-bg-green-200",
    description:
      "Translates text between multiple languages with high accuracy",
  },
  {
    id: "agent-2",
    name: "TrailblazerGuard",
    emoji: "👮",
    backgroundColor: "s-bg-blue-100",
    description: "Security and compliance monitoring agent",
  },
  {
    id: "agent-3",
    name: "Transport",
    emoji: "🚌",
    backgroundColor: "s-bg-blue-200",
    description: "Helps with transportation and logistics planning",
  },
  {
    id: "agent-4",
    name: "TrendTracker",
    emoji: "😻",
    backgroundColor: "s-bg-rose-50",
    description: "Tracks and analyzes trending topics and social media",
  },
  {
    id: "agent-5",
    name: "FeedbackHelper",
    emoji: "❤️",
    backgroundColor: "s-bg-rose-100",
    description: "Collects and analyzes customer feedback",
  },
  {
    id: "agent-6",
    name: "RiskAnalyzer",
    emoji: "💀",
    backgroundColor: "s-bg-lime-800",
    description: "Identifies and assesses potential risks in projects",
  },
  {
    id: "agent-7",
    name: "EngagementPro",
    emoji: "😂",
    backgroundColor: "s-bg-golden-200",
    description: "Creates engaging content and social media posts",
  },
  {
    id: "agent-8",
    name: "RunbookMaster",
    emoji: "🧑‍🚀",
    backgroundColor: "s-bg-violet-800",
    description: "Manages operational runbooks and procedures",
  },
  {
    id: "agent-9",
    name: "BrandSpecialist",
    emoji: "👕",
    backgroundColor: "s-bg-blue-200",
    description: "Maintains brand consistency across all communications",
  },
  {
    id: "agent-10",
    name: "CrisisManager",
    emoji: "🚒",
    backgroundColor: "s-bg-red-200",
    description: "Handles crisis communication and emergency responses",
  },
  {
    id: "agent-11",
    name: "PerformanceCoach",
    emoji: "🏆",
    backgroundColor: "s-bg-yellow-200",
    description: "Provides performance metrics and improvement suggestions",
  },
  {
    id: "agent-12",
    name: "StrategyPlanner",
    emoji: "🎯",
    backgroundColor: "s-bg-pink-100",
    description: "Develops strategic plans and roadmaps",
  },
  {
    id: "agent-13",
    name: "DataAnalyst",
    emoji: "📊",
    backgroundColor: "s-bg-emerald-300",
    description: "Analyzes data and generates insights",
  },
  {
    id: "agent-14",
    name: "CodeReviewer",
    emoji: "💻",
    backgroundColor: "s-bg-gray-400",
    description: "Reviews code and suggests improvements",
  },
  {
    id: "agent-15",
    name: "ContentWriter",
    emoji: "✍️",
    backgroundColor: "s-bg-orange-200",
    description: "Creates high-quality written content",
  },
  {
    id: "agent-16",
    name: "ResearchAssistant",
    emoji: "🔬",
    backgroundColor: "s-bg-violet-300",
    description: "Conducts research and gathers information",
  },
  {
    id: "agent-17",
    name: "MeetingScheduler",
    emoji: "📅",
    backgroundColor: "s-bg-blue-300",
    description: "Schedules and manages meetings",
  },
  {
    id: "agent-18",
    name: "CustomerSupport",
    emoji: "🤝",
    backgroundColor: "s-bg-green-300",
    description: "Provides customer support and assistance",
  },
  {
    id: "agent-19",
    name: "KnowledgeLibrarian",
    emoji: "📚",
    backgroundColor: "s-bg-amber-200",
    description: "Organizes and retrieves internal knowledge articles",
  },
  {
    id: "agent-20",
    name: "SalesCopilot",
    emoji: "📈",
    backgroundColor: "s-bg-sky-200",
    description: "Drafts outreach and summarizes deal activity",
  },
  {
    id: "agent-21",
    name: "LegalReviewer",
    emoji: "⚖️",
    backgroundColor: "s-bg-slate-300",
    description: "Flags legal and policy issues in drafts",
  },
  {
    id: "agent-22",
    name: "OpsAutomator",
    emoji: "⚙️",
    backgroundColor: "s-bg-zinc-300",
    description: "Automates repetitive operational workflows",
  },
];

/**
 * Get a random selection of agents
 * @param count - Number of agents to return
 * @returns Array of randomly selected agents
 */
export function getRandomAgents(count: number): Agent[] {
  const shuffled = [...mockAgents].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, mockAgents.length));
}

/**
 * Get an agent by ID
 * @param id - Agent ID
 * @returns Agent or undefined if not found
 */
export function getAgentById(id: string): Agent | undefined {
  return mockAgents.find((agent) => agent.id === id);
}

/**
 * Get agents by IDs
 * @param ids - Array of agent IDs
 * @returns Array of agents matching the provided IDs
 */
export function getAgentsByIds(ids: string[]): Agent[] {
  return mockAgents.filter((agent) => ids.includes(agent.id));
}
