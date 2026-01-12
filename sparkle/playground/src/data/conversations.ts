import { mockAgents } from "./agents";
import { mockSpaces } from "./spaces";
import type { Conversation, Message } from "./types";
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

// Helper function to generate a description based on title
function generateDescription(title: string): string {
  const descriptions: Record<string, string> = {
    "Project Kickoff Meeting":
      "Initial discussion to align team on project goals and timeline. We'll be reviewing the scope of work, establishing key milestones, and defining success metrics. The team will also discuss resource allocation, potential challenges, and mitigation strategies. This foundational meeting sets the tone for the entire project lifecycle and ensures everyone is on the same page from day one.",
    "Budget Review Discussion":
      "Reviewing financial allocations and budget adjustments for Q4. We need to analyze current spending patterns, identify areas where we're over or under budget, and make strategic decisions about resource reallocation. The discussion will cover department-specific budgets, unexpected costs, and opportunities for optimization. Final decisions will be made on any proposed adjustments to ensure we meet our financial targets.",
    "Weekly Sync with Team":
      "Regular team check-in to discuss progress and blockers. This weekly meeting is essential for maintaining team alignment and addressing any issues that have arisen during the week. We'll review completed tasks, discuss upcoming priorities, and identify any obstacles that need escalation. The goal is to keep everyone informed, ensure smooth collaboration, and quickly resolve any challenges that might impact project timelines.",
    "AI Bot Training Session":
      "Training session on how to effectively use AI assistants. We'll cover best practices for interacting with AI tools, understanding their capabilities and limitations, and integrating them into daily workflows. Participants will learn about prompt engineering, quality assurance, and how to leverage AI for maximum productivity. This hands-on session includes practical exercises and real-world use cases to help team members become proficient users.",
    "Quarterly Planning Meeting":
      "Strategic planning for the upcoming quarter. This comprehensive session will set the direction for the next three months, including key initiatives, resource planning, and goal setting. We'll review the previous quarter's performance, analyze market trends, and align our strategy with organizational objectives. The outcome will be a clear roadmap with defined milestones, responsibilities, and success metrics for each team.",
    "Feedback on Latest Design":
      "Collecting and discussing feedback on recent design iterations. This session involves reviewing the latest mockups, gathering input from stakeholders, and identifying areas for improvement. We'll discuss usability concerns, aesthetic preferences, and technical feasibility. The goal is to synthesize all feedback into actionable design changes that enhance user experience while maintaining brand consistency and meeting project requirements.",
    "Client Requirements Gathering":
      "Understanding and documenting client needs and expectations. This crucial phase involves detailed conversations with the client to capture all functional and non-functional requirements. We'll explore their business objectives, technical constraints, user personas, and success criteria. The discussion will cover current pain points, desired outcomes, and any specific features or integrations they need. This information will be documented and used to create a comprehensive project specification.",
    "Sprint Retrospective":
      "Reviewing sprint outcomes and identifying improvements. The team will reflect on what went well during the sprint, what challenges were encountered, and what could be improved in future sprints. We'll analyze velocity metrics, discuss team dynamics, and identify process improvements. This is an opportunity for honest feedback and collaborative problem-solving to continuously enhance our agile practices and team performance.",
    "Daily Standup":
      "Quick sync on daily tasks and priorities. Each team member shares what they accomplished yesterday, what they plan to work on today, and any blockers they're experiencing. This brief meeting ensures everyone stays aligned on progress and can quickly identify and resolve issues. It's also an opportunity to coordinate work, share knowledge, and maintain team momentum. The focus is on transparency and quick problem-solving.",
    "Marketing Strategy Planning":
      "Developing marketing campaigns and go-to-market strategies. This session focuses on creating comprehensive marketing plans that align with business objectives. We'll define target audiences, craft messaging, select appropriate channels, and establish success metrics. The discussion covers budget allocation, timeline planning, and coordination with sales and product teams. The goal is to develop integrated campaigns that effectively reach our target market and drive desired outcomes.",
  };

  // If we have a specific description, use it
  if (descriptions[title]) {
    return descriptions[title];
  }

  // Otherwise generate a generic description
  const genericDescriptions = [
    `Discussion about ${title.toLowerCase()}. This conversation will explore various aspects of the topic, including key challenges, opportunities, and potential solutions. We'll dive deep into the subject matter, examining different perspectives and approaches. The goal is to gain a comprehensive understanding and develop actionable insights that can drive meaningful progress.`,
    `Collaborative session focused on ${title.toLowerCase()}. Team members will come together to share ideas, brainstorm solutions, and work towards common goals. This interactive discussion will leverage the collective expertise of all participants, encouraging open dialogue and creative problem-solving. We'll work through the agenda systematically, ensuring all important points are addressed and decisions are made collaboratively.`,
    `Team meeting to address ${title.toLowerCase()}. This session provides an opportunity for the team to discuss current status, address any issues or concerns, and plan next steps. We'll review relevant context, explore different options, and make informed decisions together. The meeting will ensure alignment across team members and set a clear direction for moving forward with confidence and clarity.`,
    `Planning and coordination for ${title.toLowerCase()}. This strategic session focuses on organizing resources, timelines, and responsibilities to ensure successful execution. We'll define clear objectives, identify required resources, and establish communication protocols. The discussion will cover logistics, dependencies, and risk mitigation strategies. The outcome will be a well-structured plan with clear ownership and actionable next steps.`,
    `Review and feedback session on ${title.toLowerCase()}. We'll thoroughly examine the work completed so far, gather comprehensive feedback from stakeholders, and identify areas for improvement. This collaborative review process ensures quality and alignment with expectations. Participants will share their perspectives, discuss trade-offs, and agree on any necessary revisions or next actions.`,
    `Quick sync on ${title.toLowerCase()} progress and next steps.`,
    `Brainstorming session to explore ideas around ${title.toLowerCase()}.`,
    `Status update and problem-solving discussion for ${title.toLowerCase()}.`,
    `Follow-up conversation about ${title.toLowerCase()} implementation details.`,
    `Q&A session to clarify questions regarding ${title.toLowerCase()}.`,
    `Decision-making meeting for key choices related to ${title.toLowerCase()}.`,
  ];

  return genericDescriptions[
    Math.floor(Math.random() * genericDescriptions.length)
  ];
}

// Helper function to get a random space ID
function getRandomSpaceId(): string {
  const randomIndex = Math.floor(Math.random() * mockSpaces.length);
  return mockSpaces[randomIndex].id;
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
  const { userParticipants, agentParticipants } =
    generateConversationParticipants();
  const createdAt = randomDateBetween(
    new Date(new Date().setHours(0, 0, 0, 0)),
    new Date()
  );
  const title =
    conversationTitles[Math.floor(Math.random() * conversationTitles.length)];
  mockConversations.push({
    id: `conv-${mockConversations.length + 1}`,
    title,
    createdAt,
    updatedAt: randomDateBetween(createdAt, new Date()),
    userParticipants,
    agentParticipants,
    description: generateDescription(title),
    spaceId: getRandomSpaceId(),
  });
}

// Generate conversations for yesterday (15 conversations)
for (let i = 0; i < 15; i++) {
  const { userParticipants, agentParticipants } =
    generateConversationParticipants();
  const yesterday = getDateInPast(1);
  const createdAt = randomDateBetween(
    new Date(yesterday.setHours(0, 0, 0, 0)),
    new Date(yesterday.setHours(23, 59, 59, 999))
  );
  const title =
    conversationTitles[Math.floor(Math.random() * conversationTitles.length)];
  mockConversations.push({
    id: `conv-${mockConversations.length + 1}`,
    title,
    createdAt,
    updatedAt: randomDateBetween(
      createdAt,
      new Date(yesterday.setHours(23, 59, 59, 999))
    ),
    userParticipants,
    agentParticipants,
    description: generateDescription(title),
    spaceId: getRandomSpaceId(),
  });
}

// Generate conversations for last week (20 conversations)
for (let i = 0; i < 20; i++) {
  const { userParticipants, agentParticipants } =
    generateConversationParticipants();
  const daysAgo = Math.floor(Math.random() * 7) + 2; // 2-8 days ago
  const date = getDateInPast(daysAgo);
  const createdAt = randomDateBetween(
    new Date(date.setHours(0, 0, 0, 0)),
    new Date(date.setHours(23, 59, 59, 999))
  );
  const title =
    conversationTitles[Math.floor(Math.random() * conversationTitles.length)];
  mockConversations.push({
    id: `conv-${mockConversations.length + 1}`,
    title,
    createdAt,
    updatedAt: randomDateBetween(
      createdAt,
      new Date(date.setHours(23, 59, 59, 999))
    ),
    userParticipants,
    agentParticipants,
    description: generateDescription(title),
    spaceId: getRandomSpaceId(),
  });
}

// Generate conversations for last month (30 conversations)
for (let i = 0; i < 30; i++) {
  const { userParticipants, agentParticipants } =
    generateConversationParticipants();
  const daysAgo = Math.floor(Math.random() * 30) + 9; // 9-38 days ago
  const date = getDateInPast(daysAgo);
  const createdAt = randomDateBetween(
    new Date(date.setHours(0, 0, 0, 0)),
    new Date(date.setHours(23, 59, 59, 999))
  );
  const title =
    conversationTitles[Math.floor(Math.random() * conversationTitles.length)];
  mockConversations.push({
    id: `conv-${mockConversations.length + 1}`,
    title,
    createdAt,
    updatedAt: randomDateBetween(
      createdAt,
      new Date(date.setHours(23, 59, 59, 999))
    ),
    userParticipants,
    agentParticipants,
    description: generateDescription(title),
    spaceId: getRandomSpaceId(),
  });
}

// Generate older conversations (25 conversations)
for (let i = 0; i < 25; i++) {
  const { userParticipants, agentParticipants } =
    generateConversationParticipants();
  const daysAgo = Math.floor(Math.random() * 200) + 39; // 39-238 days ago
  const date = getDateInPast(daysAgo);
  const createdAt = randomDateBetween(
    new Date(date.setHours(0, 0, 0, 0)),
    new Date(date.setHours(23, 59, 59, 999))
  );
  const title =
    conversationTitles[Math.floor(Math.random() * conversationTitles.length)];
  mockConversations.push({
    id: `conv-${mockConversations.length + 1}`,
    title,
    createdAt,
    updatedAt: randomDateBetween(
      createdAt,
      new Date(date.setHours(23, 59, 59, 999))
    ),
    userParticipants,
    agentParticipants,
    description: generateDescription(title),
    spaceId: getRandomSpaceId(),
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

/**
 * Get conversations by space ID
 * @param spaceId - Space ID
 * @returns Array of conversations in the specified space
 */
export function getConversationsBySpaceId(spaceId: string): Conversation[] {
  return mockConversations.filter((conv) => conv.spaceId === spaceId);
}

/**
 * Create conversations with messages for demo purposes
 * @param locutorId - The current user's ID (Locutor)
 * @returns Array of conversations with messages
 */
export function createConversationsWithMessages(
  locutorId: string
): Conversation[] {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Get some users and agents for the conversations
  const user1 = mockUsers.find((u) => u.id !== locutorId) || mockUsers[0];
  const user2 =
    mockUsers.find((u) => u.id !== locutorId && u.id !== user1.id) ||
    mockUsers[1];
  const user3 =
    mockUsers.find(
      (u) => u.id !== locutorId && u.id !== user1.id && u.id !== user2.id
    ) || mockUsers[2];
  const agent1 = mockAgents[0];
  const agent2 = mockAgents[1];

  // Conversation 1: Q4 Planning Discussion
  const conv1Start = new Date(twoHoursAgo.getTime() - 3 * 60 * 60 * 1000);
  const conv1Messages: Message[] = [
    {
      id: "msg-1-1",
      content:
        "Hey team, let's discuss our Q4 planning. I've been reviewing the numbers and we need to prioritize our roadmap.",
      timestamp: new Date(conv1Start.getTime() + 5 * 60 * 1000),
      ownerId: locutorId,
      ownerType: "user",
      type: "user",
    },
    {
      id: "msg-1-2",
      content:
        "I agree. Based on the data I've analyzed, we should focus on the three high-impact features that align with our strategic goals.",
      timestamp: new Date(conv1Start.getTime() + 12 * 60 * 1000),
      ownerId: agent1.id,
      ownerType: "agent",
      type: "agent",
    },
    {
      id: "msg-1-3",
      content:
        "That makes sense. What about the mobile app improvements? I think those are critical for user retention.",
      timestamp: new Date(conv1Start.getTime() + 18 * 60 * 1000),
      ownerId: user1.id,
      ownerType: "user",
      type: "user",
    },
    {
      id: "msg-1-4",
      content:
        "Good point. The mobile engagement metrics show a 40% increase when we improve the UX. I recommend prioritizing that.",
      timestamp: new Date(conv1Start.getTime() + 25 * 60 * 1000),
      ownerId: agent1.id,
      ownerType: "agent",
      type: "agent",
    },
    {
      id: "msg-1-5",
      content:
        "Perfect. Let's schedule a follow-up meeting to finalize the timeline. Can everyone make it Thursday at 2pm?",
      timestamp: new Date(conv1Start.getTime() + 32 * 60 * 1000),
      ownerId: locutorId,
      ownerType: "user",
      type: "user",
    },
    {
      id: "msg-1-6",
      content:
        "I'm available. Should I prepare a detailed breakdown of the mobile improvements?",
      timestamp: new Date(conv1Start.getTime() + 38 * 60 * 1000),
      ownerId: user2.id,
      ownerType: "user",
      type: "user",
    },
    {
      id: "msg-1-7",
      content:
        "Yes, that would be helpful. I can also generate a comparison matrix of all proposed features with their expected ROI.",
      timestamp: new Date(conv1Start.getTime() + 45 * 60 * 1000),
      ownerId: agent1.id,
      ownerType: "agent",
      type: "agent",
    },
  ];

  const conversation1: Conversation = {
    id: "conv-with-msgs-1",
    title: "Q4 Planning Discussion",
    createdAt: conv1Start,
    updatedAt: conv1Messages[conv1Messages.length - 1].timestamp,
    userParticipants: [locutorId, user1.id, user2.id],
    agentParticipants: [agent1.id],
    messages: conv1Messages,
    description:
      "Strategic planning session for Q4 roadmap and feature prioritization",
    spaceId: getRandomSpaceId(),
  };

  // Conversation 2: Product Feature Review
  const conv2Start = new Date(yesterday.getTime() + 10 * 60 * 60 * 1000);
  const conv2Messages: Message[] = [
    {
      id: "msg-2-1",
      content:
        "I've been getting feedback about the new search feature. Users find it confusing. What do you think?",
      timestamp: new Date(conv2Start.getTime() + 3 * 60 * 1000),
      ownerId: user3.id,
      ownerType: "user",
      type: "user",
    },
    {
      id: "msg-2-2",
      content:
        "I've analyzed the user feedback and session recordings. The main issue is the search bar placement and lack of autocomplete suggestions.",
      timestamp: new Date(conv2Start.getTime() + 8 * 60 * 1000),
      ownerId: agent2.id,
      ownerType: "agent",
      type: "agent",
    },
    {
      id: "msg-2-3",
      content:
        "That aligns with what I've heard. Should we move it to the top navigation and add those suggestions?",
      timestamp: new Date(conv2Start.getTime() + 15 * 60 * 1000),
      ownerId: locutorId,
      ownerType: "user",
      type: "user",
    },
    {
      id: "msg-2-4",
      content:
        "Based on UX best practices, moving it to the top navigation would improve discoverability by 60%. I can draft a design proposal.",
      timestamp: new Date(conv2Start.getTime() + 22 * 60 * 1000),
      ownerId: agent2.id,
      ownerType: "agent",
      type: "agent",
    },
    {
      id: "msg-2-5",
      content:
        "Great! Let's also consider adding keyboard shortcuts. Power users would love that.",
      timestamp: new Date(conv2Start.getTime() + 28 * 60 * 1000),
      ownerId: user3.id,
      ownerType: "user",
      type: "user",
    },
    {
      id: "msg-2-6",
      content:
        "Excellent idea. Keyboard shortcuts can increase productivity by 30% for frequent users. I'll include that in the proposal.",
      timestamp: new Date(conv2Start.getTime() + 35 * 60 * 1000),
      ownerId: agent2.id,
      ownerType: "agent",
      type: "agent",
    },
    {
      id: "msg-2-7",
      content:
        "Perfect. Let's aim to have this ready for next week's sprint planning.",
      timestamp: new Date(conv2Start.getTime() + 42 * 60 * 1000),
      ownerId: locutorId,
      ownerType: "user",
      type: "user",
    },
    {
      id: "msg-2-8",
      content: "I'll create a task breakdown and estimate the effort required.",
      timestamp: new Date(conv2Start.getTime() + 48 * 60 * 1000),
      ownerId: agent2.id,
      ownerType: "agent",
      type: "agent",
    },
  ];

  const conversation2: Conversation = {
    id: "conv-with-msgs-2",
    title: "Product Feature Review",
    createdAt: conv2Start,
    updatedAt: conv2Messages[conv2Messages.length - 1].timestamp,
    userParticipants: [locutorId, user3.id],
    agentParticipants: [agent2.id],
    messages: conv2Messages,
    description:
      "Reviewing user feedback on the new search feature and planning improvements",
    spaceId: getRandomSpaceId(),
  };

  return [conversation1, conversation2];
}
