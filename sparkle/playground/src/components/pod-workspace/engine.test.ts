import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addUploads,
  audienceFor,
  canonicalFile,
  configurePod,
  converse,
  incomingCall,
  initialWorkspace as populatedWorkspace,
  linkToPod,
  moveFile,
  podSources,
  restoreWorkspace,
  reviewProposal,
  runPod,
  shareFile,
  setFilePermissions,
  roleFor,
  transferFiles,
} from "./engine";

import {
  createPodConfiguration,
  createWorkspaceFiles,
  workspacePods,
} from "./fixtures";
import { workspaceFileUrl, linkedFileIds } from "./fileLinks";
import {
  saveTrigger,
  toggleTrigger,
  runTrigger,
  dispatchFileTriggers,
} from "./triggers";
import type { WorkspaceState } from "./engine";

function initialWorkspace(): WorkspaceState {
  return {
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
}

const voc = "voice-of-customer";
const tender = "northstar-tender";

test("pod references keep one canonical identity through rename, move, and removal", () => {
  const initial = initialWorkspace();
  let state = linkToPod(initial, voc, ["meridian-call"]);
  state = {
    ...state,
    files: state.files.map((file) =>
      file.id === "meridian-call"
        ? { ...file, name: "Meridian · renamed" }
        : file
    ),
  };
  state = moveFile(state, "meridian-call", "product");
  assert.equal(
    canonicalFile(
      state.files,
      state.configurations[voc].references.find(
        (ref) => ref.fileId === "meridian-call"
      )!.fileId
    )?.name,
    "Meridian · renamed"
  );
  assert.equal(
    canonicalFile(
      state.files,
      state.configurations[tender].references.find(
        (ref) => ref.fileId === "meridian-call"
      )!.fileId
    )?.parentId,
    "product"
  );
  state = configurePod(state, voc, {
    ...state.configurations[voc],
    references: state.configurations[voc].references.filter(
      (ref) => ref.fileId !== "meridian-call"
    ),
  });
  assert.ok(state.files.some((file) => file.id === "meridian-call"));
  assert.equal(
    canonicalFile(
      state.files,
      state.configurations[tender].references.find(
        (ref) => ref.fileId === "meridian-call"
      )!.fileId
    )?.id,
    "meridian-call"
  );
});

test("links do not broaden access; canonical parents do", () => {
  const state = transferFiles(
    initialWorkspace(),
    ["commercial-notes"],
    { scope: "Workspace files", folderId: "calls" },
    "link"
  );
  assert.deepEqual(
    [
      ...audienceFor(
        state.files,
        state.files.find(
          (file) => file.kind === "link" && file.targetId === "commercial-notes"
        )!.id
      ),
    ],
    ["Emma"]
  );
  assert.deepEqual(
    audienceFor(state.files, "voc-snapshot"),
    new Set(["Emma", "Lucas", "Sophie"])
  );
  const moved = moveFile(state, "commercial-notes", "product");
  assert.ok(audienceFor(moved.files, "commercial-notes").has("Maya"));
  const narrowed = moveFile(moved, "commercial-notes", "personal-notes");
  assert.deepEqual(
    audienceFor(narrowed.files, "commercial-notes"),
    audienceFor(moved.files, "commercial-notes")
  );
});

test("a conversation moves with its children and cannot contain itself", () => {
  const state = moveFile(initialWorkspace(), "voc-baseline", "personal-notes");
  assert.equal(
    state.files.find((file) => file.id === "voc-snapshot")?.parentId,
    "voc-baseline"
  );
  assert.ok(
    state.files
      .find((file) => file.id === "voc-snapshot")
      ?.location.includes("Notes / Weekly customer feedback review")
  );
  assert.ok(audienceFor(state.files, "voc-snapshot").has("Sophie"));
  assert.throws(
    () => moveFile(state, "personal-notes", "voc-baseline"),
    /children/
  );
});

test("private questions can use private sources while shared questions and tender runs exclude them", () => {
  let state = converse(
    initialWorkspace(),
    tender,
    "What do the negotiation notes say?",
    "private-conversation"
  );
  assert.ok(
    state.files
      .find((file) => file.id === "private-conversation")
      ?.sourceIds?.includes("commercial-notes")
  );
  assert.throws(
    () => shareFile(state, "private-conversation", tender),
    /Share the source first/
  );
  state = configurePod(state, tender, {
    ...state.configurations[tender],
    audience: "pod",
  });
  state = converse(
    state,
    tender,
    "What do the negotiation notes say?",
    "shared-conversation"
  );
  assert.ok(
    !state.files
      .find((file) => file.id === "shared-conversation")
      ?.sourceIds?.includes("commercial-notes")
  );
  state = runPod(state, tender);
  assert.ok(state.runs[0].skippedIds.includes("commercial-notes"));
  assert.ok(!state.runs[0].inputIds.includes("commercial-notes"));
});

test("conversation attachments inherit the chosen audience and remain children", () => {
  let state = initialWorkspace();
  state = configurePod(state, tender, {
    ...state.configurations[tender],
    audience: "pod",
  });
  const original = state.files.find((file) => file.id === "commercial-notes");
  assert.ok(original);
  const attachment = {
    ...original,
    id: "uploaded-notes",
    name: "Question.txt",
    parentId: "new-conversation",
    content: "A new requirement",
  };
  state = converse(
    state,
    tender,
    "Find this new requirement",
    "new-conversation",
    undefined,
    [attachment]
  );
  assert.equal(
    state.files.find((file) => file.id === "uploaded-notes")?.parentId,
    "new-conversation"
  );
  assert.deepEqual(
    audienceFor(state.files, "uploaded-notes"),
    new Set(["Emma", "Lucas", "Thomas"])
  );
});

test("an incoming call updates the maintained snapshot and creates an inspectable run", () => {
  const state = incomingCall(initialWorkspace());
  assert.ok(podSources(state, voc).some((file) => file.id === "incoming:1"));
  assert.equal(state.runs.length, 1);
  assert.equal(state.runs[0].reason, "New call in Customer calls");
  assert.ok(state.runs[0].inputIds.includes("incoming:1"));
  assert.equal(state.runs[0].inputRevisions["incoming:1"], 1);
  assert.equal(
    state.files.find((file) => file.id === "voc-snapshot")?.revision,
    2
  );
  assert.match(
    state.files.find((file) => file.id === "voc-snapshot")?.content ?? "",
    /Atlas/
  );
  assert.ok(
    state.files.some(
      (file) =>
        file.parentId === state.runs[0].conversationId &&
        file.kind === "document"
    )
  );
});

test("paused triggers retain incoming calls without running; manual refresh picks them up", () => {
  let state = initialWorkspace();
  state = configurePod(state, voc, {
    ...state.configurations[voc],
    triggerEnabled: false,
  });
  state = incomingCall(state);
  assert.equal(state.runs.length, 0);
  assert.equal(state.incomingCount, 1);
  state = runPod(state, voc);
  assert.ok(state.runs[0].inputIds.includes("incoming:1"));
});

test("repeated runs and repeated approvals do not duplicate roadmap issues", () => {
  let state = runPod(initialWorkspace(), voc);
  const proposal = state.proposals[0];
  assert.ok(proposal);
  state = reviewProposal(state, proposal.id, true);
  state = incomingCall(state);
  state = reviewProposal(state, proposal.id, true);
  assert.equal(
    state.files.filter((file) => file.id === `issue:${proposal.id}`).length,
    1
  );
  assert.equal(
    state.proposals.filter((item) => item.topic === proposal.topic).length,
    1
  );
  assert.equal(
    state.proposals.find((item) => item.id === proposal.id)?.status,
    "approved"
  );
});

test("a wider output audience prevents a run from leaking restricted evidence", () => {
  let state = shareFile(initialWorkspace(), "voc-snapshot", "workspace");
  const source = state.files.find((file) => file.id === "commercial-notes");
  assert.ok(source);
  state = {
    ...state,
    files: [
      ...state.files,
      {
        ...source,
        id: "restricted-feedback",
        sharedWith: [voc],
        signals: [
          {
            topic: "Access controls",
            account: "Private account",
            quote: "A restricted request",
          },
        ],
      },
    ],
  };
  state = linkToPod(state, voc, ["restricted-feedback"]);
  assert.throws(() => runPod(state, voc), /Share the source first/);
});

test("reviewed tender answers require accessible linked evidence on the next run", () => {
  let state = initialWorkspace();
  state = {
    ...state,
    files: state.files.map((file) =>
      file.id === "tender-frame"
        ? {
            ...file,
            approvedAnswers: [
              {
                topic: "Regional hosting",
                answer: "Reviewed by the security owner.",
                sourceId: "security",
              },
            ],
          }
        : file
    ),
  };
  state = runPod(state, tender);
  assert.match(
    state.files.find((file) => file.id === "tender-draft")?.content ?? "",
    /Reviewed by the security owner/
  );
  state = configurePod(state, tender, {
    ...state.configurations[tender],
    references: state.configurations[tender].references.filter(
      (ref) => ref.fileId !== "security"
    ),
  });
  state = runPod(state, tender);
  assert.match(
    state.files.find((file) => file.id === "tender-draft")?.content ?? "",
    /Source unavailable/
  );
});

test("legacy completion flags do not block work and saved state validates on reload", () => {
  const state = runPod(initialWorkspace(), tender);
  const saved = {
    ...state,
    configurations: {
      ...state.configurations,
      [tender]: { ...state.configurations[tender], completed: true },
    },
  };
  const restored = restoreWorkspace(JSON.stringify(saved));
  assert.equal(runPod(restored, tender).runs.length, 2);
  assert.throws(() => restoreWorkspace('{"version":2,"files":[]}'), /invalid/);
});

test("the initial workspace opens with completed work in both pods", () => {
  const state = populatedWorkspace();
  assert.equal(state.runs.filter((run) => run.podId === voc).length, 2);
  assert.equal(state.runs.filter((run) => run.podId === tender).length, 1);
  assert.ok(state.proposals.some((proposal) => proposal.status === "pending"));
  const approved = state.proposals.find(
    (proposal) => proposal.status === "approved"
  );
  assert.ok(approved?.issueId);
  assert.ok(state.files.some((file) => file.id === approved.issueId));
  assert.match(
    state.files.find((file) => file.id === "voc-snapshot")?.content ?? "",
    /Atlas/
  );
  assert.ok(
    state.files.find((file) => file.id === "tender-draft")?.revision === 2
  );
  assert.ok(
    state.runs
      .find((run) => run.podId === tender)
      ?.skippedIds.includes("commercial-notes")
  );
  assert.ok(
    state.files.some((file) => file.parentId === "example:northstar-response")
  );
  assert.equal(
    canonicalFile(state.files, "example:northstar-clarification")?.parentId,
    undefined
  );
  assert.equal(JSON.stringify(populatedWorkspace()), JSON.stringify(state));
});

test("saved workspaces gain populated examples without losing edits or duplicating work", () => {
  let state: WorkspaceState = {
    ...initialWorkspace(),
    exampleSeeded: undefined,
  };
  state = converse(
    state,
    tender,
    "My saved question about Meridian",
    "saved-question"
  );
  state = {
    ...state,
    files: state.files.map((file) =>
      file.id === "tender-draft"
        ? { ...file, content: "My edited response", revision: 7 }
        : file
    ),
  };
  const loaded = restoreWorkspace(JSON.stringify(state));
  assert.ok(loaded.files.some((file) => file.id === "saved-question"));
  assert.equal(
    loaded.files.find((file) => file.id === "tender-draft")?.content,
    "My edited response"
  );
  assert.equal(loaded.runs.length, 3);
  assert.equal(
    JSON.stringify(restoreWorkspace(JSON.stringify(loaded))),
    JSON.stringify(loaded)
  );
});

test("existing pending proposals keep their status when example history is added", () => {
  const state = {
    ...runPod(initialWorkspace(), voc),
    exampleSeeded: undefined,
  };
  const loaded = restoreWorkspace(JSON.stringify(state));
  assert.equal(
    loaded.proposals.find(
      (proposal) => proposal.topic === "Knowledge freshness"
    )?.status,
    "pending"
  );
  const approved = reviewProposal(loaded, "proposal:Knowledge freshness", true);
  assert.equal(
    new Set(approved.files.map((file) => file.id)).size,
    approved.files.length
  );
});

test("file links become conversation references without moving or sharing their targets", () => {
  const initial = initialWorkspace();
  const target = initial.files.find((file) => file.id === "commercial-notes")!;
  const url = workspaceFileUrl(
    target.id,
    "http://localhost:3008/#Pod_Workspace"
  );
  assert.equal(new URL(url).searchParams.get("file"), target.id);
  const shared = configurePod(initial, voc, {
    ...initial.configurations[voc],
    audience: "pod",
  });
  let next = converse(
    shared,
    voc,
    `Use this for the response: ${url}`,
    "linked-chat"
  );
  assert.deepEqual(
    next.files.find((file) => file.id === target.id),
    target
  );
  assert.ok(
    next.files.some(
      (file) =>
        file.kind === "link" &&
        file.parentId === "linked-chat" &&
        file.targetId === target.id
    )
  );
  assert.ok(
    !next.files
      .find((file) => file.id === "linked-chat")
      ?.sourceIds?.includes(target.id)
  );
  next = converse(next, voc, url, "linked-chat", "linked-chat");
  assert.equal(
    next.files.filter(
      (file) =>
        file.kind === "link" &&
        file.parentId === "linked-chat" &&
        file.targetId === target.id
    ).length,
    1
  );
  assert.deepEqual(linkedFileIds(url, next.files), [target.id]);
});

test("trigger files persist their schedule and start the selected agent with their own message", () => {
  const base = initialWorkspace();
  const definition = base.files.find(
    (file) => file.id === "voc-trigger"
  )!.trigger!;
  const next = saveTrigger(
    base,
    "Monday review",
    {
      ...definition,
      kind: "schedule",
      agentId: "agent",
      prompt: "Cite repeated customer needs",
      time: "10:30",
      timezone: "UTC",
    },
    "weekly-trigger"
  );
  assert.ok(
    next.configurations[voc].references.some(
      (ref) => ref.fileId === "weekly-trigger"
    )
  );
  const run = runTrigger(next, "weekly-trigger");
  assert.equal(run.runs[0].agentId, "agent");
  assert.equal(run.runs[0].triggerId, "weekly-trigger");
  assert.equal(run.runs[0].instructions, "Cite repeated customer needs");
  const restored = restoreWorkspace(JSON.stringify(run));
  assert.equal(
    restored.files.find((file) => file.id === "weekly-trigger")?.trigger?.time,
    "10:30"
  );
  assert.throws(
    () =>
      runTrigger(toggleTrigger(restored, "weekly-trigger"), "weekly-trigger"),
    /Enable/
  );
});

test("a watched folder starts one run for an upload batch and excludes private evidence", () => {
  const base = initialWorkspace();
  const definition = base.files.find(
    (file) => file.id === "voc-trigger"
  )!.trigger!;
  const next = saveTrigger(
    base,
    "Uploaded evidence",
    { ...definition, folderId: "personal-notes" },
    "upload-trigger"
  );
  const upload = {
    ...base.files.find((file) => file.id === "commercial-notes")!,
    id: "new-private-evidence",
    parentId: "personal-notes",
  };
  const uploaded = addUploads(next, voc, [upload]);
  const dispatched = dispatchFileTriggers(uploaded, [upload]);
  assert.equal(dispatched.runs.length, 1);
  assert.equal(dispatched.runs[0].triggerId, "upload-trigger");
  assert.ok(dispatched.runs[0].skippedIds.includes(upload.id));
  assert.equal(
    dispatchFileTriggers(toggleTrigger(uploaded, "upload-trigger"), [upload])
      .runs.length,
    0
  );
});

test("copy, link, and move preserve canonical identity and conversation children", () => {
  const state = initialWorkspace();
  const linked = transferFiles(
    state,
    ["commercial-notes"],
    { scope: "Workspace files", folderId: "calls" },
    "link"
  );
  const reference = linked.files.find(
    (file) => file.kind === "link" && file.targetId === "commercial-notes"
  )!;
  assert.equal(
    canonicalFile(linked.files, reference.id)?.parentId,
    "personal-notes"
  );
  assert.deepEqual(audienceFor(linked.files, reference.id), new Set(["Emma"]));
  const copied = transferFiles(
    state,
    ["voc-baseline"],
    { scope: "My files", folderId: "personal-notes" },
    "copy"
  );
  const conversation = copied.files.find(
    (file) => file.kind === "conversation" && file.parentId === "personal-notes"
  )!;
  assert.notEqual(conversation.id, "voc-baseline");
  assert.ok(
    copied.files.some(
      (file) => file.kind === "frame" && file.parentId === conversation.id
    )
  );
  assert.ok(
    copied.files.some(
      (file) => file.id === "voc-frame" && file.parentId === "voc-baseline"
    )
  );
  const moved = transferFiles(
    copied,
    [conversation.id],
    { scope: "My files", folderId: null },
    "move"
  );
  assert.equal(
    moved.files.find((file) => file.id === conversation.id)?.parentId,
    undefined
  );
  assert.ok(
    moved.files.some(
      (file) => file.kind === "frame" && file.parentId === conversation.id
    )
  );
  assert.throws(
    () =>
      transferFiles(
        state,
        ["personal-notes"],
        { scope: "My files", folderId: "commercial-notes" },
        "copy"
      ),
    /writable/
  );
  assert.throws(
    () =>
      transferFiles(
        state,
        ["customers"],
        { scope: "Workspace files", folderId: "calls" },
        "copy"
      ),
    /children/
  );
  const privateWork = converse(
    state,
    tender,
    "What do the negotiation notes say?",
    "private-copy"
  );
  assert.throws(
    () =>
      transferFiles(
        privateWork,
        ["private-copy"],
        { scope: "Workspace files", folderId: "calls" },
        "copy"
      ),
    /Share the source first/
  );
});

test("legacy pod folders are removed without losing files or inherited access", () => {
  const state = initialWorkspace();
  const legacy = {
    ...state,
    files: [
      ...state.files,
      {
        ...state.files.find((file) => file.id === "personal-notes")!,
        id: `home:${voc}`,
        name: "pod-voice-of-customer",
        sharedWith: [voc],
      },
    ].map((file) =>
      file.id === "commercial-notes"
        ? { ...file, parentId: `home:${voc}` }
        : file
    ),
  };
  const before = audienceFor(legacy.files, "commercial-notes");
  const restored = restoreWorkspace(JSON.stringify(legacy));
  assert.ok(
    !restored.files.some(
      (file) => file.id.startsWith("home:") || file.id.startsWith("pod:")
    )
  );
  assert.equal(
    restored.files.find((file) => file.id === "commercial-notes")?.parentId,
    undefined
  );
  assert.deepEqual(audienceFor(restored.files, "commercial-notes"), before);
  assert.deepEqual(restored.configurations, state.configurations);
});

test("file access can override inherited roles, revoke access, and include an email", () => {
  let state = setFilePermissions(initialWorkspace(), "feedback", {
    inherit: false,
    entries: [
      { principal: "workspace", role: "editor" },
      { principal: "Lucas", role: "editor" },
    ],
  });
  state = setFilePermissions(state, "meridian-ticket", {
    inherit: true,
    entries: [
      { principal: "Lucas", role: "viewer" },
      { principal: "Sophie", role: "none" },
      { principal: "reviewer@example.com", role: "commenter" },
    ],
  });
  assert.equal(roleFor(state.files, "meridian-ticket", "Lucas"), "viewer");
  assert.equal(roleFor(state.files, "meridian-ticket", "Maya"), "editor");
  assert.equal(roleFor(state.files, "meridian-ticket", "Sophie"), "none");
  assert.equal(
    roleFor(state.files, "meridian-ticket", "reviewer@example.com"),
    "commenter"
  );
  assert.ok(!audienceFor(state.files, "meridian-ticket").has("Sophie"));
  const restored = restoreWorkspace(JSON.stringify(state));
  assert.equal(
    roleFor(restored.files, "meridian-ticket", "reviewer@example.com"),
    "commenter"
  );
  const linked = transferFiles(
    restored,
    ["meridian-ticket"],
    { scope: "My files", folderId: "personal-notes" },
    "link"
  );
  const ref = linked.files.find((file) => file.targetId === "meridian-ticket");
  assert.ok(ref);
  assert.equal(roleFor(linked.files, ref.id, "Sophie"), "none");
  const run = runPod(linked, "voice-of-customer", "Review feedback", {
    id: "revoked-source-run",
    at: "2026-10-07T12:00:00Z",
  });
  assert.ok(
    run.runs[run.runs.length - 1].skippedIds.includes("meridian-ticket")
  );
});

test("custom access stops inheritance and roles survive a move or copy", () => {
  let state = setFilePermissions(initialWorkspace(), "commercial-notes", {
    inherit: true,
    entries: [{ principal: "Lucas", role: "commenter" }],
  });
  state = setFilePermissions(state, "personal-notes", {
    inherit: false,
    entries: [{ principal: "Maya", role: "editor" }],
  });
  assert.equal(roleFor(state.files, "commercial-notes", "Maya"), "editor");
  const moved = moveFile(state, "commercial-notes", "feedback");
  assert.equal(roleFor(moved.files, "commercial-notes", "Maya"), "editor");
  assert.equal(roleFor(moved.files, "commercial-notes", "Lucas"), "commenter");
  const restricted = setFilePermissions(moved, "commercial-notes", {
    inherit: false,
    entries: [{ principal: "Lucas", role: "viewer" }],
  });
  assert.deepEqual(
    audienceFor(restricted.files, "commercial-notes"),
    new Set(["Emma", "Lucas"])
  );
  const copied = transferFiles(
    restricted,
    ["commercial-notes"],
    { scope: "Workspace files", folderId: "calls" },
    "copy"
  );
  const copy = copied.files.find(
    (file) =>
      file.id !== "commercial-notes" &&
      file.name === "Northstar · negotiation notes"
  );
  assert.ok(copy);
  assert.equal(roleFor(copied.files, copy.id, "Maya"), "none");
  assert.equal(roleFor(copied.files, copy.id, "Lucas"), "viewer");
  assert.throws(
    () =>
      setFilePermissions(state, "commercial-notes", {
        inherit: false,
        entries: [{ principal: "Emma", role: "none" }],
      }),
    /owner keeps access/
  );
});

test("restricting a folder applies to inherited children but preserves explicit exceptions", () => {
  let state = setFilePermissions(initialWorkspace(), "meridian-ticket", {
    inherit: true,
    entries: [{ principal: "Sophie", role: "editor" }],
  });
  state = setFilePermissions(state, "feedback", {
    inherit: false,
    entries: [{ principal: "Lucas", role: "commenter" }],
  });
  assert.equal(roleFor(state.files, "meridian-ticket", "Maya"), "none");
  assert.equal(roleFor(state.files, "meridian-ticket", "Lucas"), "commenter");
  assert.equal(roleFor(state.files, "meridian-ticket", "Sophie"), "editor");
  assert.equal(roleFor(state.files, "northstar-email", "Maya"), "none");
});

test("moving an unedited child preserves roles inherited from its folder", () => {
  const state = setFilePermissions(initialWorkspace(), "personal-notes", {
    inherit: false,
    entries: [{ principal: "Maya", role: "editor" }],
  });
  const moved = moveFile(state, "commercial-notes", "feedback");
  assert.equal(roleFor(moved.files, "commercial-notes", "Maya"), "editor");
});

test("file tabs preserve canonical files, order, titles, and icons across reloads", async () => {
  const { podFileTabs, setPodFileTabs } = await import("./fileTabs");
  const original = populatedWorkspace();
  const podId = "voice-of-customer";
  const changed = setPodFileTabs(original, podId, [
    { fileId: "voc-snapshot", title: "Summary", icon: "BookOpen" },
    { fileId: "voc-frame", title: "Customer themes" },
  ]);
  const restored = restoreWorkspace(JSON.stringify(changed));
  assert.deepEqual(podFileTabs(restored, podId), [
    { fileId: "voc-snapshot", title: "Summary", icon: "BookOpen" },
    { fileId: "voc-frame", title: "Customer themes" },
  ]);
  assert.deepEqual(changed.files, original.files);
  const removed = setPodFileTabs(restored, podId, []);
  assert.deepEqual(
    podFileTabs(restoreWorkspace(JSON.stringify(removed)), podId),
    []
  );
  assert.deepEqual(
    removed.configurations[podId].references,
    changed.configurations[podId].references
  );
  assert.deepEqual(removed.files, restored.files);
});

test("legacy pods default to their frame and duplicate or invalid tabs are excluded", async () => {
  const { podFileTabs, setPodFileTabs } = await import("./fileTabs");
  const state = populatedWorkspace();
  delete state.configurations["voice-of-customer"].fileTabs;
  const restored = restoreWorkspace(JSON.stringify(state));
  assert.deepEqual(podFileTabs(restored, "voice-of-customer"), [
    { fileId: "voc-frame", title: "Overview" },
  ]);
  const changed = setPodFileTabs(restored, "voice-of-customer", [
    { fileId: "voc-frame", title: "One" },
    { fileId: "voc-frame", title: "Duplicate" },
    { fileId: "calls", title: "Folder" },
    { fileId: "missing", title: "Missing" },
  ]);
  assert.deepEqual(podFileTabs(changed, "voice-of-customer"), [
    { fileId: "voc-frame", title: "One" },
  ]);
});
