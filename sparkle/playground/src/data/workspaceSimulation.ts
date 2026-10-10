import { registerAgents } from "./agents";
import {
  AGENT_INSTRUCTIONS,
  type ManagedAgent,
  type ManagedSkill,
  MOCK_AGENT_TAGS,
  MOCK_MODELS,
  mockManagedAgents,
  mockManagedSkills,
} from "./build";
import { mockCompanySpaces } from "./companySpaces";
import {
  conversationTitles,
  createConversationsWithMessages,
  generateDescription,
} from "./conversations";
import {
  generateDataSourcesForSpace,
  generateFilesInFolder,
  getIconForFileType,
} from "./dataSources";
import { derivePodFiles, indexFilesByParentId, isPodFile } from "./fileMoves";
import { createMockRequests } from "./requests";
import { mockSpaces } from "./spaces";
import { createMockTriggers, createTriggeredConversations } from "./triggers";
import type {
  AdminRequest,
  Conversation,
  ConversationWorkState,
  DataSource,
  Space,
  Trigger,
  WakeUp,
} from "./types";
import { mockUsers } from "./users";
import { createMockWakeUps } from "./wakeups";

// ═════════════════════════════════════════════════════════════════════════════
// One workspace, one file system.
//
// Every surface of the Dust File System story — the sidebar Pods, the Inbox,
// Build, a Pod's Files tab and the Files tree — reads from the single model
// built here, so the same Pod, conversation, agent or file is the same thing
// wherever it shows up. The two profiles are the whole point: `clean` is a
// workspace nobody has used yet, `mature` is one a company has lived in.
//
// Everything is seeded from ids, so a profile always builds the same
// workspace: switching back and forth does not reshuffle it.
// ═════════════════════════════════════════════════════════════════════════════

export type WorkspaceProfile = "clean" | "mature";

export interface WorkspaceModel {
  profile: WorkspaceProfile;
  pods: Space[];
  companySpaces: Space[];
  agents: ManagedAgent[];
  skills: ManagedSkill[];
  /** Pod and personal conversations. Trigger runs are kept apart, below. */
  conversations: Conversation[];
  triggeredConversations: Conversation[];
  triggers: Trigger[];
  wakeUps: WakeUp[];
  requests: AdminRequest[];
  /** Every folder and file of the workspace, in tree order. */
  files: DataSource[];
  filesByParentId: Map<string | null, DataSource[]>;
  /**
   * The containing folder's files for each Pod, rooted at `null`.
   */
  podFilesBySpaceId: Map<string, DataSource[]>;
  conversationFilesByConversationId: Map<string, DataSource[]>;
}

// ── Seeded randomness ────────────────────────────────────────────────────────

/**
 * The other data modules seed from the sum of a string's char codes, which
 * collides on anagrams — "space-12" and "space-21" would build the same Pod.
 * This workspace addresses spaces by those very ids, so it hashes properly.
 */
function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rand(seed: string, index: number): number {
  let x = hashSeed(seed) ^ Math.imul(index + 1, 2654435761);
  x = Math.imul(x ^ (x >>> 15), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function randInt(
  seed: string,
  index: number,
  min: number,
  max: number
): number {
  return min + Math.floor(rand(seed, index) * (max - min + 1));
}

function pickOne<T>(items: T[], seed: string, index: number): T {
  return items[Math.floor(rand(seed, index) * items.length)];
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  return items
    .map((item, index) => ({ item, key: rand(seed, index) }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.item);
}

function seededDate(seed: string, index: number, maxDaysAgo: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(rand(seed, index) * maxDaysAgo));
  date.setHours(
    randInt(seed, index + 1, 8, 19),
    randInt(seed, index + 2, 0, 59),
    0,
    0
  );
  return date;
}

// ── Folder blueprints ────────────────────────────────────────────────────────

interface FolderSpec {
  name: string;
  /** How many files sit directly in this folder, as a [min, max] range. */
  files?: [number, number];
  children?: FolderSpec[];
}

/**
 * What each Company Space holds, so a mature workspace reads like a company's
 * shared drive rather than a pile of folders named "Design" and "Archive".
 */
const COMPANY_SPACE_TREES: Record<string, FolderSpec[]> = {
  "company-space-1": [
    { name: "Handbook", files: [4, 8] },
    {
      name: "Policies",
      files: [2, 4],
      children: [
        { name: "Security", files: [3, 6] },
        { name: "Travel & Expenses", files: [2, 5] },
        { name: "Remote Work", files: [2, 4] },
      ],
    },
    {
      name: "People",
      children: [
        { name: "Onboarding", files: [4, 9] },
        { name: "Performance Reviews", files: [3, 7] },
        { name: "Compensation Bands", files: [2, 4] },
      ],
    },
    {
      name: "Finance",
      children: [
        {
          name: "Budgets",
          files: [4, 8],
          children: [{ name: "FY26", files: [3, 6] }],
        },
        { name: "Invoices", files: [6, 14] },
      ],
    },
  ],
  "company-space-2": [
    {
      name: "Architecture",
      files: [2, 4],
      children: [
        { name: "Decision Records", files: [6, 14] },
        { name: "Diagrams", files: [3, 7] },
      ],
    },
    {
      name: "Runbooks",
      children: [
        { name: "On-call", files: [4, 9] },
        { name: "Incidents", files: [5, 12] },
      ],
    },
    {
      name: "Services",
      children: [
        { name: "API", files: [4, 9] },
        { name: "Web", files: [3, 8] },
        { name: "Data Platform", files: [3, 8] },
      ],
    },
    {
      name: "Postmortems",
      children: [
        { name: "2025", files: [4, 9] },
        { name: "2026", files: [3, 7] },
      ],
    },
  ],
  "company-space-3": [
    {
      name: "Decks",
      children: [
        { name: "Enterprise", files: [4, 9] },
        { name: "Mid-market", files: [3, 7] },
      ],
    },
    { name: "Battlecards", files: [5, 11] },
    {
      name: "Pricing",
      files: [2, 4],
      children: [{ name: "FY26", files: [3, 6] }],
    },
    { name: "Case Studies", files: [5, 12] },
  ],
  "company-space-4": [
    { name: "Macros", files: [6, 14] },
    { name: "Escalation Paths", files: [2, 5] },
    {
      name: "Knowledge Base",
      children: [
        { name: "How-tos", files: [8, 18] },
        { name: "Troubleshooting", files: [6, 14] },
      ],
    },
  ],
  "company-space-5": [
    {
      name: "Contracts",
      children: [
        { name: "MSAs", files: [5, 12] },
        { name: "DPAs", files: [4, 9] },
        { name: "NDAs", files: [6, 14] },
      ],
    },
    {
      name: "Audits",
      children: [
        { name: "SOC 2", files: [4, 9] },
        { name: "ISO 27001", files: [3, 7] },
      ],
    },
    { name: "Policies", files: [3, 7] },
  ],
  "company-space-6": [
    {
      name: "Campaigns",
      children: [
        { name: "Q1", files: [3, 7] },
        { name: "Q2", files: [3, 7] },
        { name: "Q3", files: [3, 7] },
        { name: "Q4", files: [3, 7] },
      ],
    },
    { name: "Brand Assets", files: [6, 14] },
    { name: "Launches", files: [4, 9] },
    {
      name: "Content",
      children: [
        { name: "Blog", files: [8, 16] },
        { name: "Webinars", files: [3, 7] },
      ],
    },
  ],
  "company-space-7": [
    {
      name: "Board",
      children: [
        { name: "2025", files: [4, 8] },
        { name: "2026", files: [3, 6] },
      ],
    },
    { name: "Headcount Plans", files: [3, 7] },
    { name: "QBRs", files: [4, 9] },
    { name: "Strategy", files: [3, 7] },
  ],
};

/** The folders a Pod grows for itself, on top of its own files. */
const POD_EXTRA_FOLDERS: FolderSpec[] = [
  { name: "Meeting Notes", files: [3, 9] },
  { name: "Specs", files: [2, 7] },
  { name: "Handover", files: [1, 4] },
];

/**
 * The file system has no Spaces: what a Company Space held is filed in a plain
 * department folder instead. Company Data has none — its folders, and the
 * workspace-wide documents sit at the top level.
 */
const DEPARTMENT_FOLDER_NAMES: Record<string, string> = {
  "company-space-2": "Engineering",
  "company-space-3": "Sales",
  "company-space-4": "Support",
  "company-space-5": "Legal",
  "company-space-6": "Marketing",
  "company-space-7": "Leadership",
};

/** Plain root folders kept for Pods that belong to no department. */
const POD_GROUP_FOLDERS = ["Projects", "Customers"];
/** How often a Pod is filed inside the tree rather than left at the top. */
const POD_FILED_ODDS = 0.9;
/** Of the filed Pods, how many go one level deeper than a top-level folder. */
const POD_NESTED_ODDS = 0.35;

const ONBOARDING_DOCS = [
  "Welcome to Dust.md",
  "Workspace guidelines.md",
  "Connect your data.md",
];

const GENERATED_AGENT_SUFFIXES = [
  "Assistant",
  "Analyst",
  "Copilot",
  "Desk",
  "Scout",
];
const GENERATED_AGENT_EMOJIS = ["🧭", "📈", "🛠️", "🧪", "📊", "🗺️", "⚙️", "🧰"];
const GENERATED_AGENT_COLORS = [
  "bg-blue-100",
  "bg-emerald-100",
  "bg-golden-100",
  "bg-rose-100",
  "bg-violet-100",
];

// ── Builder ──────────────────────────────────────────────────────────────────

const MATURE_POD_COUNT = 60;
/** Two Pods in a hundred have been created and never filled. */
const EMPTY_POD_ODDS = 0.02;

interface Builder {
  files: DataSource[];
  push: (file: DataSource) => DataSource;
  /** Ids for folders that have no entity of their own to borrow one from. */
  nextFolderId: () => string;
}

/**
 * Pass `nextFolderId` to collect files apart from the main tree while still
 * drawing ids from it, so the two never name the same folder twice.
 */
function createBuilder(nextFolderId?: () => string): Builder {
  const files: DataSource[] = [];
  let folderCount = 0;
  return {
    files,
    push: (file) => {
      files.push(file);
      return file;
    },
    nextFolderId: nextFolderId ?? (() => `fs-folder-${folderCount++}`),
  };
}

function addFolderTree(
  builder: Builder,
  specs: FolderSpec[],
  parentId: string | null,
  source: DataSource["source"],
  seedPrefix: string
): void {
  specs.forEach((spec) => {
    const seed = `${seedPrefix}/${spec.name}`;
    const id = builder.nextFolderId();
    builder.push({
      id,
      kind: "folder",
      fileName: spec.name,
      parentId,
      source,
      createdBy: pickOne(mockUsers, seed, 0).id,
      createdAt: seededDate(seed, 1, 400),
      updatedAt: seededDate(seed, 4, 90),
    });

    if (spec.files) {
      const [min, max] = spec.files;
      generateFilesInFolder({
        seed,
        count: randInt(seed, 7, min, max),
        parentId: id,
        source,
      }).forEach(builder.push);
    }

    if (spec.children) {
      addFolderTree(builder, spec.children, id, source, seed);
    }
  });
}

function addPodFile(
  builder: Builder,
  pod: Space,
  parentId: string | null
): string {
  const id = `fs-pod-${pod.id}`;
  builder.push({
    id,
    kind: "file",
    fileName: pod.name,
    parentId,
    source: "pod",
    fileType: "pod",
    refId: pod.id,
    createdBy: pickOne(mockUsers, pod.id, 0).id,
    createdAt: seededDate(pod.id, 1, 500),
    updatedAt: seededDate(pod.id, 4, 30),
  });
  return id;
}

/** A plain folder with an id of its own, for the ones others are filed under. */
function addNamedFolder(
  builder: Builder,
  id: string,
  name: string,
  source: DataSource["source"],
  parentId: string | null = null
): string {
  builder.push({
    id,
    kind: "folder",
    fileName: name,
    parentId,
    source,
    createdBy: pickOne(mockUsers, id, 0).id,
    createdAt: seededDate(id, 1, 500),
    updatedAt: seededDate(id, 4, 30),
  });
  return id;
}

function workStateFor(seed: string): {
  workState?: ConversationWorkState;
  unreadCount?: number;
} {
  const roll = rand(seed, 50);
  if (roll < 0.06) {
    return { workState: "thinking" };
  }
  if (roll < 0.14) {
    return { workState: "pending" };
  }
  if (roll < 0.3) {
    return { workState: "unread", unreadCount: randInt(seed, 51, 1, 5) };
  }
  return {};
}

function buildCleanWorkspace(currentUserId: string): WorkspaceModel {
  const builder = createBuilder();
  const companyData = mockCompanySpaces[0];

  ONBOARDING_DOCS.forEach((fileName, index) => {
    builder.push({
      id: `fs-onboarding-${index}`,
      kind: "file",
      fileName,
      parentId: null,
      source: "company",
      fileType: "md",
      createdBy: currentUserId,
      createdAt: seededDate("onboarding", index, 2),
      updatedAt: seededDate("onboarding", index + 10, 2),
      icon: getIconForFileType("md"),
    });
  });

  return finalize({
    profile: "clean",
    pods: [],
    companySpaces: [companyData],
    agents: [],
    skills: [],
    conversations: [],
    triggeredConversations: [],
    triggers: [],
    wakeUps: [],
    requests: [],
    files: builder.files,
    conversationFilesByConversationId: new Map(),
  });
}

function buildMatureWorkspace(currentUserId: string): WorkspaceModel {
  const builder = createBuilder();
  const pods = seededShuffle(mockSpaces, "mature-pods").slice(
    0,
    MATURE_POD_COUNT
  );
  const companySpaces = mockCompanySpaces;
  const companyDataId = companySpaces[0].id;

  // ── Agents and skills, owned by a Pod or by the workspace ────────────────
  const skills = assignSkills(pods);
  const agents = assignAgents(pods, skills, companyDataId);
  registerAgents(agents);

  // Conversations use the agents available in their Pod.
  const agentsByPod = new Map<string, ManagedAgent[]>();
  for (const agent of agents) {
    if (agent.status !== "active") {
      continue;
    }
    for (const spaceId of agent.spaceIds) {
      agentsByPod.set(spaceId, [...(agentsByPod.get(spaceId) ?? []), agent]);
    }
  }

  // ── Conversations ────────────────────────────────────────────────────────
  // The ones that carry written messages stay the user's own free
  // conversations; every Pod then gets its own, with that Pod's agents in it.
  const freeConversations = createConversationsWithMessages(currentUserId).map(
    (conversation) => ({ ...conversation, spaceId: undefined })
  );
  const podConversations = pods.flatMap((pod) =>
    buildPodConversations(pod, agentsByPod.get(pod.id) ?? [], currentUserId)
  );
  const conversations = [...freeConversations, ...podConversations];

  const triggers = retargetTriggers(
    createMockTriggers(currentUserId),
    pods,
    agents
  );
  const triggeredConversations = createTriggeredConversations(triggers);
  const wakeUps = createMockWakeUps(conversations, currentUserId);

  // ── Files ────────────────────────────────────────────────────────────────
  const conversationFilesByConversationId = new Map<string, DataSource[]>();

  // Company Data sits at the top level; every other Space becomes a department folder.
  addFolderTree(
    builder,
    COMPANY_SPACE_TREES[companyDataId] ?? [],
    null,
    "company",
    `space/${companyDataId}`
  );
  const departmentIds = companySpaces
    .filter((space) => space.id !== companyDataId)
    .map((space) => {
      const id = addNamedFolder(
        builder,
        `fs-dept-${space.id}`,
        DEPARTMENT_FOLDER_NAMES[space.id] ?? space.name,
        "company"
      );
      addFolderTree(
        builder,
        COMPANY_SPACE_TREES[space.id] ?? [],
        id,
        "company",
        `space/${space.id}`
      );
      return id;
    });

  const podGroupIds = POD_GROUP_FOLDERS.map((name) =>
    addNamedFolder(builder, `fs-pod-group-${name.toLowerCase()}`, name, "pod")
  );

  // Where a Pod can be filed: straight in a department or group folder, or one
  // level down in a department's `Teams` folder.
  const departmentTeamsIds = departmentIds.map((id) =>
    addNamedFolder(builder, `${id}-teams`, "Teams", "company", id)
  );
  const topPodParents = [...departmentIds, ...podGroupIds];

  // Filed Pods are dealt out in turn rather than drawn, so no folder that is
  // there to hold Pods ends up empty.
  let topTurn = 0;
  let nestedTurn = 0;
  const podParentFor = (pod: Space): string | null => {
    // Some Pods have not been filed yet and remain at the workspace root.
    if (rand(pod.id, 95) >= POD_FILED_ODDS) {
      return null;
    }
    if (rand(pod.id, 97) < POD_NESTED_ODDS) {
      return departmentTeamsIds[nestedTurn++ % departmentTeamsIds.length];
    }
    return topPodParents[topTurn++ % topPodParents.length];
  };

  pods.forEach((pod) => {
    const parentId = podParentFor(pod);
    addPodFile(builder, pod, parentId);
    if (rand(pod.id, 90) >= EMPTY_POD_ODDS) {
      const extras = createBuilder(builder.nextFolderId);
      addFolderTree(extras, POD_EXTRA_FOLDERS, null, "pod", `pod/${pod.id}`);
      const podFiles = [
        ...generateDataSourcesForSpace(pod.id, randInt(pod.id, 91, 8, 60)),
        ...extras.files,
      ];
      // Documents sit beside the Pod, never beneath its file.
      podFiles.forEach((file) =>
        builder.push({ ...file, parentId: file.parentId ?? parentId })
      );
    }
  });

  // Conversation attachments stay in the conversation UI, outside the file tree.
  for (const conversation of [...conversations, ...triggeredConversations]) {
    conversationFilesByConversationId.set(
      conversation.id,
      generateFilesInFolder({
        seed: `conv/${conversation.id}`,
        count: randInt(conversation.id, 3, 0, 5),
        parentId: null,
        source: "pod",
      })
    );
  }

  // Skills are ordinary files distributed across the workspace, including its root.
  const skillParents = [
    null,
    ...builder.files
      .filter((file) => file.kind === "folder")
      .map((file) => file.id),
  ];
  skills
    .filter((skill) => skill.status === "active")
    .forEach((skill, index) => {
      builder.push({
        id: `fs-skill-${skill.id}`,
        kind: "file",
        fileName: `${skill.name}.skill.md`,
        parentId: index === 0 ? null : pickOne(skillParents, skill.id, 0),
        source: "company",
        fileType: "skill",
        refId: skill.id,
        createdBy: skill.editorIds[0] ?? mockUsers[0].id,
        createdAt: seededDate(skill.id, 1, 300),
        updatedAt: skill.updatedAt,
        icon: getIconForFileType("skill"),
      });
    });

  return finalize({
    profile: "mature",
    pods,
    companySpaces,
    agents,
    skills,
    conversations,
    triggeredConversations,
    triggers,
    wakeUps,
    requests: createMockRequests(),
    files: builder.files,
    conversationFilesByConversationId,
  });
}

// ── Ownership ────────────────────────────────────────────────────────────────

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

function assignSkills(pods: Space[]): ManagedSkill[] {
  return mockManagedSkills.map((skill) => {
    if (skill.isDustProvided || pods.length === 0) {
      return { ...skill, spaceIds: [] };
    }
    return {
      ...skill,
      spaceIds: [pickOne(pods, skill.id, 11).id],
    };
  });
}

/**
 * Agents belong to a Pod, except the global ones Dust ships and a third of the
 * rest, which the workspace shares across every Pod. An agent's skills are
 * then narrowed to what it can actually reach: its own Pod's, plus the
 * workspace-wide ones.
 */
function assignAgents(
  pods: Space[],
  skills: ManagedSkill[],
  companyDataId: string
): ManagedAgent[] {
  const workspaceSkillIds = skills
    .filter((skill) => skill.spaceIds.length === 0)
    .map((skill) => skill.id);
  const skillsByPodId = groupBy(
    skills.filter((skill) => skill.spaceIds.length > 0),
    (skill) => skill.spaceIds[0]
  );

  const scopeToSkills = (agent: ManagedAgent, podIds: string[]) => {
    const reachable = new Set([
      ...workspaceSkillIds,
      ...podIds.flatMap((podId) =>
        (skillsByPodId.get(podId) ?? []).map((skill) => skill.id)
      ),
    ]);
    return agent.skillIds.filter((skillId) => reachable.has(skillId));
  };

  const assign = (agent: ManagedAgent): ManagedAgent => {
    if (agent.scope === "global" || pods.length === 0) {
      return { ...agent, spaceIds: [], skillIds: [] };
    }
    if (rand(agent.id, 70) < 0.33) {
      return {
        ...agent,
        spaceIds: [companyDataId],
        skillIds: scopeToSkills(agent, []),
      };
    }
    const podIds = seededShuffle(pods, `agent-${agent.id}`)
      .slice(0, randInt(agent.id, 71, 1, 2))
      .map((pod) => pod.id);
    return {
      ...agent,
      spaceIds: podIds,
      skillIds: scopeToSkills(agent, podIds),
    };
  };

  // Pods the catalog already serves; the rest get an agent of their own, so a
  // mature workspace has no Pod sitting there without one.
  const assigned = mockManagedAgents.map(assign);
  const served = new Set(assigned.flatMap((agent) => agent.spaceIds));
  const ownAgents = buildPodAgents(
    pods.filter((pod) => !served.has(pod.id)),
    skills
  ).map((agent) => ({
    ...agent,
    skillIds: scopeToSkills(agent, agent.spaceIds),
  }));

  return [...assigned, ...ownAgents];
}

/**
 * The agents a mature workspace has built for itself, named after the Pod that
 * asked for them. Brings the roster up to the size of a company that has been
 * on Dust for a while.
 */
function buildPodAgents(pods: Space[], skills: ManagedSkill[]): ManagedAgent[] {
  return pods.map((pod) => {
    const seed = `pod-agent-${pod.id}`;
    const base = pod.name.replace(/[^A-Za-z]/g, "");
    return {
      id: `agent-pod-${pod.id}`,
      name: `${base}${pickOne(GENERATED_AGENT_SUFFIXES, seed, 0)}`,
      emoji: pickOne(GENERATED_AGENT_EMOJIS, seed, 1),
      backgroundColor: pickOne(GENERATED_AGENT_COLORS, seed, 2),
      description: `Works the ${pod.name} Pod: ${pod.description.toLowerCase()}`,
      scope: rand(seed, 3) < 0.7 ? "visible" : "hidden",
      status: "active",
      modelId: pickOne(MOCK_MODELS, seed, 4).id,
      tags: [pickOne(MOCK_AGENT_TAGS, seed, 5)],
      editorIds: [pickOne(mockUsers, seed, 6).id],
      usageCount: randInt(seed, 7, 20, 3800),
      feedbackUp: randInt(seed, 8, 0, 48),
      feedbackDown: randInt(seed, 9, 0, 7),
      updatedAt: seededDate(seed, 10, 120),
      canEdit: true,
      instructions: AGENT_INSTRUCTIONS,
      skillIds: seededShuffle(skills, seed)
        .slice(0, randInt(seed, 12, 1, 3))
        .map((skill) => skill.id),
      spaceIds: [pod.id],
    } satisfies ManagedAgent;
  });
}

// ── Conversations ────────────────────────────────────────────────────────────

function buildPodConversations(
  pod: Space,
  podAgents: ManagedAgent[],
  currentUserId: string
): Conversation[] {
  const count = randInt(pod.id, 20, 3, 15);
  const titles = seededShuffle(conversationTitles, `conv-${pod.id}`);

  return Array.from({ length: count }, (_unused, index) => {
    // The `t` keeps the id from ending in `-<digits>`, which the Pod list
    // reads as "a row of conversation <id minus the number>".
    const id = `conv-${pod.id}-t${index}`;
    const title = titles[index % titles.length];
    const createdAt = seededDate(id, 1, 120);
    const updatedAt = seededDate(id, 4, 20);
    const participants = seededShuffle(mockUsers, `users-${id}`)
      .slice(0, randInt(id, 7, 1, 4))
      .map((user) => user.id);
    // The agents in a Pod's conversation are the agents that Pod owns.
    const agentParticipants = seededShuffle(podAgents, `agents-${id}`)
      .slice(0, Math.min(podAgents.length, randInt(id, 8, 1, 2)))
      .map((agent) => agent.id);
    const state = workStateFor(id);
    // The user is in every Pod conversation, but rarely the one who spoke
    // last: the work is mostly agents answering, or a colleague replying.
    const userParticipants = participants.includes(currentUserId)
      ? participants
      : [currentUserId, ...participants.slice(1)];

    return {
      id,
      title,
      createdAt,
      updatedAt: updatedAt > createdAt ? updatedAt : createdAt,
      userParticipants,
      agentParticipants,
      description: generateDescription(title),
      spaceId: pod.id,
      lastSpeaker:
        agentParticipants.length > 0 && rand(id, 9) < 0.7
          ? { id: agentParticipants[0], type: "agent" as const }
          : {
              id: pickOne(userParticipants, id, 10),
              type: "user" as const,
            },
      ...state,
    };
  });
}

/** Points the trigger catalog at Pods and agents this workspace actually has. */
function retargetTriggers(
  triggers: Trigger[],
  pods: Space[],
  agents: ManagedAgent[]
): Trigger[] {
  const usableAgents = agents.filter(
    (agent) => agent.status === "active" && agent.scope !== "global"
  );
  if (pods.length === 0 || usableAgents.length === 0) {
    return [];
  }
  return triggers.map((trigger) => {
    const pod = pickOne(pods, trigger.id, 1);
    const podAgents = usableAgents.filter((agent) =>
      agent.spaceIds.includes(pod.id)
    );
    const agent =
      podAgents.length > 0
        ? pickOne(podAgents, trigger.id, 2)
        : pickOne(usableAgents, trigger.id, 2);
    return { ...trigger, spaceId: pod.id, agentId: agent.id };
  });
}

// ── Assembly ─────────────────────────────────────────────────────────────────

function finalize(
  model: Omit<WorkspaceModel, "filesByParentId" | "podFilesBySpaceId">
): WorkspaceModel {
  const filesByParentId = indexFilesByParentId(model.files);
  return {
    ...model,
    filesByParentId,
    podFilesBySpaceId: derivePodFiles(
      filesByParentId,
      model.files.filter(isPodFile)
    ),
  };
}

/**
 * @cc [owner:spolu,label:product] workspace-visible-files
 * The filesystem MUST contain Pods as leaf files and freely placed skill files.
 * Agents, conversations, and their internal directories MUST NOT appear in the filesystem.
 * Conversations and their attachments MUST remain available outside that filesystem.
 */
export function buildWorkspace(
  profile: WorkspaceProfile,
  currentUserId: string
): WorkspaceModel {
  return profile === "clean"
    ? buildCleanWorkspace(currentUserId)
    : buildMatureWorkspace(currentUserId);
}
