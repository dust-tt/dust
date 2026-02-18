const PERIOD_OPTIONS = [7, 14, 30, 90] as const;
export type PeriodDays = (typeof PERIOD_OPTIONS)[number];

export const DEFAULT_PERIOD: PeriodDays = 30;

export function getMockOverview(period: number) {
  const scale = period / 30;
  return {
    totalMembers: 42,
    activeUsers: Math.min(42, Math.round(28 * scale)),
    period,
  };
}

export function getMockInsightMetrics() {
  return {
    pctMau: 88,
    pctMauTrend: 3,
    recurrence: 3.2,
    pctCustomAgentUsers: 64,
    pctCustomAgentUsersTrend: -2,
  };
}

export function getMockAdoptionMetrics() {
  return {
    pctDau: 42,
    pctWau: 55,
    pctMau: 67,
    mauWauRatio: 0.82,
    pctCustomAgents: 45,
  };
}

export function getMockBenchmarkGauge() {
  return {
    yourPct: 88,
    similarPct: 71,
    sizeBucket: "50–200 members",
    available: true,
  };
}

export function getMockWorkspaceHealth() {
  const metrics = [
    {
      key: "coverage" as const,
      label: "Coverage",
      description: "Members who know about Dust (signups vs employees)",
      valuePct: 88,
      trendPct: 6,
    },
    {
      key: "activity" as const,
      label: "Activity",
      description: "Members finding value (MAU vs signups)",
      valuePct: 71,
      trendPct: 6,
    },
    {
      key: "stickiness" as const,
      label: "Stickiness",
      description: "Weekly return rate (WAU / MAU)",
      valuePct: 64,
      trendPct: 6,
    },
    {
      key: "advancedUsage" as const,
      label: "Advanced usage",
      description: "Share of usage that is advanced (retrieval, company data, multi-step workflows) vs generic (simple Q&A)",
      valuePct: 35,
      trendPct: 4,
    },
  ];
  const score = Math.round(metrics.reduce((s, m) => s + m.valuePct, 0) / metrics.length);
  const focusArea = metrics.reduce((low, m) => (m.valuePct < low.valuePct ? m : low), metrics[0]);
  return {
    score,
    metrics,
    focusArea: focusArea.label,
  };
}

export function getMockAdoptionOverTime(period: number) {
  const now = new Date();
  const numPoints = Math.min(12, Math.max(4, Math.floor(period / 7)));
  const points: { date: string; label: string; yourPct: number; peerPct: number }[] = [];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let i = numPoints - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - Math.round((i * period) / numPoints));
    const month = d.getMonth();
    const year = d.getFullYear();
    const day = d.getDate();
    const label = `${monthNames[month]} ${day}`;
    const t = i / numPoints;
    const yourPct = Math.round(32 + (1 - t) * 38 + Math.sin(i * 0.8) * 5);
    const peerPct = Math.round(30 + (1 - t) * 25 + Math.sin(i * 0.5) * 3);
    points.push({
      date: d.toISOString().slice(0, 10),
      label,
      yourPct: Math.min(100, Math.max(0, yourPct)),
      peerPct: Math.min(100, Math.max(0, peerPct)),
    });
  }
  points.reverse();
  const currentScore = points.length > 0 ? Math.round((points[points.length - 1].yourPct + points[points.length - 1].peerPct) / 2) + 12 : 72;
  return {
    score: Math.min(100, currentScore),
    scoreLabel: `${Math.min(100, currentScore)}/100 points`,
    description: "The adoption score is inferred from how your workspace uses Dust: agent usage, builder activity, and agent complexity.",
    scoreFactors: [
      { label: "Agent usage", detail: "How often agents are used across the workspace" },
      { label: "Builder activity", detail: "How actively members create and configure agents" },
      { label: "Agent complexity", detail: "Depth of agent setup (tools, instructions, knowledge)" },
    ],
    data: points,
    lastUpdated: now.toISOString().slice(0, 10),
    sizeBucket: "50–200 members",
  };
}

export function getMockAdoptionByDepartment(period: number) {
  const scale = period / 30;
  const base = [
    { department: "Engineering", active: 42, total: 50, pct: 84 },
    { department: "Sales", active: 28, total: 35, pct: 80 },
    { department: "Product", active: 18, total: 25, pct: 72 },
    { department: "Marketing", active: 12, total: 22, pct: 55 },
    { department: "Support", active: 8, total: 20, pct: 40 },
    { department: "HR", active: 3, total: 12, pct: 25 },
  ];
  return base
    .map((r) => {
      const pct = Math.min(100, Math.max(0, Math.round(r.pct * (0.9 + 0.1 * Math.min(1, scale)))));
      const total = Math.max(1, Math.round(r.total * Math.min(1.2, scale)));
      const active = Math.min(total, Math.round(total * (pct / 100)));
      return { ...r, active, total, pct };
    })
    .sort((a, b) => b.pct - a.pct);
}

export function getMockHumanTimeSaved(period: number) {
  const hoursSaved = 1245;
  const businessDays = Math.round(period * (5 / 7));
  const fteEquivalent = businessDays > 0 ? (hoursSaved / (8 * businessDays)) : 0;
  return {
    hoursSaved,
    period,
    fteEquivalent: Math.round(fteEquivalent * 10) / 10,
    estimatedValueEur: 62250,
    trendPct: 12,
  };
}

export function getMockImpactClassification() {
  return {
    available: true,
    categories: [
      { key: "advanced", label: "Advanced use case", count: 1200, pct: 35, color: "green" },
      { key: "generic", label: "Generic usage", count: 2200, pct: 65, color: "grey" },
    ],
  };
}

export function getMockImpactOverTime(period: number) {
  const numWeeks = Math.min(20, Math.max(4, Math.floor(period / 7)));
  return Array.from({ length: numWeeks }, (_, i) => ({
    week: `W${i + 1}`,
    advancedUseCase: Math.round(120 + i * 8 + Math.sin(i * 0.5) * 25),
    genericUsage: Math.round(180 + i * 4 + Math.sin(i * 0.3) * 20),
  }));
}

export const MOCK_USE_CASE_CHAMPIONS = [
  { userId: "u1", name: "Alice Martin", imageUrl: null, department: "Engineering", advancedMessages: 420, pctOfTotal: 33.6, topAgentUsed: "Research" },
  { userId: "u2", name: "Bob Chen", imageUrl: null, department: "Sales", advancedMessages: 310, pctOfTotal: 24.8, topAgentUsed: "Sales Copilot" },
  { userId: "u3", name: "Claire Dupont", imageUrl: null, department: "Product", advancedMessages: 198, pctOfTotal: 15.8, topAgentUsed: "Code Helper" },
  { userId: "u4", name: "David Kim", imageUrl: null, department: "Engineering", advancedMessages: 156, pctOfTotal: 12.5, topAgentUsed: "General Agent" },
  { userId: "u5", name: "Emma Wilson", imageUrl: null, department: "Marketing", advancedMessages: 98, pctOfTotal: 7.8, topAgentUsed: "Support Agent" },
  { userId: "u6", name: "Frank Lee", imageUrl: null, department: "Support", advancedMessages: 42, pctOfTotal: 3.4, topAgentUsed: "Support Agent" },
  { userId: "u7", name: "Grace Hopper", imageUrl: null, department: "Engineering", advancedMessages: 18, pctOfTotal: 1.4, topAgentUsed: "Research" },
  { userId: "u8", name: "Henry Ford", imageUrl: null, department: "Sales", advancedMessages: 6, pctOfTotal: 0.5, topAgentUsed: "Sales Copilot" },
  { userId: "u9", name: "Ivy Chen", imageUrl: null, department: "Product", advancedMessages: 3, pctOfTotal: 0.2, topAgentUsed: "Code Helper" },
  { userId: "u10", name: "Jack Smith", imageUrl: null, department: "HR", advancedMessages: 1, pctOfTotal: 0.1, topAgentUsed: "General Agent" },
];

export function getMockCreditConsumptionBySource(period: number) {
  const dates = generateDateRange(period);
  const rng = seeded(period + 9999);
  return dates.map((date, i) => ({
    date,
    web: Math.round(80 + Math.sin(i / 2) * 20),
    extension: Math.round(30 + (i % 5) * 5),
    slack: Math.round(50 + Math.sin(i / 3) * 15),
    api: Math.round(120 + i * 2 + rng() * 30),
    other: Math.round(20 + (i % 3) * 8),
  }));
}

export function getMockProgrammaticCostByAgent(period: number) {
  const scale = period / 30;
  const base = [
    { agentId: "a1", name: "General Agent", pictureUrl: null, apiMessages: 2100, uniqueApiKeysUsed: 12, costUsd: 42, trendData: [38, 40, 41, 42, 42], creator: "—" },
    { agentId: "a2", name: "Sales Copilot", pictureUrl: null, apiMessages: 890, uniqueApiKeysUsed: 5, costUsd: 18, trendData: [14, 16, 17, 18, 18], creator: "Bob Chen" },
    { agentId: "a7", name: "Data Analyst", pictureUrl: null, apiMessages: 185, uniqueApiKeysUsed: 3, costUsd: 4, trendData: [3, 3, 4, 4, 4], creator: "Alice Martin" },
    { agentId: "a5", name: "Code Helper", pictureUrl: null, apiMessages: 298, uniqueApiKeysUsed: 4, costUsd: 6, trendData: [5, 5, 6, 6, 6], creator: "David Kim" },
    { agentId: "a12", name: "Slack Bot", pictureUrl: null, apiMessages: 43, uniqueApiKeysUsed: 2, costUsd: 1, trendData: [0, 1, 1, 1, 1], creator: "Alice Martin" },
    { agentId: "a3", name: "Support Agent", pictureUrl: null, apiMessages: 654, uniqueApiKeysUsed: 6, costUsd: 12, trendData: [10, 11, 11, 12, 12], creator: "Alice Martin" },
    { agentId: "a4", name: "Research", pictureUrl: null, apiMessages: 432, uniqueApiKeysUsed: 4, costUsd: 9, trendData: [7, 8, 8, 9, 9], creator: "Claire Dupont" },
    { agentId: "a6", name: "Onboarding Bot", pictureUrl: null, apiMessages: 210, uniqueApiKeysUsed: 2, costUsd: 4, trendData: [3, 4, 4, 4, 4], creator: "Emma Wilson" },
    { agentId: "a8", name: "Content Writer", pictureUrl: null, apiMessages: 142, uniqueApiKeysUsed: 2, costUsd: 3, trendData: [2, 3, 3, 3, 3], creator: "Frank Lee" },
    { agentId: "a9", name: "QA Agent", pictureUrl: null, apiMessages: 98, uniqueApiKeysUsed: 1, costUsd: 2, trendData: [1, 2, 2, 2, 2], creator: "Grace Hopper" },
    { agentId: "a10", name: "HR Agent", pictureUrl: null, apiMessages: 76, uniqueApiKeysUsed: 1, costUsd: 2, trendData: [1, 1, 2, 2, 2], creator: "Jack Smith" },
    { agentId: "a11", name: "Legal Reviewer", pictureUrl: null, apiMessages: 54, uniqueApiKeysUsed: 1, costUsd: 1, trendData: [1, 1, 1, 1, 1], creator: "Bob Chen" },
    { agentId: "a13", name: "Email Triage", pictureUrl: null, apiMessages: 32, uniqueApiKeysUsed: 1, costUsd: 1, trendData: [0, 0, 1, 1, 1], creator: "David Kim" },
    { agentId: "a14", name: "Meeting Notes", pictureUrl: null, apiMessages: 21, uniqueApiKeysUsed: 1, costUsd: 0.5, trendData: [0, 0, 0, 0.5, 0.5], creator: "Claire Dupont" },
    { agentId: "a15", name: "FAQ Bot", pictureUrl: null, apiMessages: 12, uniqueApiKeysUsed: 1, costUsd: 0.3, trendData: [0, 0, 0, 0, 0.3], creator: "Emma Wilson" },
  ];
  return base
    .filter((r) => r.apiMessages >= 1)
    .map((r) => ({
      ...r,
      apiMessages: Math.round(r.apiMessages * scale),
      costUsd: Math.round(r.costUsd * scale * 100) / 100,
      trendData: r.trendData.map((v) => Math.round(v * scale * 100) / 100),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);
}

export function getMockKnowledgeSourceUsage(period: number) {
  const scale = period / 30;
  const base = [
    { source: "Notion", retrievals: 4200 },
    { source: "Slack", retrievals: 3100 },
    { source: "Google Drive", retrievals: 2850 },
    { source: "GitHub", retrievals: 1900 },
    { source: "Confluence", retrievals: 1200 },
    { source: "Intercom", retrievals: 650 },
  ];
  return base
    .map((r) => ({ ...r, retrievals: Math.round(r.retrievals * scale) }))
    .sort((a, b) => b.retrievals - a.retrievals);
}

export const MOCK_TOP_BUILDERS = [
  { userId: "u1", name: "Alice Martin", imageUrl: null, agentCount: 12, messageCount: 3400 },
  { userId: "u2", name: "Bob Chen", imageUrl: null, agentCount: 8, messageCount: 2100 },
  { userId: "u3", name: "Claire Dupont", imageUrl: null, agentCount: 6, messageCount: 1800 },
  { userId: "u4", name: "David Kim", imageUrl: null, agentCount: 4, messageCount: 950 },
  { userId: "u5", name: "Emma Wilson", imageUrl: null, agentCount: 3, messageCount: 620 },
];

export function getMockBenchmark() {
  return {
    adoptionScore: 72,
    percentile: 68,
    label: "Above similar workspaces",
  };
}

export function getMockROI(period: number) {
  return {
    hoursSaved: 124,
    period,
  };
}

export const MOCK_COST_PER_AGENT = [
  { agentId: "a1", name: "General Agent", messageCount: 2100, costUsd: 42 },
  { agentId: "a2", name: "Sales Copilot", messageCount: 890, costUsd: 18 },
  { agentId: "a3", name: "Support Agent", messageCount: 654, costUsd: 12 },
  { agentId: "a4", name: "Research", messageCount: 432, costUsd: 9 },
  { agentId: "a5", name: "Code Helper", messageCount: 298, costUsd: 6 },
];

function generateDateRange(days: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

export function getMockUsageMetrics(period: number) {
  const dates = generateDateRange(period);
  const rng = seeded(period + 12345);
  return dates.map((date, i) => {
    const base = 80 + Math.sin(i / 3) * 40 + rng() * 30;
    return {
      date,
      timestamp: new Date(date).getTime(),
      count: Math.round(base + rng() * 50),
      conversations: Math.round(base * 0.4 + rng() * 20),
      dau: Math.round(15 + rng() * 12),
      wau: Math.round(22 + rng() * 8),
      mau: Math.round(26 + rng() * 4),
    };
  });
}

export function getMockSourceData(period: number) {
  const scale = period / 30;
  const base = [
    { origin: "web", label: "Web", count: 1250 },
    { origin: "slack", label: "Slack", count: 820 },
    { origin: "api", label: "API", count: 340 },
    { origin: "extension", label: "Extension", count: 190 },
    { origin: "mobile", label: "Mobile", count: 90 },
  ];
  return base.map((r) => ({ ...r, count: Math.round(r.count * scale) }));
}

export function getMockToolUsage(period: number) {
  const dates = generateDateRange(period);
  const tools = ["web_search", "code_interpreter", "read_file", "google_drive"];
  const rng = seeded(period + 7777);
  return dates.map((date, i) => {
    const values: Record<string, number> = {};
    tools.forEach((tool, t) => {
      values[tool] = Math.round(
        (20 + Math.sin((i + t) / 2) * 10 + rng() * 15)
      );
    });
    return {
      date,
      timestamp: new Date(date).getTime(),
      values,
    };
  });
}

const FAKE_AVATAR = (id: string) => `https://i.pravatar.cc/150?u=${encodeURIComponent(id)}`;

export function getMockTopUsers(period: number) {
  const scale = period / 30;
  const base = [
    { userId: "u1", name: "Alice Martin", imageUrl: FAKE_AVATAR("u1"), messageCount: 1240, agentCount: 8, department: "Engineering" as string | null },
    { userId: "u2", name: "Bob Chen", imageUrl: FAKE_AVATAR("u2"), messageCount: 980, agentCount: 5, department: "Sales" as string | null },
    { userId: "u3", name: "Claire Dupont", imageUrl: FAKE_AVATAR("u3"), messageCount: 756, agentCount: 6, department: "Product" as string | null },
    { userId: "u4", name: "David Kim", imageUrl: FAKE_AVATAR("u4"), messageCount: 612, agentCount: 4, department: "Engineering" as string | null },
    { userId: "u5", name: "Emma Wilson", imageUrl: FAKE_AVATAR("u5"), messageCount: 489, agentCount: 3, department: "Marketing" as string | null },
  ];
  return base.map((r) => ({ ...r, messageCount: Math.round(r.messageCount * scale) }));
}

const AGENT_EMOJIS = ["🤖", "📊", "🛠️", "🔬", "💻"] as const;

export function getMockTopAgents(period: number) {
  const scale = period / 30;
  const base = [
    { agentId: "a1", name: "General Agent", emoji: AGENT_EMOJIS[0], messageCount: 2100, userCount: 24, type: "global" as const, creator: "—" },
    { agentId: "a2", name: "Sales Copilot", emoji: AGENT_EMOJIS[1], messageCount: 890, userCount: 12, type: "custom" as const, creator: "Bob Chen" },
    { agentId: "a3", name: "Support Agent", emoji: AGENT_EMOJIS[2], messageCount: 654, userCount: 9, type: "custom" as const, creator: "Alice Martin" },
    { agentId: "a4", name: "Research", emoji: AGENT_EMOJIS[3], messageCount: 432, userCount: 7, type: "custom" as const, creator: "Claire Dupont" },
    { agentId: "a5", name: "Code Helper", emoji: AGENT_EMOJIS[4], messageCount: 298, userCount: 5, type: "custom" as const, creator: "David Kim" },
  ];
  return base.map((r) => ({ ...r, messageCount: Math.round(r.messageCount * scale), userCount: Math.round(r.userCount * scale) }));
}

export function getMockTopBuildersExtended(period: number) {
  const scale = period / 30;
  const base = [
    { userId: "u1", name: "Alice Martin", imageUrl: FAKE_AVATAR("u1"), department: "Engineering", agentsCreated: 12, totalConfigurations: 18, usageOfTheirAgents: 3400 },
    { userId: "u2", name: "Bob Chen", imageUrl: FAKE_AVATAR("u2"), department: "Sales", agentsCreated: 8, totalConfigurations: 11, usageOfTheirAgents: 2100 },
    { userId: "u3", name: "Claire Dupont", imageUrl: FAKE_AVATAR("u3"), department: "Product", agentsCreated: 6, totalConfigurations: 8, usageOfTheirAgents: 1800 },
    { userId: "u4", name: "David Kim", imageUrl: FAKE_AVATAR("u4"), department: "Engineering", agentsCreated: 4, totalConfigurations: 6, usageOfTheirAgents: 950 },
    { userId: "u5", name: "Emma Wilson", imageUrl: FAKE_AVATAR("u5"), department: "Marketing", agentsCreated: 3, totalConfigurations: 4, usageOfTheirAgents: 620 },
    { userId: "u6", name: "Frank Lee", imageUrl: FAKE_AVATAR("u6"), department: "Support", agentsCreated: 2, totalConfigurations: 3, usageOfTheirAgents: 380 },
    { userId: "u7", name: "Grace Hopper", imageUrl: FAKE_AVATAR("u7"), department: "Engineering", agentsCreated: 2, totalConfigurations: 2, usageOfTheirAgents: 210 },
    { userId: "u8", name: "Henry Ford", imageUrl: FAKE_AVATAR("u8"), department: "Sales", agentsCreated: 1, totalConfigurations: 1, usageOfTheirAgents: 95 },
    { userId: "u9", name: "Ivy Chen", imageUrl: FAKE_AVATAR("u9"), department: "Product", agentsCreated: 1, totalConfigurations: 1, usageOfTheirAgents: 42 },
    { userId: "u10", name: "Jack Smith", imageUrl: FAKE_AVATAR("u10"), department: "HR", agentsCreated: 1, totalConfigurations: 1, usageOfTheirAgents: 18 },
  ];
  return base.map((r) => ({
    ...r,
    usageOfTheirAgents: Math.round(r.usageOfTheirAgents * scale),
  }));
}

export function getMockMonthOptions(): string[] {
  const options: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    options.push(`${year}-${month}`);
  }
  return options;
}
