import { mockAgents } from "./agents";
import type { Conversation } from "./types";
import { mockUsers } from "./users";

// Helper function to get random user IDs
function getRandomUserIds(count: number): string[] {
  const shuffled = [...mockUsers].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, mockUsers.length)).map((u) => u.id);
}

// Helper function to get random agent IDs
function getRandomAgentIds(count: number): string[] {
  const shuffled = [...mockAgents].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, mockAgents.length)).map((a) => a.id);
}

// Helper function to generate a date in the past
function getDateInPast(daysAgo: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
}

// Helper function to generate a random date between two dates
function randomDateBetween(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

// Generate conversations with realistic distribution
// Most have 1 user, some have 2-5, never more than 5
// Most have 1 agent, some have 2-3, never more than 3
// Some have no agents (user-only)
function generateConversationParticipants(): {
  userParticipants: string[];
  agentParticipants: string[];
} {
  const rand = Math.random();

  // User participants: 60% have 1, 25% have 2-3, 10% have 4-5, 5% have 2-5 (random)
  let userCount: number;
  if (rand < 0.6) {
    userCount = 1;
  } else if (rand < 0.85) {
    userCount = Math.floor(Math.random() * 2) + 2; // 2-3
  } else if (rand < 0.95) {
    userCount = Math.floor(Math.random() * 2) + 4; // 4-5
  } else {
    userCount = Math.floor(Math.random() * 4) + 2; // 2-5
  }

  // Agent participants: 70% have 1, 20% have 2-3, 10% have none
  let agentCount: number;
  const agentRand = Math.random();
  if (agentRand < 0.7) {
    agentCount = 1;
  } else if (agentRand < 0.9) {
    agentCount = Math.floor(Math.random() * 2) + 2; // 2-3
  } else {
    agentCount = 0; // No agents
  }

  return {
    userParticipants: getRandomUserIds(userCount),
    agentParticipants: agentCount > 0 ? getRandomAgentIds(agentCount) : [],
  };
}

// Realistic conversation titles
const conversationTitles = [
  "Project Kickoff Meeting",
  "Budget Review Discussion",
  "Weekly Sync with Team",
  "AI Bot Training Session",
  "Quarterly Planning Meeting",
  "Feedback on Latest Design",
  "Client Requirements Gathering",
  "Sprint Retrospective",
  "Daily Standup",
  "Marketing Strategy Planning",
  "Code Review Session",
  "Product Launch Preparation",
  "Onboarding New Team Members",
  "Customer Feedback Analysis",
  "Feature Prioritization Discussion",
  "Technical Debt Assessment",
  "Supply Chain Optimization",
  "Sales Performance Review",
  "Cross-Department Collaboration",
  "Innovation Brainstorming",
  "Risk Management Workshop",
  "Holiday Schedule Planning",
  "Compliance and Security Update",
  "UI/UX Design Critique",
  "End-of-Year Wrap Up",
  "Resource Allocation Meeting",
  "Vendor Negotiation Strategy",
  "Crisis Management Scenario",
  "SEO Best Practices Review",
  "New Hire Orientation",
  "Remote Work Policy Update",
  "Company Values Workshop",
  "Leadership Development Session",
  "Diversity and Inclusion Training",
  "Performance Improvement Plan",
  "Customer Success Story Sharing",
  "Community Engagement Strategy",
  "Internal Product Demo",
  "Cost Reduction Initiative",
  "Change Management Planning",
  "Employee Recognition Program",
  "IT Infrastructure Upgrade",
  "Content Marketing Planning",
  "Team Building Activities",
  "Data Privacy Compliance",
  "Board Meeting Preparation",
  "Investor Relations Update",
  "KPI Tracking and Reporting",
  "Industry Trends Analysis",
  "Partnership Opportunities Exploration",
  "Employee Wellness Program",
  "Talent Acquisition Strategy",
  "Brand Positioning Workshop",
  "Social Media Campaign Planning",
  "Competitive Analysis Review",
  "Legal Compliance Training",
  "Cybersecurity Awareness Session",
  "Cultural Exchange Program",
  "Product Roadmap Presentation",
  "Customer Journey Mapping",
  "Financial Forecasting Session",
  "Brand Storytelling Workshop",
  "AI Ethics and Governance Discussion",
  "Operational Efficiency Assessment",
  "Annual Report Drafting",
  "Project Milestone Celebration",
  "Quality Assurance Review",
  "Public Relations Strategy",
  "Team Performance Metrics",
  "Innovation Lab Tour",
  "Digital Transformation Roadmap",
  "Sustainability Initiatives Planning",
  "Internal Communications Strategy",
  "Customer Advisory Board Meeting",
  "Agile Methodology Training",
  "E-commerce Platform Update",
  "Risk Assessment and Mitigation",
  "Employee Satisfaction Survey Results",
  "Sales Funnel Optimization",
  "Cross-Cultural Communication Training",
  "Global Expansion Strategy",
  "Cloud Migration Plan",
  "Crisis Communication Strategy",
  "Webinar Content Creation",
  "Supply Chain Risk Management",
  "Data Analytics and Insights",
  "Customer Onboarding Process",
  "Brand Awareness Campaign",
  "Product Feature Request Review",
  "Annual Budget Allocation",
  "Employee Exit Interview",
  "User Feedback Session",
  "Strategic Partnership Negotiation",
  "Market Entry Strategy",
  "Employee Handbook Update",
  "Stakeholder Engagement Plan",
  "AI Chatbot Development",
  "Customer Retention Strategy",
  "Company Anniversary Celebration",
  "Leadership Team Offsite",
  "Innovation Challenge Kickoff",
  "Employee Benefits Review",
  "Business Continuity Planning",
];

// Generate conversations with dates spread across recent past
export const mockConversations: Conversation[] = [];

// Generate conversations for today (10 conversations)
for (let i = 0; i < 10; i++) {
  const { userParticipants, agentParticipants } = generateConversationParticipants();
  const createdAt = randomDateBetween(
    new Date(new Date().setHours(0, 0, 0, 0)),
    new Date()
  );
  mockConversations.push({
    id: `conv-${mockConversations.length + 1}`,
    title:
      conversationTitles[
        Math.floor(Math.random() * conversationTitles.length)
      ],
    createdAt,
    updatedAt: randomDateBetween(createdAt, new Date()),
    userParticipants,
    agentParticipants,
  });
}

// Generate conversations for yesterday (15 conversations)
for (let i = 0; i < 15; i++) {
  const { userParticipants, agentParticipants } = generateConversationParticipants();
  const yesterday = getDateInPast(1);
  const createdAt = randomDateBetween(
    new Date(yesterday.setHours(0, 0, 0, 0)),
    new Date(yesterday.setHours(23, 59, 59, 999))
  );
  mockConversations.push({
    id: `conv-${mockConversations.length + 1}`,
    title:
      conversationTitles[
        Math.floor(Math.random() * conversationTitles.length)
      ],
    createdAt,
    updatedAt: randomDateBetween(createdAt, new Date(yesterday.setHours(23, 59, 59, 999))),
    userParticipants,
    agentParticipants,
  });
}

// Generate conversations for last week (20 conversations)
for (let i = 0; i < 20; i++) {
  const { userParticipants, agentParticipants } = generateConversationParticipants();
  const daysAgo = Math.floor(Math.random() * 7) + 2; // 2-8 days ago
  const date = getDateInPast(daysAgo);
  const createdAt = randomDateBetween(
    new Date(date.setHours(0, 0, 0, 0)),
    new Date(date.setHours(23, 59, 59, 999))
  );
  mockConversations.push({
    id: `conv-${mockConversations.length + 1}`,
    title:
      conversationTitles[
        Math.floor(Math.random() * conversationTitles.length)
      ],
    createdAt,
    updatedAt: randomDateBetween(createdAt, new Date(date.setHours(23, 59, 59, 999))),
    userParticipants,
    agentParticipants,
  });
}

// Generate conversations for last month (30 conversations)
for (let i = 0; i < 30; i++) {
  const { userParticipants, agentParticipants } = generateConversationParticipants();
  const daysAgo = Math.floor(Math.random() * 30) + 9; // 9-38 days ago
  const date = getDateInPast(daysAgo);
  const createdAt = randomDateBetween(
    new Date(date.setHours(0, 0, 0, 0)),
    new Date(date.setHours(23, 59, 59, 999))
  );
  mockConversations.push({
    id: `conv-${mockConversations.length + 1}`,
    title:
      conversationTitles[
        Math.floor(Math.random() * conversationTitles.length)
      ],
    createdAt,
    updatedAt: randomDateBetween(createdAt, new Date(date.setHours(23, 59, 59, 999))),
    userParticipants,
    agentParticipants,
  });
}

// Generate older conversations (25 conversations)
for (let i = 0; i < 25; i++) {
  const { userParticipants, agentParticipants } = generateConversationParticipants();
  const daysAgo = Math.floor(Math.random() * 200) + 39; // 39-238 days ago
  const date = getDateInPast(daysAgo);
  const createdAt = randomDateBetween(
    new Date(date.setHours(0, 0, 0, 0)),
    new Date(date.setHours(23, 59, 59, 999))
  );
  mockConversations.push({
    id: `conv-${mockConversations.length + 1}`,
    title:
      conversationTitles[
        Math.floor(Math.random() * conversationTitles.length)
      ],
    createdAt,
    updatedAt: randomDateBetween(createdAt, new Date(date.setHours(23, 59, 59, 999))),
    userParticipants,
    agentParticipants,
  });
}

// Sort by updatedAt descending (most recent first)
mockConversations.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

/**
 * Get a random selection of conversations
 * @param count - Number of conversations to return
 * @returns Array of randomly selected conversations
 */
export function getRandomConversations(count: number): Conversation[] {
  const shuffled = [...mockConversations].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, mockConversations.length));
}

/**
 * Get a conversation by ID
 * @param id - Conversation ID
 * @returns Conversation or undefined if not found
 */
export function getConversationById(id: string): Conversation | undefined {
  return mockConversations.find((conv) => conv.id === id);
}

/**
 * Get conversations grouped by date
 * @returns Object with date groups and their conversations
 */
export function getConversationsByDate(): {
  today: Conversation[];
  yesterday: Conversation[];
  lastWeek: Conversation[];
  lastMonth: Conversation[];
  older: Conversation[];
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastMonth = new Date(today);
  lastMonth.setDate(lastMonth.getDate() - 30);

  const groups = {
    today: [] as Conversation[],
    yesterday: [] as Conversation[],
    lastWeek: [] as Conversation[],
    lastMonth: [] as Conversation[],
    older: [] as Conversation[],
  };

  mockConversations.forEach((conv) => {
    const updatedAt = conv.updatedAt;
    if (updatedAt >= today) {
      groups.today.push(conv);
    } else if (updatedAt >= yesterday) {
      groups.yesterday.push(conv);
    } else if (updatedAt >= lastWeek) {
      groups.lastWeek.push(conv);
    } else if (updatedAt >= lastMonth) {
      groups.lastMonth.push(conv);
    } else {
      groups.older.push(conv);
    }
  });

  return groups;
}

/**
 * Get conversations by user ID
 * @param userId - User ID
 * @returns Array of conversations where the user is a participant
 */
export function getConversationsByUserId(userId: string): Conversation[] {
  return mockConversations.filter((conv) =>
    conv.userParticipants.includes(userId)
  );
}

/**
 * Get conversations by agent ID
 * @param agentId - Agent ID
 * @returns Array of conversations where the agent is a participant
 */
export function getConversationsByAgentId(agentId: string): Conversation[] {
  return mockConversations.filter((conv) =>
    conv.agentParticipants.includes(agentId)
  );
}

