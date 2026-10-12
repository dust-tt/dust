import { z } from "zod";
import { linkedFileIds } from "./fileLinks";

import {
  createPodConfiguration,
  createWorkspaceFiles,
  everyone,
  frameHtml,
  podMembers,
  tenderRequirements,
  workspacePods,
} from "./fixtures";
import {
  isContainer,
  type PodConfiguration,
  type WorkspaceFile,
  type WorkspaceLocation,
  type FileScope,
  type FilePermissions,
  type FileRole,
} from "./model";

export type Run = {
  triggerId?: string;
  id: string;
  podId: string;
  conversationId: string;
  inputIds: string[];
  inputRevisions: Record<string, number>;
  instructions: string;
  agentId: string;
  skippedIds: string[];
  outputIds: string[];
  at: string;
  reason: string;
};
export type Proposal = {
  id: string;
  topic: string;
  sourceIds: string[];
  status: "pending" | "approved" | "dismissed";
  issueId?: string;
};
export type WorkspaceState = {
  version: 2;
  exampleSeeded?: true;
  files: WorkspaceFile[];
  configurations: Record<string, PodConfiguration>;
  runs: Run[];
  proposals: Proposal[];
  incomingCount: number;
};
export const storageKey = "dust-company-workspace-v2";

export const triggerSchema = z.object({
  podId: z.string().min(1),
  enabled: z.boolean(),
  kind: z.enum(["event", "schedule"]),
  agentId: z.string().min(1, "Choose an agent."),
  prompt: z.string().trim().min(1, "Add a message for the agent."),
  folderId: z.string(),
  cadence: z.enum(["daily", "weekly"]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid time."),
  timezone: z.string().min(1),
});
const permissionsSchema = z.object({
  inherit: z.boolean(),
  entries: z.array(
    z.object({
      principal: z.string().trim().min(1),
      role: z.enum(["viewer", "commenter", "editor", "none"]),
    })
  ),
});
const fileSchema = z.object({
  permissions: permissionsSchema.optional(),
  updatedBy: z.string().optional(),
  updatedAt: z.string().optional(),
  trigger: triggerSchema.optional(),
  fixedLocation: z.boolean().optional(),
  approvedAnswers: z
    .array(
      z.object({ topic: z.string(), answer: z.string(), sourceId: z.string() })
    )
    .optional(),
  id: z.string(),
  name: z.string(),
  kind: z.enum([
    "document",
    "folder",
    "conversation",
    "agent",
    "skill",
    "tool",
    "frame",
    "link",
    "recording",
    "email",
    "trigger",
  ]),
  scope: z.enum(["My files", "Workspace files", "Shared with me"]),
  location: z.string(),
  description: z.string(),
  content: z.string(),
  access: z.enum(["company", "private", "limited"]),
  sharedWith: z.array(z.string()),
  canShare: z.boolean(),
  parentId: z.string().optional(),
  recordId: z.string().optional(),
  targetId: z.string().optional(),
  sourceIds: z.array(z.string()).optional(),
  mediaUrl: z.string().optional(),
  downloadUrl: z.string().optional(),
  revision: z.number().optional(),
  signals: z
    .array(
      z.object({ topic: z.string(), quote: z.string(), account: z.string() })
    )
    .optional(),
});
const configurationSchema = z.object({
  fileTabs: z
    .array(
      z.object({
        fileId: z.string(),
        title: z.string().min(1).max(64),
        icon: z.string().optional(),
      })
    )
    .max(8)
    .optional(),
  references: z.array(
    z.object({
      fileId: z.string(),
      role: z.enum(["Reference", "Always apply", "Available"]),
    })
  ),
  instructions: z.string(),
  defaultAgentId: z.string(),
  confirmActions: z.boolean(),
  audience: z.enum(["private", "pod", "workspace"]),
  triggerEnabled: z.boolean(),
});
const stateSchema = z.object({
  version: z.literal(2),
  exampleSeeded: z.literal(true).optional(),
  files: z.array(fileSchema),
  configurations: z.record(configurationSchema),
  runs: z.array(
    z.object({
      id: z.string(),
      podId: z.string(),
      conversationId: z.string(),
      triggerId: z.string().optional(),
      inputIds: z.array(z.string()),
      inputRevisions: z.record(z.number()),
      instructions: z.string(),
      agentId: z.string(),
      skippedIds: z.array(z.string()),
      outputIds: z.array(z.string()),
      at: z.string(),
      reason: z.string(),
    })
  ),
  proposals: z.array(
    z.object({
      id: z.string(),
      topic: z.string(),
      sourceIds: z.array(z.string()),
      status: z.enum(["pending", "approved", "dismissed"]),
      issueId: z.string().optional(),
    })
  ),
  incomingCount: z.number(),
});

export function initialWorkspace(): WorkspaceState {
  let state: WorkspaceState = {
    version: 2,
    exampleSeeded: true,
    files: createWorkspaceFiles(),
    configurations: Object.fromEntries(
      workspacePods.map((pod) => [pod.id, createPodConfiguration(pod.id)])
    ),
    runs: [],
    proposals: [],
    incomingCount: 0,
  };
  state = runPod(state, "voice-of-customer", "Weekly feedback review", {
    id: "example:voc-weekly",
    at: "2026-10-05T14:00:00Z",
  });
  state = incomingCall(state, {
    id: "example:voc-atlas",
    at: "2026-10-06T07:15:00Z",
  });
  state = reviewProposal(state, "proposal:Knowledge freshness", true);
  const clarification: WorkspaceFile = {
    id: "example:northstar-clarification",
    name: "Northstar · rollout clarification.txt",
    kind: "document",
    scope: "My files",
    parentId: undefined,
    location: "",
    description: "Uploaded by Emma · October 6",
    access: "private",
    sharedWith: ["northstar-tender"],
    canShare: true,
    revision: 1,
    content:
      "Northstar · Bid team clarification\n\nStart with the 200-person customer success team before considering a 1,200-seat rollout. Use the Meridian pilot as a workflow reference. Regional processing and commercial terms still need written confirmation.\n\nThis file was uploaded by Emma and shared with the bid team. The pod links to the original in My files.",
  };
  state = addUploads(state, "northstar-tender", [clarification]);
  state = runPod(state, "northstar-tender", "Tender response review", {
    id: "example:northstar-response",
    at: "2026-10-06T08:40:00Z",
  });
  const names = new Map([
    ["example:voc-weekly", "Weekly review · permissions and freshness"],
    ["example:voc-atlas", "Atlas call · update customer themes"],
    ["example:northstar-response", "Northstar · draft and coverage review"],
  ]);
  return {
    ...state,
    files: state.files.map((file) =>
      names.has(file.id)
        ? { ...file, name: names.get(file.id) ?? file.name }
        : file
    ),
  };
}

function populateSavedWorkspace(state: WorkspaceState): WorkspaceState {
  if (state.exampleSeeded) {
    return state;
  }
  const example = initialWorkspace();
  const existingIds = new Set(state.files.map((file) => file.id));
  const existingProposalIds = new Set(
    state.proposals.map((proposal) => proposal.id)
  );
  const omittedIssues = new Set(
    example.proposals
      .filter((proposal) => existingProposalIds.has(proposal.id))
      .map((proposal) => proposal.issueId)
  );
  const additions = example.files.filter(
    (file) =>
      !existingIds.has(file.id) &&
      file.kind !== "link" &&
      !omittedIssues.has(file.id)
  );
  const addedIds = new Set(additions.map((file) => file.id));
  const exampleFiles = new Map(example.files.map((file) => [file.id, file]));
  const activePods = new Set(state.runs.map((run) => run.podId));
  const maintainedOutputs = new Map([
    ["voc-snapshot", "voice-of-customer"],
    ["voc-frame", "voice-of-customer"],
    ["tender-draft", "northstar-tender"],
    ["tender-frame", "northstar-tender"],
  ]);
  const proposalIds = new Set(state.proposals.map((proposal) => proposal.id));
  const runIds = new Set(state.runs.map((run) => run.id));
  let populated: WorkspaceState = {
    ...state,
    exampleSeeded: true,
    files: [
      ...state.files.map((file) => {
        const podId = maintainedOutputs.get(file.id);
        const seeded = exampleFiles.get(file.id);
        return podId &&
          seeded &&
          !activePods.has(podId) &&
          (file.revision ?? 1) === 1 &&
          !file.approvedAnswers?.length
          ? {
              ...file,
              content: seeded.content,
              revision: seeded.revision,
              sourceIds: seeded.sourceIds,
              description: seeded.description,
            }
          : file;
      }),
      ...additions,
    ],
    runs: [
      ...state.runs,
      ...example.runs.filter((run) => !runIds.has(run.id)),
    ].sort((a, b) => b.at.localeCompare(a.at)),
    proposals: [
      ...state.proposals,
      ...example.proposals.filter((proposal) => !proposalIds.has(proposal.id)),
    ],
    incomingCount: Math.max(state.incomingCount, example.incomingCount),
  };
  for (const pod of workspacePods) {
    populated = linkToPod(
      populated,
      pod.id,
      example.configurations[pod.id].references
        .filter((ref) => addedIds.has(ref.fileId))
        .map((ref) => ref.fileId)
    );
  }
  return populated;
}
function refreshDefaultCopy(state: WorkspaceState): WorkspaceState {
  const names = new Map([
    ["Customer feedback snapshot", "Customer feedback summary"],
    ["Voice of Customer · topic explorer", "Customer feedback by topic"],
    ["Update the customer feedback snapshot", "Review customer feedback"],
    ["Feedback snapshot · run output", "Customer feedback · review findings"],
  ]);
  const defaultContent = new Map(
    createWorkspaceFiles().map((file) => [file.id, file])
  );
  return {
    ...state,
    files: state.files.map((file) => {
      const original = defaultContent.get(file.id);
      return {
        ...file,
        updatedBy: file.updatedBy ?? original?.updatedBy,
        updatedAt: file.updatedAt ?? original?.updatedAt,
        ...(file.id === "voc-trigger" && !file.trigger && original?.trigger
          ? {
              trigger: {
                ...original.trigger,
                enabled:
                  state.configurations["voice-of-customer"].triggerEnabled,
              },
            }
          : {}),
        name: names.get(file.name) ?? file.name,
        description:
          file.description === "Read the topic snapshot as a frame"
            ? "Customer themes and supporting feedback"
            : file.description,
        content:
          file.id === "voc-trigger" &&
          file.content ===
            "When a new call arrives in Customers / Customer calls, update the customer feedback snapshot and prepare roadmap proposals." &&
          original
            ? original.content
            : file.kind === "frame" &&
                (file.content.includes("DUST · DEMO WORKSPACE") ||
                  file.content.includes('data-pod-frame="2"') ||
                  file.content.includes('data-pod-frame="3"'))
              ? frameHtml(
                  file.id === "voc-frame"
                    ? "What customers are asking for"
                    : "Northstar tender",
                  file.description,
                  file.id === "voc-frame"
                    ? topicsFor(
                        state.files.filter((source) =>
                          file.sourceIds?.includes(source.id)
                        )
                      ).map((topic) => ({
                        title: topic.topic,
                        detail: topic.quotes[0] ?? "",
                        status: `${topic.accounts.length} accounts · ${topic.accounts.join(", ")}`,
                        sourceIds: topic.sourceIds,
                      }))
                    : tenderRequirements.map((requirement) => {
                        const answer = file.approvedAnswers?.find(
                          (item) => item.topic === requirement.topic
                        );
                        return {
                          title: requirement.topic,
                          detail: answer?.answer ?? requirement.answer,
                          status: answer
                            ? "Reviewed answer"
                            : requirement.status,
                          sourceIds: [answer?.sourceId ?? requirement.evidence],
                        };
                      })
                )
              : file.id === "voc-baseline"
                ? file.content.replace(
                    "The source snapshot below keeps the evidence together.",
                    "The summary below brings these findings together with their sources."
                  )
                : file.content,
      };
    }),
  };
}
function isWorkspaceState(value: unknown): value is WorkspaceState {
  return stateSchema.safeParse(value).success;
}
export function restoreWorkspace(raw: string): WorkspaceState {
  const parsed: unknown = JSON.parse(raw);
  if (!isWorkspaceState(parsed)) {
    throw new Error("Saved workspace data is invalid.");
  }
  const ids = new Set(parsed.files.map((file) => file.id));
  if (
    ids.size !== parsed.files.length ||
    workspacePods.some((pod) => !parsed.configurations[pod.id]) ||
    ["voc-snapshot", "voc-frame", "tender-draft", "tender-frame"].some(
      (id) => !ids.has(id)
    )
  ) {
    throw new Error("Saved workspace data is incomplete.");
  }
  const byId = new Map(parsed.files.map((file) => [file.id, file]));
  for (const file of parsed.files) {
    const seen = new Set<string>([file.id]);
    let parent = file.parentId;
    while (parent) {
      if (seen.has(parent)) {
        throw new Error("Saved workspace folders contain a cycle.");
      }
      seen.add(parent);
      parent = byId.get(parent)?.parentId;
    }
  }
  return removeLegacyPodFolders(
    refreshDefaultCopy(populateSavedWorkspace(parsed))
  );
}
function removeLegacyPodFolders(state: WorkspaceState): WorkspaceState {
  const removed = new Set([
    "pods",
    ...workspacePods.flatMap((pod) => [`pod:${pod.id}`, `home:${pod.id}`]),
  ]);
  if (!state.files.some((file) => removed.has(file.id))) {
    return state;
  }
  const files = state.files
    .filter(
      (file) =>
        !removed.has(file.id) &&
        !(file.kind === "link" && file.parentId && removed.has(file.parentId))
    )
    .map((file) =>
      file.parentId && removed.has(file.parentId)
        ? {
            ...file,
            parentId: undefined,
            location: "",
            sharedWith: [
              ...new Set([
                ...file.sharedWith,
                ...audienceFor(state.files, file.id),
              ]),
            ],
          }
        : file
    );
  return {
    ...state,
    files: files.map((file) => ({
      ...file,
      location: filePath(files, file).split(" / ").slice(1).join(" / "),
    })),
    configurations: Object.fromEntries(
      Object.entries(state.configurations).map(([id, config]) => [
        id,
        {
          ...config,
          references: config.references.flatMap((ref) =>
            removed.has(ref.fileId)
              ? files
                  .filter(
                    (file) =>
                      state.files.find((original) => original.id === file.id)
                        ?.parentId === ref.fileId
                  )
                  .map((file) => ({ ...ref, fileId: file.id }))
              : [ref]
          ),
        },
      ])
    ),
  };
}

type FileIndex = {
  byId: Map<string, WorkspaceFile>;
  children: Map<string, WorkspaceFile[]>;
};
const fileIndexes = new WeakMap<WorkspaceFile[], FileIndex>();
function indexFiles(files: WorkspaceFile[]): FileIndex {
  const existing = fileIndexes.get(files);
  if (existing) {
    return existing;
  }
  const byId = new Map<string, WorkspaceFile>();
  const children = new Map<string, WorkspaceFile[]>();
  for (const file of files) {
    byId.set(file.id, file);
    if (file.parentId) {
      const siblings = children.get(file.parentId) ?? [];
      siblings.push(file);
      children.set(file.parentId, siblings);
    }
  }
  const index = { byId, children };
  fileIndexes.set(files, index);
  return index;
}
export function canonicalFile(
  files: WorkspaceFile[],
  id: string
): WorkspaceFile | undefined {
  const { byId } = indexFiles(files);
  const visited = new Set<string>();
  let file = byId.get(id);
  while (file?.targetId && !visited.has(file.id)) {
    visited.add(file.id);
    file = byId.get(file.targetId);
  }
  return file?.kind === "link" ? undefined : file;
}
export function filePermissions(file: WorkspaceFile): FilePermissions {
  return (
    file.permissions ?? {
      inherit: true,
      entries: [
        ...(file.access === "company" && !file.parentId
          ? [{ principal: "workspace", role: "viewer" as const }]
          : []),
        ...file.sharedWith
          .flatMap((grant) => podMembers[grant] ?? [grant])
          .filter((principal) => principal !== "Emma")
          .map((principal) => ({ principal, role: "viewer" as const })),
      ],
    }
  );
}
export function effectivePermissions(
  files: WorkspaceFile[],
  id: string
): Map<string, { role: FileRole; sourceId: string }> {
  const { byId } = indexFiles(files);
  const chain: WorkspaceFile[] = [];
  const visited = new Set<string>();
  let file = canonicalFile(files, id);
  while (file && !visited.has(file.id)) {
    visited.add(file.id);
    chain.unshift(file);
    if (!filePermissions(file).inherit) {
      break;
    }
    file = file.parentId ? byId.get(file.parentId) : undefined;
  }
  const grants = new Map<string, { role: FileRole; sourceId: string }>();
  for (const item of chain) {
    for (const entry of filePermissions(item).entries) {
      grants.set(entry.principal, { role: entry.role, sourceId: item.id });
    }
  }
  grants.set("Emma", {
    role: "editor",
    sourceId: canonicalFile(files, id)?.id ?? id,
  });
  return grants;
}
export function roleFor(
  files: WorkspaceFile[],
  id: string,
  person: string
): FileRole {
  const grants = effectivePermissions(files, id);
  return (
    grants.get(person)?.role ??
    (everyone.includes(person) ? grants.get("workspace")?.role : undefined) ??
    "none"
  );
}
export function audienceFor(files: WorkspaceFile[], id: string): Set<string> {
  const grants = effectivePermissions(files, id);
  const people = new Set(
    [...everyone, ...grants.keys()].filter(
      (principal) => principal !== "workspace"
    )
  );
  return new Set(
    [...people].filter((person) => {
      const role =
        grants.get(person)?.role ??
        (everyone.includes(person) ? grants.get("workspace")?.role : undefined);
      return role && role !== "none";
    })
  );
}
function retainedPermissions(
  files: WorkspaceFile[],
  file: WorkspaceFile
): FilePermissions {
  return {
    inherit: filePermissions(file).inherit,
    entries: [...effectivePermissions(files, file.id)].map(
      ([principal, grant]) => ({ principal, role: grant.role })
    ),
  };
}
export function setFilePermissions(
  state: WorkspaceState,
  fileId: string,
  permissions: FilePermissions
): WorkspaceState {
  const file = canonicalFile(state.files, fileId);
  if (!file?.canShare) {
    throw new Error("You can’t change sharing for this file.");
  }
  permissionsSchema.parse(permissions);
  if (
    permissions.entries.some(
      (entry) => entry.principal === "Emma" && entry.role !== "editor"
    )
  ) {
    throw new Error("The owner keeps access to this file.");
  }
  const entries = [
    ...new Map(
      permissions.entries.map((entry) => [entry.principal, entry])
    ).values(),
  ];
  const files = state.files.map((item) =>
    item.id === file.id
      ? { ...item, permissions: { ...permissions, entries } }
      : item
  );
  for (const child of [file, ...descendants(files, file.id)]) {
    validateProvenance(files, child, audienceFor(files, child.id));
  }
  return { ...state, files };
}
export function permissionLabel(
  files: WorkspaceFile[],
  file: WorkspaceFile
): string {
  const audience = audienceFor(files, file.id);
  if (everyone.every((name) => audience.has(name))) {
    return "Everyone in the workspace";
  }
  return audience.size === 1 ? "Only you" : [...audience].join(", ");
}
export function filePath(files: WorkspaceFile[], file: WorkspaceFile): string {
  const { byId } = indexFiles(files);
  const parts: string[] = [];
  const visited = new Set<string>();
  let parent = file.parentId ? byId.get(file.parentId) : undefined;
  while (parent && !visited.has(parent.id)) {
    visited.add(parent.id);
    parts.unshift(parent.name);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return [file.scope, ...parts].join(" / ");
}
export function descendants(
  files: WorkspaceFile[],
  id: string
): WorkspaceFile[] {
  const { children } = indexFiles(files);
  const output: WorkspaceFile[] = [];
  const visited = new Set<string>([id]);
  const pending = [id];
  while (pending.length) {
    for (const child of children.get(pending.pop() ?? "") ?? []) {
      if (!visited.has(child.id)) {
        visited.add(child.id);
        output.push(child);
        pending.push(child.id);
      }
    }
  }
  return output;
}
export function podSources(
  state: WorkspaceState,
  podId: string
): WorkspaceFile[] {
  const ids = new Set<string>();
  const { children } = indexFiles(state.files);
  const pending = (state.configurations[podId]?.references ?? []).map(
    (ref) => ref.fileId
  );
  while (pending.length) {
    const file = canonicalFile(state.files, pending.pop() ?? "");
    if (!file || ids.has(file.id)) {
      continue;
    }
    ids.add(file.id);
    if (isContainer(file)) {
      for (const child of children.get(file.id) ?? []) {
        pending.push(child.id);
      }
    }
  }
  return state.files.filter(
    (file) => ids.has(file.id) && file.kind !== "folder" && file.kind !== "link"
  );
}
export function configurePod(
  state: WorkspaceState,
  podId: string,
  configuration: PodConfiguration
): WorkspaceState {
  const references = [
    ...new Map(
      configuration.references.map((ref) => [
        canonicalFile(state.files, ref.fileId)?.id ?? ref.fileId,
        ref,
      ])
    ).values(),
  ];
  return {
    ...state,
    configurations: {
      ...state.configurations,
      [podId]: { ...configuration, references },
    },
  };
}
export function linkToPod(
  state: WorkspaceState,
  podId: string,
  ids: string[]
): WorkspaceState {
  const config = state.configurations[podId] ?? createPodConfiguration(podId);
  const existing = new Set(config.references.map((ref) => ref.fileId));
  const added = ids
    .map((id) => canonicalFile(state.files, id)?.id)
    .filter((id): id is string => !!id && !existing.has(id));
  return configurePod(state, podId, {
    ...config,
    references: [
      ...config.references,
      ...added.map((fileId) => ({ fileId, role: "Reference" as const })),
    ],
  });
}
function validateProvenance(
  files: WorkspaceFile[],
  file: WorkspaceFile,
  audience: Set<string>
): void {
  for (const sourceId of file.sourceIds ?? []) {
    if (
      ![...audience].every((name) => audienceFor(files, sourceId).has(name))
    ) {
      throw new Error(
        `“${file.name}” uses a source that isn’t shared with this audience. Share the source first.`
      );
    }
  }
}
export function shareFile(
  state: WorkspaceState,
  fileId: string,
  grant: string
): WorkspaceState {
  const file = canonicalFile(state.files, fileId);
  if (!file?.canShare) {
    throw new Error("You can’t change sharing for this file.");
  }
  const permissions = filePermissions(file);
  const principals =
    grant === "workspace" ? ["workspace"] : (podMembers[grant] ?? [grant]);
  return setFilePermissions(state, fileId, {
    ...permissions,
    entries: [
      ...permissions.entries.filter(
        (entry) => !principals.includes(entry.principal)
      ),
      ...principals
        .filter((principal) => principal !== "Emma")
        .map((principal) => ({
          principal,
          role: "viewer" as const,
        })),
    ],
  });
}
export function moveFile(
  state: WorkspaceState,
  fileId: string,
  parentId: string
): WorkspaceState {
  const file = canonicalFile(state.files, fileId);
  const parent = state.files.find((item) => item.id === parentId);
  if (
    !file?.canShare ||
    !parent ||
    !parent.canShare ||
    !isContainer(parent) ||
    (parent.kind === "folder" && parent.id.startsWith("pod:"))
  ) {
    throw new Error(
      "Choose a writable folder or conversation. Add a reference to put a file in a pod."
    );
  }
  if (file.fixedLocation) {
    throw new Error(
      "This folder is a fixed workspace location. Move individual files or conversations instead."
    );
  }
  const subtree = descendants(state.files, file.id);
  if (file.id === parent.id || subtree.some((item) => item.id === parent.id)) {
    throw new Error(
      "A folder can’t be moved into itself or one of its children."
    );
  }
  const subtreeIds = new Set(subtree.map((item) => item.id));
  const previousAudience = [...audienceFor(state.files, file.id)];
  const files = state.files.map((item) =>
    item.id === file.id
      ? {
          ...item,
          parentId,
          scope: parent.scope,
          permissions: retainedPermissions(state.files, file),
          sharedWith: [
            ...new Set([
              ...item.sharedWith,
              ...previousAudience.filter((name) => name !== "Emma"),
            ]),
          ],
        }
      : subtreeIds.has(item.id)
        ? { ...item, scope: parent.scope }
        : item
  );
  for (const child of [file, ...subtree]) {
    validateProvenance(files, child, audienceFor(files, child.id));
  }
  return {
    ...state,
    files: files.map((item) => ({
      ...item,
      location: filePath(files, item).split(" / ").slice(1).join(" / "),
    })),
  };
}
export type FileTransfer = "copy" | "link" | "move";

export function transferFiles(
  state: WorkspaceState,
  ids: string[],
  destination: WorkspaceLocation,
  operation: FileTransfer
): WorkspaceState {
  const parent = destination.folderId
    ? state.files.find((file) => file.id === destination.folderId)
    : undefined;
  if (
    destination.folderId &&
    (!parent ||
      !isContainer(parent) ||
      !parent.canShare ||
      parent.id === "pods" ||
      parent.id.startsWith("pod:"))
  ) {
    throw new Error("Choose a writable folder or conversation.");
  }
  if (!parent && destination.scope === "Shared with me") {
    throw new Error("Choose a shared folder you can edit.");
  }
  const scope = parent?.scope ?? destination.scope;
  const roots = [...new Set(ids)].filter(
    (id) =>
      !ids.some(
        (other) =>
          other !== id &&
          descendants(state.files, other).some((child) => child.id === id)
      )
  );
  let next = state;
  for (const id of roots) {
    const file = next.files.find((item) => item.id === id);
    if (!file || !canonicalFile(next.files, id)) {
      throw new Error("This file is no longer available.");
    }
    const subtree = [file, ...descendants(next.files, file.id)];
    if (subtree.some((item) => item.id === parent?.id)) {
      throw new Error(
        "A container can’t be placed inside itself or one of its children."
      );
    }
    if (operation === "link") {
      const original = canonicalFile(next.files, id)!;
      if (
        !next.files.some(
          (item) =>
            item.kind === "link" &&
            item.targetId === original.id &&
            item.parentId === parent?.id &&
            item.scope === scope
        )
      ) {
        next = {
          ...next,
          files: [
            ...next.files,
            {
              id: crypto.randomUUID(),
              name: original.name,
              kind: "link",
              targetId: original.id,
              parentId: parent?.id,
              scope,
              permissions: retainedPermissions(next.files, file),
              location: "",
              description: "Linked file",
              content: "",
              access: "private",
              sharedWith: [],
              canShare: true,
            },
          ],
        };
      }
      continue;
    }
    if (file.fixedLocation || (operation === "move" && !file.canShare)) {
      throw new Error("This item can’t be moved or copied from here.");
    }
    if (operation === "move" && parent && file.kind !== "link") {
      next = moveFile(next, file.id, parent.id);
      continue;
    }
    const previousAudience = [...audienceFor(next.files, file.id)];
    if (operation === "move") {
      const affected = new Set(subtree.map((item) => item.id));
      const files = next.files.map((item) =>
        item.id === file.id
          ? {
              ...item,
              parentId: parent?.id,
              scope,
              permissions: retainedPermissions(next.files, file),
              access:
                !parent && scope === "Workspace files"
                  ? ("company" as const)
                  : item.access,
              sharedWith: [
                ...new Set([
                  ...item.sharedWith,
                  ...previousAudience.filter((person) => person !== "Emma"),
                ]),
              ],
            }
          : affected.has(item.id)
            ? { ...item, scope }
            : item
      );
      for (const item of files.filter((item) => affected.has(item.id))) {
        validateProvenance(files, item, audienceFor(files, item.id));
      }
      next = { ...next, files };
    } else {
      const mapping = new Map(
        subtree.map((item) => [item.id, crypto.randomUUID()])
      );
      const copied = subtree.map((item) => ({
        ...item,
        id: mapping.get(item.id)!,
        name:
          item.id === file.id &&
          item.parentId === parent?.id &&
          item.scope === scope
            ? `${item.name} (copy)`
            : item.name,
        parentId:
          item.id === file.id ? parent?.id : mapping.get(item.parentId!),
        scope,
        fixedLocation: false,
        canShare: true,
        permissions:
          item.id === file.id
            ? retainedPermissions(next.files, item)
            : item.permissions,
        access:
          item.id === file.id && !parent && scope === "Workspace files"
            ? ("company" as const)
            : item.access,
        sharedWith:
          item.id === file.id
            ? [
                ...new Set([
                  ...item.sharedWith,
                  ...previousAudience.filter((person) => person !== "Emma"),
                ]),
              ]
            : item.sharedWith,
        targetId: item.targetId
          ? (mapping.get(item.targetId) ?? item.targetId)
          : undefined,
        sourceIds: item.sourceIds?.map(
          (sourceId) => mapping.get(sourceId) ?? sourceId
        ),
        trigger: item.trigger ? { ...item.trigger, enabled: false } : undefined,
      }));
      const files = [...next.files, ...copied];
      for (const item of copied) {
        validateProvenance(files, item, audienceFor(files, item.id));
      }
      next = { ...next, files };
    }
  }
  return {
    ...next,
    files: next.files.map((file) => ({
      ...file,
      location: filePath(next.files, file).split(" / ").slice(1).join(" / "),
    })),
  };
}

export async function readUploads(
  uploads: File[],
  parentId: string | null,
  state: WorkspaceState,
  rootScope: FileScope = "My files"
): Promise<WorkspaceFile[]> {
  const parent = state.files.find((file) => file.id === parentId);
  if (
    (parentId && (!parent || !parent.canShare || !isContainer(parent))) ||
    (!parentId && rootScope === "Shared with me")
  ) {
    throw new Error("Choose a writable upload folder.");
  }
  if (uploads.reduce((sum, file) => sum + file.size, 0) > 1500000) {
    throw new Error(
      "This local demo accepts up to 1.5 MB per upload. Try a smaller file."
    );
  }
  return Promise.all(
    uploads.map(async (upload): Promise<WorkspaceFile> => {
      const isText =
        upload.type.startsWith("text/") ||
        /\.(md|txt|csv|json|yaml)$/i.test(upload.name);
      const downloadUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("The file couldn’t be read."));
        reader.onerror = () =>
          reject(new Error(`Couldn’t read ${upload.name}.`));
        reader.readAsDataURL(upload);
      });
      return {
        id: crypto.randomUUID(),
        name: upload.name,
        kind: upload.type.startsWith("audio/") ? "recording" : "document",
        parentId: parentId ?? undefined,
        scope: parent?.scope ?? rootScope,
        location: parent
          ? `${filePath(state.files, parent)} / ${parent.name}`
          : "",
        description: `${Math.max(1, Math.round(upload.size / 1024))} KB · Uploaded by you`,
        content: isText
          ? await upload.text()
          : "Download the original file to view its contents. This demo doesn’t extract text from binary files.",
        downloadUrl,
        mediaUrl: upload.type.startsWith("audio/") ? downloadUrl : undefined,
        access:
          !parent && rootScope === "Workspace files" ? "company" : "private",
        sharedWith: [],
        canShare: true,
        revision: 1,
      };
    })
  );
}
export function addUploads(
  state: WorkspaceState,
  podId: string,
  uploads: WorkspaceFile[]
): WorkspaceState {
  return linkToPod(
    { ...state, files: [...state.files, ...uploads] },
    podId,
    uploads.map((file) => file.id)
  );
}
function newConversation(
  state: WorkspaceState,
  podId: string,
  id: string,
  name: string,
  shared: boolean
): WorkspaceFile {
  const audience = shared ? "pod" : state.configurations[podId].audience;
  return {
    id,
    name,
    kind: "conversation",
    scope: "My files",
    location: "",
    description: "Just now",
    content: "",
    access: audience === "workspace" ? "company" : "private",
    sharedWith: audience === "pod" ? [podId] : [],
    canShare: true,
    revision: 1,
  };
}
export function answerQuestion(
  state: WorkspaceState,
  podId: string,
  text: string,
  audience: Set<string>
): { content: string; sourceIds: string[] } {
  const terms =
    text
      .toLowerCase()
      .match(/[a-z]{3,}/g)
      ?.filter(
        (term) =>
          ![
            "the",
            "and",
            "what",
            "are",
            "can",
            "you",
            "this",
            "with",
            "from",
            "how",
            "about",
          ].includes(term)
      ) ?? [];
  const candidates = podSources(state, podId).filter(
    (file) =>
      ["document", "email", "recording"].includes(file.kind) &&
      [...audience].every((name) => audienceFor(state.files, file.id).has(name))
  );
  const scored = candidates
    .map((file) => ({
      file,
      score: terms.filter((term) =>
        `${file.name} ${file.content}`.toLowerCase().includes(term)
      ).length,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  if (!scored.length) {
    return {
      content:
        "I couldn’t find matching evidence in the sources available to this conversation. Try asking about access controls, knowledge freshness, or Northstar’s requirements, or add a relevant source.",
      sourceIds: [],
    };
  }
  return {
    content: scored
      .map(({ file }, index) => {
        const paragraphs = file.content.split("\n\n");
        const relevant = paragraphs
          .filter((paragraph) =>
            terms.some((term) => paragraph.toLowerCase().includes(term))
          )
          .slice(0, 2);
        return `[${index + 1}] ${file.name}\n${(relevant.length ? relevant : paragraphs.slice(0, 1)).join("\n\n")}`;
      })
      .join("\n\n"),
    sourceIds: scored.map(({ file }) => file.id),
  };
}
export function converse(
  state: WorkspaceState,
  podId: string,
  text: string,
  id: string,
  existingId?: string,
  attachments: WorkspaceFile[] = []
): WorkspaceState {
  const conversation = existingId
    ? state.files.find((file) => file.id === existingId)
    : newConversation(
        state,
        podId,
        id,
        text.split("\n")[0].slice(0, 80) || "New conversation",
        false
      );
  if (!conversation) {
    throw new Error("This conversation is unavailable.");
  }
  const linkedIds = linkedFileIds(text, state.files).filter(
    (targetId) => targetId !== conversation.id
  );
  const existingTargets = new Set(
    state.files
      .filter(
        (file) => file.kind === "link" && file.parentId === conversation.id
      )
      .map((file) => file.targetId)
  );
  const links: WorkspaceFile[] = linkedIds
    .filter((targetId) => !existingTargets.has(targetId))
    .map((targetId) => ({
      ...conversation,
      id: `link:conversation:${conversation.id}:${targetId}`,
      name:
        state.files.find((file) => file.id === targetId)?.name ?? "Linked file",
      kind: "link",
      parentId: conversation.id,
      targetId,
      content: "",
      sharedWith: [],
      description: "Linked context",
    }));
  const augmented = {
    ...state,
    files: existingId
      ? [...state.files, ...attachments, ...links]
      : [...state.files, conversation, ...attachments, ...links],
  };
  const attached = attachments.map((file) => ({
    fileId: file.id,
    role: "Reference" as const,
  }));
  const withAttachments = {
    ...augmented,
    configurations: {
      ...augmented.configurations,
      [podId]: {
        ...augmented.configurations[podId],
        references: [
          ...augmented.configurations[podId].references,
          ...attached,
          ...linkedIds.map((fileId) => ({
            fileId,
            role: "Reference" as const,
          })),
        ],
      },
    },
  };
  const answer = answerQuestion(
    withAttachments,
    podId,
    text,
    audienceFor(augmented.files, conversation.id)
  );
  const agentName =
    state.files.find(
      (file) =>
        file.id ===
        (state.runs.find((run) => run.conversationId === conversation.id)
          ?.agentId ?? state.configurations[podId].defaultAgentId)
    )?.name ?? "Research analyst";
  const files = augmented.files.map((file) =>
    file.id === conversation.id
      ? {
          ...file,
          content: `${file.content ? `${file.content}\n\n` : ""}Emma\n${text}\n\n${agentName} · Demo response\n${answer.content}`,
          sourceIds: [
            ...new Set([...(file.sourceIds ?? []), ...answer.sourceIds]),
          ],
          revision: (file.revision ?? 0) + 1,
        }
      : file
  );
  return linkToPod({ ...augmented, files }, podId, [conversation.id]);
}
export function topicsFor(files: WorkspaceFile[]): {
  topic: string;
  accounts: string[];
  sourceIds: string[];
  quotes: string[];
}[] {
  const topics = new Map<
    string,
    { accounts: Set<string>; sourceIds: Set<string>; quotes: Set<string> }
  >();
  for (const file of files) {
    for (const signal of file.signals ?? []) {
      const topic = topics.get(signal.topic) ?? {
        accounts: new Set(),
        sourceIds: new Set(),
        quotes: new Set(),
      };
      topic.accounts.add(signal.account);
      topic.sourceIds.add(file.id);
      topic.quotes.add(signal.quote);
      topics.set(signal.topic, topic);
    }
  }
  return [...topics]
    .map(([topic, values]) => ({
      topic,
      accounts: [...values.accounts],
      sourceIds: [...values.sourceIds],
      quotes: [...values.quotes],
    }))
    .sort((a, b) => b.accounts.length - a.accounts.length);
}
export function runPod(
  state: WorkspaceState,
  podId: string,
  reason = "Manual run",
  execution: {
    id: string;
    at: string;
    agentId?: string;
    prompt?: string;
    triggerId?: string;
  } = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
  }
): WorkspaceState {
  const configuration = state.configurations[podId];
  if (
    !configuration.references.some(
      (ref) =>
        ref.fileId === (execution.agentId ?? configuration.defaultAgentId)
    ) ||
    !state.files.some(
      (file) =>
        file.id === (execution.agentId ?? configuration.defaultAgentId) &&
        file.kind === "agent"
    )
  ) {
    throw new Error("Add the selected agent to this pod before running it.");
  }
  const members = podMembers[podId] ?? ["Emma"];
  const candidates = podSources(state, podId).filter(
    (file) =>
      ["recording", "document", "email"].includes(file.kind) &&
      !file.sourceIds?.length
  );
  const allowed = candidates.filter((file) =>
    members.every((member) => audienceFor(state.files, file.id).has(member))
  );
  const allowedIds = new Set(allowed.map((file) => file.id));
  const skippedIds = candidates
    .filter((file) => !allowedIds.has(file.id))
    .map((file) => file.id);
  const { id, at } = execution;
  const updated = new Date(at).toLocaleString("en-GB", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const voc = podId === "voice-of-customer";
  const topics = topicsFor(allowed);
  const approvedAnswers =
    state.files.find((file) => file.id === "tender-frame")?.approvedAnswers ??
    [];
  const requirements = tenderRequirements.map((requirement) => {
    const approved = approvedAnswers.find(
      (answer) => answer.topic === requirement.topic
    );
    const evidence = approved?.sourceId ?? requirement.evidence;
    const source = allowed.find((file) => file.id === evidence);
    if (!source) {
      return {
        ...requirement,
        evidence,
        answer:
          "The required source is not available to this pod’s audience. Add an accessible source and run the review again.",
        status: "Source unavailable",
      };
    }
    if (approved) {
      return {
        ...requirement,
        evidence,
        answer: approved.answer,
        status: "Reviewed answer",
      };
    }
    const sourceExcerpt = source.content
      .split("\n\n")
      .slice(source.id === "security" ? 1 : 0, source.id === "security" ? 2 : 2)
      .join("\n\n");
    return {
      ...requirement,
      evidence,
      answer:
        requirement.topic === "Access controls" ||
        requirement.topic === "Customer success workflows"
          ? `Reference: ${source.name}\n${sourceExcerpt}\n\nConfirm applicability with Northstar before submitting.`
          : requirement.answer,
    };
  });
  const content = voc
    ? topics
        .map(
          (topic) =>
            `${topic.topic} · ${topic.accounts.length} accounts\n${topic.accounts.join(", ")}\n${topic.quotes.map((quote) => `“${quote}”`).join("\n")}`
        )
        .join("\n\n") ||
      "No customer signals are available. Add customer calls or feedback and run again."
    : requirements
        .map((item) => `${item.topic}\n${item.answer}\nStatus: ${item.status}`)
        .join("\n\n");
  const inputIds = voc
    ? [...new Set(topics.flatMap((topic) => topic.sourceIds))]
    : requirements
        .filter((item) => allowedIds.has(item.evidence))
        .map((item) => item.evidence);
  const conversation = {
    ...newConversation(
      state,
      podId,
      id,
      voc ? "Review customer feedback" : "Prepare the Northstar response",
      true
    ),
    content: `${reason}${execution.prompt ? `\n\nEmma\n${execution.prompt}` : ""}\n\n${state.files.find((file) => file.id === (execution.agentId ?? configuration.defaultAgentId))?.name ?? "Agent"} · Demo run\n${content}\n\n${skippedIds.length ? `${skippedIds.length} source excluded because it isn’t shared with everyone in the pod.` : "All cited sources are available to everyone in this pod."}`,
    sourceIds: inputIds,
    description: `${reason} · ${updated} UTC`,
  };
  const snapshotId = voc ? "voc-snapshot" : "tender-draft";
  const frameId = voc ? "voc-frame" : "tender-frame";
  const frame = frameHtml(
    voc ? "What customers are asking for" : "Northstar tender",
    `${reason} · ${updated} UTC · Evidence checked for the pod’s audience.`,
    voc
      ? topics.map((topic) => ({
          title: topic.topic,
          detail: topic.quotes[0] ?? "",
          sourceIds: topic.sourceIds,
          status: `${topic.accounts.length} ${topic.accounts.length === 1 ? "account" : "accounts"} · ${topic.accounts.join(", ")}`,
        }))
      : requirements.map((item) => ({
          title: item.topic,
          detail: item.answer,
          sourceIds: [item.evidence],
          status: item.status,
        }))
  );
  const versionFile: WorkspaceFile = {
    ...conversation,
    id: `${id}:output`,
    kind: "document",
    name: voc
      ? "Customer feedback · review findings"
      : "Tender response · run output",
    parentId: id,
    sharedWith: [],
    content,
    description: "Saved output from this run",
  };
  const nextFiles = [
    ...state.files.map((file) =>
      file.id === snapshotId || file.id === frameId
        ? {
            ...file,
            content: file.id === frameId ? frame : content,
            sourceIds: inputIds,
            revision: (file.revision ?? 1) + 1,
            description: `Updated ${updated} UTC · Version ${(file.revision ?? 1) + 1}`,
          }
        : file
    ),
    conversation,
    versionFile,
  ];
  for (const outputId of [snapshotId, frameId]) {
    const output = nextFiles.find((file) => file.id === outputId);
    if (output) {
      validateProvenance(nextFiles, output, audienceFor(nextFiles, outputId));
    }
  }
  const proposals = [...state.proposals];
  if (voc) {
    for (const topic of topics.filter((item) => item.accounts.length >= 2)) {
      const existing = proposals.findIndex(
        (proposal) => proposal.topic === topic.topic
      );
      const proposal: Proposal = {
        id: `proposal:${topic.topic}`,
        topic: topic.topic,
        sourceIds: topic.sourceIds,
        status: "pending",
      };
      if (existing < 0) {
        proposals.push(proposal);
      } else {
        proposals[existing] = {
          ...proposals[existing],
          sourceIds: topic.sourceIds,
        };
      }
    }
  }
  const proposalsById = new Map(
    proposals.map((proposal) => [proposal.id, proposal])
  );
  const refreshedFiles = nextFiles.map((file) => {
    const proposal = proposalsById.get(file.id);
    return proposal?.status === "pending"
      ? { ...file, sourceIds: proposal.sourceIds }
      : file;
  });
  const nextFileIds = new Set(nextFiles.map((file) => file.id));
  const inputIdSet = new Set(inputIds);
  const proposalFiles = voc
    ? proposals
        .filter((proposal) => !nextFileIds.has(proposal.id))
        .map((proposal): WorkspaceFile => ({
          ...conversation,
          id: proposal.id,
          name: `${proposal.topic} · roadmap proposal`,
          kind: "document",
          parentId: id,
          sharedWith: [],
          content: `Explore ${proposal.topic.toLowerCase()}\n\nReview the customer evidence before making a roadmap commitment. Approval creates a local Linear issue.`,
          sourceIds: proposal.sourceIds,
          description: "Roadmap proposal · Review required",
        }))
    : [];
  const runs = [
    {
      id,
      podId,
      ...(execution.triggerId ? { triggerId: execution.triggerId } : {}),
      conversationId: id,
      inputIds,
      inputRevisions: Object.fromEntries(
        allowed
          .filter((file) => inputIdSet.has(file.id))
          .map((file) => [file.id, file.revision ?? 1])
      ),
      instructions:
        execution.prompt ??
        state.files.find(
          (file) =>
            file.id === (execution.agentId ?? configuration.defaultAgentId)
        )?.content ??
        "",
      agentId: execution.agentId ?? configuration.defaultAgentId,
      skippedIds,
      outputIds: [snapshotId, frameId, versionFile.id],
      at,
      reason,
    },
    ...state.runs,
  ];
  return linkToPod(
    { ...state, files: [...refreshedFiles, ...proposalFiles], runs, proposals },
    podId,
    [id]
  );
}
export function incomingCall(
  state: WorkspaceState,
  execution?: { id: string; at: string }
): WorkspaceState {
  const count = state.incomingCount + 1;
  const file: WorkspaceFile = {
    id: `incoming:${count}`,
    name: `Atlas · rollout feedback${count > 1 ? ` ${count}` : ""}`,
    kind: "recording",
    scope: "Workspace files",
    parentId: "calls",
    location: "Customers / Customer calls",
    description: execution
      ? "Atlas · Oct 6 · Rollout review · Gong"
      : "Atlas · Just now · Simulated Gong event",
    content:
      "Robin, Atlas\nWe need to know when connected sources were last refreshed. Before inviting the whole team, we also want to check which groups can access each source.\n\nMaya\nI’ll add both needs to the product feedback review. We haven’t committed to a delivery date.",
    access: "company",
    sharedWith: [],
    canShare: true,
    mediaUrl: "/company-demo/atlas.wav",
    signals: [
      {
        topic: "Knowledge freshness",
        account: "Atlas",
        quote: "We need to know when connected sources were last refreshed.",
      },
      {
        topic: "Access controls",
        account: "Atlas",
        quote: "We want to check which groups can access each source.",
      },
    ],
  };
  const next = {
    ...state,
    files: [...state.files, file],
    incomingCount: count,
  };
  return state.configurations["voice-of-customer"].triggerEnabled
    ? runPod(next, "voice-of-customer", "New call in Customer calls", {
        id: execution?.id ?? crypto.randomUUID(),
        at: execution?.at ?? new Date().toISOString(),
        triggerId: "voc-trigger",
        agentId: state.files.find((entry) => entry.id === "voc-trigger")
          ?.trigger?.agentId,
        prompt: state.files.find((entry) => entry.id === "voc-trigger")?.trigger
          ?.prompt,
      })
    : next;
}
export function reviewProposal(
  state: WorkspaceState,
  proposalId: string,
  approve: boolean
): WorkspaceState {
  const proposal = state.proposals.find((item) => item.id === proposalId);
  if (!proposal || proposal.status !== "pending") {
    return state;
  }
  const issueId = `issue:${proposalId}`;
  const issue: WorkspaceFile = {
    id: issueId,
    name: `Explore ${proposal.topic.toLowerCase()}`,
    kind: "document",
    scope: "Workspace files",
    parentId: "roadmap",
    location: "Product / Roadmap",
    description: "Linear · Local issue · Needs product review",
    content: `Customer need: ${proposal.topic}\n\nReview the linked evidence and scope a product response. No delivery date or implementation commitment has been made.\n\nCreated from Voice of Customer. This is a local demo issue.`,
    access: "company",
    sharedWith: [],
    canShare: true,
    sourceIds: proposal.sourceIds,
  };
  if (approve) {
    validateProvenance(state.files, issue, new Set(everyone));
  }
  const next = {
    ...state,
    files: approve ? [...state.files, issue] : state.files,
    proposals: state.proposals.map((item): Proposal =>
      item.id === proposalId
        ? {
            ...item,
            status: approve ? "approved" : "dismissed",
            issueId: approve ? issueId : undefined,
          }
        : item
    ),
  };
  return approve ? linkToPod(next, "voice-of-customer", [issueId]) : next;
}
