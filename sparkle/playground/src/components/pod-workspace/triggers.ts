import {
  configurePod,
  linkToPod,
  runPod,
  triggerSchema,
  type WorkspaceState,
} from "./engine";
import { podMembers } from "./fixtures";
import type { TriggerDefinition, WorkspaceFile } from "./model";

export function podTriggers(state: WorkspaceState, podId: string) {
  const linked = new Set(
    state.configurations[podId].references.map((ref) => ref.fileId)
  );
  return state.files.filter(
    (file) =>
      file.kind === "trigger" &&
      file.trigger?.podId === podId &&
      linked.has(file.id)
  );
}

export function triggerDescription(
  trigger: TriggerDefinition,
  files: WorkspaceFile[]
) {
  return trigger.kind === "event"
    ? `File added to ${files.find((file) => file.id === trigger.folderId)?.name ?? "Unavailable folder"}`
    : `${trigger.cadence === "weekly" ? "Every Monday" : "Every day"} at ${trigger.time} · ${trigger.timezone}`;
}

export function saveTrigger(
  state: WorkspaceState,
  name: string,
  definition: TriggerDefinition,
  id: string = crypto.randomUUID()
): WorkspaceState {
  triggerSchema.parse(definition);
  const trigger = { ...definition, prompt: definition.prompt.trim() };
  const pod = state.configurations[trigger.podId];
  if (!pod || !name.trim()) {
    throw new Error("Name the trigger and choose a pod.");
  }
  if (
    !state.files.some(
      (file) => file.id === trigger.agentId && file.kind === "agent"
    )
  ) {
    throw new Error("Choose an available agent.");
  }
  if (
    trigger.kind === "event" &&
    !state.files.some(
      (file) => file.id === trigger.folderId && file.kind === "folder"
    )
  ) {
    throw new Error("Choose a folder to watch.");
  }
  if (!["Europe/Paris", "UTC", "America/New_York"].includes(trigger.timezone)) {
    throw new Error("Choose a supported time zone.");
  }
  const existing = state.files.find((file) => file.id === id);
  if (
    existing &&
    (existing.kind !== "trigger" ||
      !existing.canShare ||
      existing.trigger?.podId !== trigger.podId)
  ) {
    throw new Error("This trigger cannot be edited here.");
  }
  const file: WorkspaceFile = {
    ...(existing ?? {
      id,
      kind: "trigger",
      scope: "My files",
      location: "",
      access: "private",
      sharedWith: [...(podMembers[trigger.podId] ?? [])],
      canShare: true,
    }),
    name: name.trim(),
    content: trigger.prompt,
    description: triggerDescription(trigger, state.files),
    trigger,
  };
  const next = linkToPod(
    {
      ...state,
      files: existing
        ? state.files.map((entry) => (entry.id === id ? file : entry))
        : [...state.files, file],
    },
    trigger.podId,
    [id, trigger.agentId]
  );
  return id === "voc-trigger"
    ? configurePod(next, trigger.podId, {
        ...next.configurations[trigger.podId],
        triggerEnabled: trigger.enabled,
      })
    : next;
}

export function toggleTrigger(
  state: WorkspaceState,
  id: string
): WorkspaceState {
  const file = state.files.find((item) => item.id === id);
  if (!file?.trigger) {
    throw new Error("Trigger unavailable.");
  }
  return saveTrigger(
    state,
    file.name,
    { ...file.trigger, enabled: !file.trigger.enabled },
    file.id
  );
}

export function runTrigger(state: WorkspaceState, id: string): WorkspaceState {
  const file = state.files.find((item) => item.id === id);
  if (!file?.trigger) {
    throw new Error("Trigger unavailable.");
  }
  if (!file.trigger.enabled) {
    throw new Error("Enable this trigger before running it.");
  }
  return runPod(state, file.trigger.podId, file.name, {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    triggerId: file.id,
    agentId: file.trigger.agentId,
    prompt: file.trigger.prompt,
  });
}

export function dispatchFileTriggers(
  state: WorkspaceState,
  added: WorkspaceFile[]
): WorkspaceState {
  let next = state;
  for (const file of state.files) {
    const trigger = file.trigger;
    if (
      !trigger?.enabled ||
      trigger.kind !== "event" ||
      !podTriggers(state, trigger.podId).some((item) => item.id === file.id)
    ) {
      continue;
    }
    const matches = added.some((source) => {
      let parent = source.parentId;
      const visited = new Set<string>();
      while (parent && !visited.has(parent)) {
        if (parent === trigger.folderId) {
          return true;
        }
        visited.add(parent);
        parent = state.files.find((entry) => entry.id === parent)?.parentId;
      }
      return false;
    });
    if (matches) {
      next = runTrigger(next, file.id);
    }
  }
  return next;
}
