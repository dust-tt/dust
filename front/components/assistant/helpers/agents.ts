import type { LightAgentConfigurationType } from "@app/types";

export const rankAgentsByPopularity = (
  agents: LightAgentConfigurationType[],
  limit: number = 12
) => {
  // Step 1: Get the latest versions only
  const latestAgents = getLatestAgents(agents);

  // Step 2: Calculate popularity scores
  const scoredAgents = latestAgents.map((agent) => ({
    ...agent,
    popularityScore: calculatePopularityScore(agent),
  }));

  // Step 3: Sort by popularity (highest first)
  const sortedAgents = scoredAgents.sort(
    (a, b) => b.popularityScore - a.popularityScore
  );

  return sortedAgents.slice(0, limit);
};

const calculatePopularityScore = (agent: LightAgentConfigurationType) => {
  const { messageCount, conversationCount, userCount, timePeriodSec } =
    agent.usage ?? {
      messageCount: 0,
      conversationCount: 0,
      userCount: 0,
      timePeriodSec: 86400, // Default to 1 day
    };
  const feedback = agent.feedbacks ?? { up: 0, down: 0 };

  // Normalize to daily metrics
  const days = timePeriodSec / 86400;
  const dailyMessages = messageCount / days;
  const dailyConversations = conversationCount / days;
  const dailyUsers = userCount / days;

  // Base engagement score
  const baseScore =
    dailyMessages * 0.3 + dailyConversations * 0.4 + dailyUsers * 0.3;

  // Feedback calculation with up/down votes
  const feedbackMultiplier = calculateFeedbackMultiplier(feedback);

  // Internal agents might have different baseline expectations
  const typeMultiplier = isInternal(agent) ? 1.0 : 1.1;

  return baseScore * feedbackMultiplier * typeMultiplier;
};

const calculateFeedbackMultiplier = (feedback: {
  up: number;
  down: number;
}) => {
  const totalVotes = feedback.up + feedback.down;
  if (totalVotes === 0) {
    return 1.0; // Neutral if no feedback
  }

  const positiveRatio = feedback.up / totalVotes;
  return Math.max(0.5, 0.5 + positiveRatio); // Range: 0.5 to 1.5
};

const isNewer = (
  agentA: LightAgentConfigurationType,
  agentB: LightAgentConfigurationType
) => {
  // For internal agents, try to parse version numbers
  if (
    isInternal(agentA) &&
    isInternal(agentB) &&
    agentA.lastAuthors?.[0] === agentB.lastAuthors?.[0]
  ) {
    const versionA = extractVersion(agentA.name);
    const versionB = extractVersion(agentB.name);

    if (versionA && versionB) {
      return compareVersions(versionA, versionB) > 0;
    }
  }

  if (!agentA.versionCreatedAt || !agentB.versionCreatedAt) {
    return false;
  }

  // Fallback to creation date or last activity
  return agentA.versionCreatedAt > agentB.versionCreatedAt;
};
const compareVersions = (versionA: string, versionB: string) => {
  // Handle special cases first
  if (versionA === versionB) {
    return 0;
  }

  // Normalize versions: extract numbers and suffixes
  const parseVersion = (version: string) => {
    const match = version.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(.*)$/);
    if (!match) {
      return { major: 0, minor: 0, patch: 0, suffix: version };
    }

    return {
      major: parseInt(match[1]) || 0,
      minor: parseInt(match[2]) || 0,
      patch: parseInt(match[3]) || 0,
      suffix: match[4] || "",
    };
  };

  const a = parseVersion(versionA);
  const b = parseVersion(versionB);

  // Compare major.minor.patch
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }
  if (a.patch !== b.patch) {
    return a.patch - b.patch;
  }

  // Handle suffixes (like "o" in "gpt-4o", "turbo", etc.)
  return compareSuffixes(a.suffix, b.suffix);
};

const extractVersion = (name: string) => {
  // Extract version numbers like "gpt-4", "gpt-4o", "claude-3.5"
  const match = name.match(/(\d+(?:\.\d+)*[a-z]*)/);
  return match ? match[1] : null;
};

const compareSuffixes = (suffixA: string, suffixB: string) => {
  if (suffixA === suffixB) {
    return 0;
  }
  if (!suffixA && suffixB) {
    return -1;
  }
  if (suffixA && !suffixB) {
    return 1;
  }

  // Define suffix priority (newer/better versions)
  const suffixPriority: Record<string, number> = {
    "": 0,
    turbo: 1,
    o: 2, // gpt-4o is newer than gpt-4
    omni: 2, // alternative naming
    pro: 3,
    ultra: 4,
  };

  const priorityA = suffixPriority[suffixA.toLowerCase()] ?? -1;
  const priorityB = suffixPriority[suffixB.toLowerCase()] ?? -1;

  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }

  // Fallback to alphabetical
  return suffixA.localeCompare(suffixB);
};

const isInternal = (agent: LightAgentConfigurationType) => {
  return agent.id === -1;
};

const getLatestAgents = (agents: LightAgentConfigurationType[]) => {
  const agentGroups: Record<string, LightAgentConfigurationType[]> = {};

  agents.forEach((agent) => {
    // Group by author (for internal agents like gpt-4, gpt-4o, etc.)
    const author = agent.lastAuthors?.[0] ?? agent.sId;
    const key = isInternal(agent) ? author : agent.sId;

    if (!agentGroups[key]) {
      agentGroups[key] = [];
    }
    agentGroups[key].push(agent);
  });

  // For each group, keep only the most recent
  return Object.values(agentGroups).map((group) => {
    return group.reduce((latest, current) => {
      // Compare by creation date, version number, or last activity
      // Assuming you have a way to determine which is newer
      return isNewer(current, latest) ? current : latest;
    });
  });
};
