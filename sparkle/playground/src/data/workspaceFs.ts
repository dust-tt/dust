import type { DataSourceFileType, User } from "./types";
import { getUserById, mockUsers } from "./users";

// A single workspace tree. Spaces are the roots and own access; folders and
// files inherit it. Any folder can be promoted to a pod (a working directory).

export type FsNodeKind = "space" | "folder" | "file";

export interface FsNode {
  id: string;
  parentId: string | null;
  kind: FsNodeKind;
  name: string;
  fileType?: DataSourceFileType;
  updatedAt: Date;
  updatedById: string;
}

export interface FsSpaceAccess {
  isRestricted: boolean;
  memberIds: string[];
}

export interface PodAttachment {
  nodeId: string;
  addedById: string;
  addedAt: Date;
}

export interface Pod {
  folderId: string;
  description: string;
  attachments: PodAttachment[];
  createdAt: Date;
}

export interface PodConversation {
  id: string;
  podFolderId: string;
  title: string;
  agentId: string;
  authorId: string;
  updatedAt: Date;
  isUnread: boolean;
  /** Documents the agent used in its answers. */
  citedNodeIds: string[];
  /** Query of the search the agent ran; its results are `citedNodeIds`. */
  searchQuery: string;
}

/**
 * A document created in a conversation. It lives with the conversation until
 * someone saves it to a folder; saving moves the file itself, not a copy.
 */
export interface ConversationDraft {
  id: string;
  conversationId: string;
  name: string;
  fileType: DataSourceFileType;
  createdAt: Date;
  savedNodeId: string | null;
}

export interface WorkspaceFs {
  nodes: FsNode[];
  spaceAccess: Record<string, FsSpaceAccess>;
  pods: Pod[];
  conversations: PodConversation[];
  drafts: ConversationDraft[];
}

export const CURRENT_USER_ID = "1";

// The person using the prototype, standing in for mock user "1".
export const CURRENT_USER: User = {
  id: CURRENT_USER_ID,
  firstName: "Daphné",
  lastName: "Popin",
  fullName: "Daphné Popin",
  email: "daph@dust.tt",
};

export function getFsUserById(id: string): User | undefined {
  return id === CURRENT_USER_ID ? CURRENT_USER : getUserById(id);
}
export const MY_FILES_ID = "space-my-files";
export const WORKSPACE_MEMBER_IDS = mockUsers.slice(0, 24).map((u) => u.id);

type Seed =
  | string
  | { name: string; children: Seed[]; pod?: string; id?: string };

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function fileTypeOf(name: string): DataSourceFileType {
  const ext = name.split(".").pop() ?? "";
  const known: DataSourceFileType[] = [
    "pdf",
    "doc",
    "docx",
    "xlsx",
    "csv",
    "pptx",
    "txt",
    "md",
    "png",
    "frame",
  ];
  return known.find((k) => k === ext) ?? "md";
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const SPACES: {
  name: string;
  access: FsSpaceAccess;
  children: Seed[];
  pod?: string;
}[] = [
  {
    // Personal root, a pod by default: where conversations land when you
    // don't start them in another pod.
    name: "My files",
    access: { isRestricted: true, memberIds: [CURRENT_USER_ID] },
    pod: "",
    children: [
      { name: "Drafts", children: ["Ideas.md", "Offsite agenda.docx"] },
      { name: "Side project", children: ["Notes.md"] },
      "Weekly review.md",
    ],
  },
  {
    name: "Company Data",
    access: { isRestricted: false, memberIds: WORKSPACE_MEMBER_IDS },
    children: [
      {
        name: "Handbook",
        children: ["Onboarding.md", "Benefits.pdf", "Travel policy.pdf"],
      },
      {
        name: "Product",
        children: ["Roadmap 2026.pptx", "Pricing.xlsx", "Positioning.docx"],
      },
      { name: "Brand", children: ["Brand guidelines.pdf", "Logo pack.png"] },
    ],
  },
  {
    name: "Engineering",
    access: { isRestricted: false, memberIds: WORKSPACE_MEMBER_IDS },
    children: [
      {
        name: "Architecture",
        children: ["System overview.md", "Data model.md"],
      },
      { name: "Runbooks", children: ["Incident response.md", "On-call.md"] },
      {
        name: "Guidelines",
        children: ["Coding rules.md", "Code review checklist.md"],
      },
      {
        name: "RFCs",
        children: ["RFC-042 Workspace FS.md", "RFC-043 Pod context.md"],
      },
      {
        name: "Projects",
        children: [
          {
            name: "Q4 Launch",
            pod: "Ship the Q4 release: scope, checklist and comms.",
            children: [
              "Launch plan.md",
              "Launch checklist.xlsx",
              { name: "Specs", children: ["API spec.md", "UI spec.docx"] },
              {
                name: "Meeting notes",
                children: ["Kickoff.md", "Weekly sync 10-01.md"],
              },
            ],
          },
          {
            name: "Search revamp",
            pod: "Rebuild workspace search on the new index.",
            children: ["Benchmarks.xlsx", "Design doc.md"],
          },
        ],
      },
    ],
  },
  {
    name: "Sales",
    access: { isRestricted: false, memberIds: WORKSPACE_MEMBER_IDS },
    children: [
      {
        name: "Playbooks",
        children: ["Discovery call.md", "Objection handling.docx"],
      },
      {
        name: "Accounts",
        children: [
          {
            name: "Acme Corp",
            pod: "Renewal and expansion for Acme Corp.",
            children: ["Account plan.docx", "QBR Q3.pptx", "Contract.pdf"],
          },
          { name: "Globex", children: ["Notes.md"] },
        ],
      },
      "Pipeline Q4.xlsx",
    ],
  },
  {
    name: "HR",
    access: { isRestricted: true, memberIds: ["1", "2", "3", "4", "5", "6"] },
    children: [
      {
        name: "Compensation",
        children: ["Salary bands 2026.xlsx", "Equity policy.pdf"],
      },
      {
        name: "Recruiting",
        pod: "Hiring pipeline and candidate reviews.",
        children: [
          "Hiring plan.xlsx",
          "Interview kit.docx",
          {
            name: "Candidates",
            children: ["Backend shortlist.md", "Design shortlist.md"],
          },
        ],
      },
      { name: "Policies", children: ["Remote work.pdf", "Leave policy.pdf"] },
    ],
  },
];

const CONVERSATION_SEEDS: Record<
  string,
  { title: string; agentId: string; authorId: string; unread?: boolean }[]
> = {
  "Q4 Launch": [
    {
      title: "Draft the launch announcement",
      agentId: "agent-1",
      authorId: "1",
      unread: true,
    },
    { title: "Checklist gaps for GA", agentId: "agent-2", authorId: "7" },
    {
      title: "Summarize weekly sync",
      agentId: "agent-3",
      authorId: "9",
      unread: true,
    },
  ],
  "Search revamp": [
    { title: "Compare benchmark runs", agentId: "agent-4", authorId: "12" },
  ],
  "Acme Corp": [
    {
      title: "Prep the QBR deck",
      agentId: "agent-5",
      authorId: "1",
      unread: true,
    },
    { title: "Renewal risks", agentId: "agent-2", authorId: "14" },
  ],
  Recruiting: [
    { title: "Backend shortlist review", agentId: "agent-6", authorId: "3" },
  ],
  "My files": [
    {
      title: "Plan my week",
      agentId: "agent-1",
      authorId: CURRENT_USER_ID,
      unread: true,
    },
    {
      title: "Translate the offsite email",
      agentId: "agent-1",
      authorId: CURRENT_USER_ID,
    },
    {
      title: "Quick question on SQL",
      agentId: "agent-4",
      authorId: CURRENT_USER_ID,
    },
  ],
};

// Drafts created in seeded conversations, by conversation title. A leading
// "saved:" marks a draft already saved to the pod folder.
const DRAFT_SEEDS: Record<string, string[]> = {
  "Draft the launch announcement": [
    "Launch announcement v1.md",
    "Launch announcement v2.md",
    "Launch announcement v3.md",
    "Tweet thread.md",
    "Customer email.docx",
    "saved:Launch FAQ.md",
  ],
  "Summarize weekly sync": ["Weekly sync summary.md"],
  "Prep the QBR deck": ["QBR outline.md", "QBR talking points.md"],
  "Plan my week": ["Week plan.md"],
};

// Seeded attachments, by pod name, as paths from the space root.
const ATTACHMENT_SEEDS: Record<string, string[]> = {
  "My files": [
    "Engineering/Guidelines/Coding rules.md",
    "Engineering/Runbooks",
    "Engineering/Architecture/System overview.md",
  ],
  "Q4 Launch": [
    "Company Data/Product/Roadmap 2026.pptx",
    "Engineering/RFCs",
    "HR/Policies/Remote work.pdf",
  ],
  "Acme Corp": ["Sales/Playbooks", "Company Data/Product/Pricing.xlsx"],
};

export function buildWorkspaceFs(): WorkspaceFs {
  const nodes: FsNode[] = [];
  const spaceAccess: Record<string, FsSpaceAccess> = {};
  const pods: Pod[] = [];
  const conversations: PodConversation[] = [];
  const idByPath = new Map<string, string>();
  let tick = 0;
  // Private spaces are only edited by their single member.
  let soleMemberId: string | null = null;

  const addPod = (id: string, name: string, description: string) => {
    pods.push({
      folderId: id,
      description,
      attachments: [],
      createdAt: minutesAgo(60 * 24 * 14),
    });
    (CONVERSATION_SEEDS[name] ?? []).forEach((c, i) => {
      conversations.push({
        id: `conv-${slug(name)}-${i}`,
        podFolderId: id,
        title: c.title,
        agentId: c.agentId,
        authorId: c.authorId,
        updatedAt: minutesAgo(15 + i * 180),
        isUnread: c.unread ?? false,
        citedNodeIds: [],
        searchQuery: c.title.toLowerCase(),
      });
    });
  };

  const add = (
    seed: Seed,
    parentId: string,
    parentPath: string,
    depth: number
  ) => {
    tick += 1;
    const updatedById = soleMemberId ?? WORKSPACE_MEMBER_IDS[tick % 12];
    const updatedAt = minutesAgo(tick * 97);
    if (typeof seed === "string") {
      const path = `${parentPath}/${seed}`;
      const id = `file-${slug(path)}`;
      idByPath.set(path, id);
      nodes.push({
        id,
        parentId,
        kind: "file",
        name: seed,
        fileType: fileTypeOf(seed),
        updatedAt,
        updatedById,
      });
      return;
    }
    const path = `${parentPath}/${seed.name}`;
    const id = `folder-${slug(path)}`;
    idByPath.set(path, id);
    nodes.push({
      id,
      parentId,
      kind: "folder",
      name: seed.name,
      updatedAt,
      updatedById,
    });
    if (seed.pod !== undefined) {
      addPod(id, seed.name, seed.pod);
    }
    seed.children.forEach((child) => add(child, id, path, depth + 1));
  };

  for (const space of SPACES) {
    const id = `space-${slug(space.name)}`;
    idByPath.set(space.name, id);
    nodes.push({
      id,
      parentId: null,
      kind: "space",
      name: space.name,
      updatedAt: minutesAgo(60),
      updatedById: CURRENT_USER_ID,
    });
    spaceAccess[id] = space.access;
    soleMemberId =
      space.access.memberIds.length === 1 ? space.access.memberIds[0] : null;
    if (space.pod !== undefined) {
      addPod(id, space.name, space.pod);
    }
    space.children.forEach((child) => add(child, id, space.name, 1));
  }

  for (const pod of pods) {
    const name = nodes.find((n) => n.id === pod.folderId)?.name ?? "";
    pod.attachments = (ATTACHMENT_SEEDS[name] ?? []).flatMap((path) => {
      const nodeId = idByPath.get(path);
      return nodeId
        ? [
            {
              nodeId,
              // Only you can add to My files.
              addedById: pod.folderId === MY_FILES_ID ? CURRENT_USER_ID : "7",
              addedAt: minutesAgo(60 * 24 * 3),
            },
          ]
        : [];
    });
  }

  // Each seeded conversation cites a file from its pod and, if any, one
  // document from other folders.
  const filesUnder = (folderId: string): string[] =>
    nodes
      .filter((n) => n.parentId === folderId)
      .flatMap((n) => (n.kind === "file" ? [n.id] : filesUnder(n.id)));
  for (const conv of conversations) {
    const pod = pods.find((p) => p.folderId === conv.podFolderId);
    const own = filesUnder(conv.podFolderId);
    const linked = pod?.attachments.map((a) => a.nodeId) ?? [];
    const i = Number(conv.id.split("-").pop());
    conv.citedNodeIds = [
      ...(own.length > 0 ? [own[i % own.length]] : []),
      ...(linked.length > 0 ? [linked[i % linked.length]] : []),
    ];
  }

  const drafts: ConversationDraft[] = [];
  for (const conv of conversations) {
    (DRAFT_SEEDS[conv.title] ?? []).forEach((seed, i) => {
      const isSaved = seed.startsWith("saved:");
      const name = seed.replace("saved:", "");
      const id = `draft-${conv.id}-${i}`;
      let savedNodeId: string | null = null;
      if (isSaved) {
        savedNodeId = `file-${id}`;
        nodes.push({
          id: savedNodeId,
          parentId: conv.podFolderId,
          kind: "file",
          name,
          fileType: fileTypeOf(name),
          updatedAt: minutesAgo(30),
          updatedById: conv.authorId,
        });
      }
      drafts.push({
        id,
        conversationId: conv.id,
        name,
        fileType: fileTypeOf(name),
        createdAt: minutesAgo(20 + i * 7),
        savedNodeId,
      });
    });
  }

  return { nodes, spaceAccess, pods, conversations, drafts };
}

// ── Tree helpers ────────────────────────────────────────────────────────────

export interface FsIndex {
  byId: Map<string, FsNode>;
  childrenById: Map<string | null, FsNode[]>;
}

const KIND_ORDER: Record<FsNodeKind, number> = { space: 0, folder: 1, file: 2 };

export function indexFs(nodes: FsNode[]): FsIndex {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenById = new Map<string | null, FsNode[]>();
  for (const node of nodes) {
    const siblings = childrenById.get(node.parentId) ?? [];
    siblings.push(node);
    childrenById.set(node.parentId, siblings);
  }
  for (const siblings of childrenById.values()) {
    siblings.sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name)
    );
  }
  return { byId, childrenById };
}

/** Ancestors from the space root down to the node itself. */
export function getPath(index: FsIndex, nodeId: string): FsNode[] {
  const path: FsNode[] = [];
  let current = index.byId.get(nodeId);
  while (current) {
    path.unshift(current);
    current = current.parentId ? index.byId.get(current.parentId) : undefined;
  }
  return path;
}

export function getSpaceId(index: FsIndex, nodeId: string): string {
  return getPath(index, nodeId)[0]?.id ?? nodeId;
}

export function isInside(
  index: FsIndex,
  nodeId: string,
  ancestorId: string
): boolean {
  return getPath(index, nodeId).some((n) => n.id === ancestorId);
}

export function countFiles(index: FsIndex, nodeId: string): number {
  const node = index.byId.get(nodeId);
  if (!node) {
    return 0;
  }
  if (node.kind === "file") {
    return 1;
  }
  return (index.childrenById.get(nodeId) ?? []).reduce(
    (sum, child) => sum + countFiles(index, child.id),
    0
  );
}

/** Nearest pod at or above the node, if any. */
export function getEnclosingPodId(
  index: FsIndex,
  podFolderIds: Set<string>,
  nodeId: string
): string | null {
  const path = getPath(index, nodeId);
  for (let i = path.length - 1; i >= 0; i--) {
    if (podFolderIds.has(path[i].id)) {
      return path[i].id;
    }
  }
  return null;
}
