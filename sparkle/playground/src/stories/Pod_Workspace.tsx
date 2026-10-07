import { Button } from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

import type { InputBarMessage } from "../components/InputBar";
import {
  addUploads,
  configurePod,
  converse,
  initialWorkspace,
  readUploads,
  restoreWorkspace,
  storageKey,
  type WorkspaceState,
} from "../components/pod-workspace/engine";
import {
  type WorkspaceFile,
  type FileScope,
  type WorkspaceLocation,
  workspacePods,
  workspacePanel,
} from "../components/pod-workspace/model";
import { dispatchFileTriggers } from "../components/pod-workspace/triggers";
import { PodWorkspace } from "../components/pod-workspace/PodWorkspace";
import { PodWorkspacePanels } from "../components/pod-workspace/PodWorkspacePanels";
import {
  createWorkspaceRecords,
  exportToolSettings,
  restoreToolSettings,
} from "../components/pod-workspace/records";
import { WorkspaceFilesBrowser } from "../components/pod-workspace/WorkspaceFilesBrowser";
import { WorkspaceSidebar } from "../components/pod-workspace/WorkspaceSidebar";
import NewNavigation from "./New_Navigation";

function loadRecords() {
  try {
    const raw = localStorage.getItem(`${storageKey}-tools`);
    return {
      records: raw ? restoreToolSettings(raw) : createWorkspaceRecords(),
      error: "",
    };
  } catch {
    return {
      records: createWorkspaceRecords(),
      error:
        "Saved tool settings couldn’t be loaded. Default connections are open.",
    };
  }
}

function loadWorkspace(): { state: WorkspaceState; error: string } {
  try {
    const raw = localStorage.getItem(storageKey);
    return {
      state: raw ? restoreWorkspace(raw) : initialWorkspace(),
      error: "",
    };
  } catch {
    return {
      state: initialWorkspace(),
      error: "Saved demo data couldn’t be loaded. A fresh workspace is open.",
    };
  }
}

function WorkspaceBrowser({
  state,
  location,
  onFolderChange,
  onOpen,
  onCreate,
  onChange,
}: {
  state: WorkspaceState;
  location: WorkspaceLocation;
  onFolderChange: (id: string | null) => void;
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onChange: (update: (state: WorkspaceState) => WorkspaceState) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const folder = state.files.find((file) => file.id === location.folderId);
  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-6 text-foreground md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              {location.scope}
            </p>
            <h1 className="text-2xl font-semibold">
              {folder?.name ?? location.scope}
            </h1>
          </div>
          <div className="flex gap-2">
            {folder && (
              <Button
                label={
                  folder.kind === "conversation"
                    ? "Open conversation"
                    : "Folder details"
                }
                variant="outline"
                onClick={() => onOpen(folder.id)}
              />
            )}
            {location.scope !== "Shared with me" &&
              !location.folderId?.startsWith("pod:") &&
              location.folderId !== "pods" && (
                <Button
                  label="New folder"
                  variant="outline"
                  onClick={() => setCreating(!creating)}
                />
              )}
          </div>
        </div>
        {creating && (
          <form
            className="mb-5 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) {
                onCreate(name.trim());
                setName("");
                setCreating(false);
              }
            }}
          >
            <input
              aria-label="Folder name"
              autoFocus
              className="rounded-lg border border-border bg-background p-2 text-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Folder name"
            />
            <Button
              label="Create folder"
              variant="highlight"
              onClick={() => {
                if (name.trim()) {
                  onCreate(name.trim());
                  setName("");
                  setCreating(false);
                }
              }}
            />
          </form>
        )}
        <WorkspaceFilesBrowser
          files={state.files}
          state={state}
          onChange={onChange}
          scope={location.scope}
          folderId={location.folderId}
          onFolderChange={onFolderChange}
          onOpen={onOpen}
        />
      </div>
    </main>
  );
}

export default function PodWorkspacePlayground() {
  const [loaded] = useState(loadWorkspace);
  const [state, setState] = useState(loaded.state);
  const [stagedUploads, setStagedUploads] = useState<{
    podId: string;
    files: File[];
  } | null>(null);
  const stateRef = useRef(state);
  const [loadedRecords] = useState(loadRecords);
  const [records, setRecords] = useState(loadedRecords.records);
  const [error, setError] = useState(loaded.error || loadedRecords.error);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      setError(
        "Browser storage is full or unavailable. Changes remain open here but won’t survive a reload. "
      );
    }
  }, [state]);
  useEffect(() => {
    try {
      localStorage.setItem(
        `${storageKey}-tools`,
        JSON.stringify(exportToolSettings(records))
      );
    } catch {
      setError("Tool settings couldn’t be saved in this browser.");
    }
  }, [records]);
  const change = (update: (current: WorkspaceState) => WorkspaceState) => {
    try {
      const updated = update(stateRef.current);
      const previous = new Map(
        stateRef.current.files.map((file) => [file.id, file])
      );
      const now = new Date().toISOString();
      const next = {
        ...updated,
        files: updated.files.map((file) => {
          const old = previous.get(file.id);
          return !old ||
            ["name", "content", "parentId", "sharedWith", "permissions"].some(
              (key) =>
                JSON.stringify(old[key as keyof WorkspaceFile]) !==
                JSON.stringify(file[key as keyof WorkspaceFile])
            )
            ? { ...file, updatedAt: now, updatedBy: "Emma" }
            : file;
        }),
      };
      stateRef.current = next;
      setState(next);
      setError("");
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The workspace couldn’t be updated."
      );
      return false;
    }
  };
  const upload = async (
    uploads: File[],
    podId: string,
    parentId: string | null = null,
    scope: FileScope = "My files"
  ): Promise<WorkspaceFile[]> => {
    try {
      const added = await readUploads(
        uploads,
        parentId,
        stateRef.current,
        scope
      );
      return change((current) =>
        dispatchFileTriggers(addUploads(current, podId, added), added)
      )
        ? added
        : [];
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The upload failed.");
      return [];
    }
  };
  const uploadTo = async (
    uploads: File[],
    location: WorkspaceLocation,
    podId?: string
  ) => {
    const added = await readUploads(
      uploads,
      location.folderId,
      stateRef.current,
      location.scope
    );
    if (
      !change((current) =>
        dispatchFileTriggers(
          podId
            ? addUploads(current, podId, added)
            : { ...current, files: [...current.files, ...added] },
          added
        )
      )
    ) {
      throw new Error("The upload couldn’t be saved.");
    }
    if (podId) {
      setStagedUploads(null);
    }
  };
  const send = async (
    podId: string,
    message: InputBarMessage,
    existingId?: string
  ): Promise<string | undefined> => {
    try {
      const id = existingId ?? crypto.randomUUID();
      const uploads = await readUploads(
        message.files,
        existingId ?? null,
        stateRef.current
      );
      const parent = stateRef.current.files.find(
        (file) => file.id === existingId
      );
      const attachments = uploads.map((file) => ({
        ...file,
        parentId: id,
        scope: parent?.scope ?? file.scope,
      }));
      return change((current) =>
        converse(current, podId, message.text, id, existingId, attachments)
      )
        ? id
        : undefined;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The conversation couldn’t be created."
      );
      return undefined;
    }
  };
  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border-b border-border bg-muted-background px-4 py-3 text-sm text-foreground"
        >
          <span>{error}</span>
          <Button
            label="Dismiss"
            variant="ghost"
            size="xs"
            onClick={() => setError("")}
          />
        </div>
      )}
      <NewNavigation
        initialPods={workspacePods}
        initialWorkspacePanel={(() => {
          const id = new URL(window.location.href).searchParams.get("file");
          return id && state.files.some((file) => file.id === id)
            ? workspacePanel({ kind: "file", fileId: id }, state.files)
            : undefined;
        })()}
        renderFilesNavigation={(location, onLocation) => (
          <WorkspaceSidebar
            files={state.files}
            location={location}
            onLocation={onLocation}
          />
        )}
        renderFiles={(location, onFolderChange, openPanel) => (
          <WorkspaceBrowser
            key={`${location.scope}:${location.folderId}`}
            state={state}
            location={location}
            onChange={change}
            onFolderChange={onFolderChange}
            onOpen={(fileId) =>
              openPanel(workspacePanel({ kind: "file", fileId }, state.files))
            }
            onCreate={(name) =>
              change((current) => ({
                ...current,
                files: [
                  ...current.files,
                  {
                    id: crypto.randomUUID(),
                    name,
                    kind: "folder",
                    scope: location.scope,
                    parentId: location.folderId ?? undefined,
                    location: "",
                    content: "",
                    description: "Created by you",
                    access:
                      location.scope === "Workspace files"
                        ? "company"
                        : "private",
                    sharedWith: [],
                    canShare: true,
                  },
                ],
              }))
            }
          />
        )}
        renderPod={(space, openPanel) => (
          <PodWorkspace
            key={space.id}
            space={space}
            state={state}
            onOpenPanel={(view) => openPanel(workspacePanel(view, state.files))}
            onConfigure={(configuration) =>
              change((current) =>
                configurePod(current, space.id, configuration)
              )
            }
            onSubmitMessage={(message) => {
              void send(space.id, message).then((id) => {
                if (id) {
                  openPanel(
                    workspacePanel(
                      { kind: "file", fileId: id },
                      stateRef.current.files
                    )
                  );
                }
              });
            }}
            onChange={change}
            stagedUploads={
              stagedUploads?.podId === space.id ? stagedUploads.files : []
            }
            onUpload={(files) =>
              setStagedUploads(files.length ? { podId: space.id, files } : null)
            }
          />
        )}
        renderPodPanel={(space, panel, controls) => (
          <PodWorkspacePanels
            key={`${space?.id ?? "files"}:${panel.view.kind}:${panel.view.kind === "file" ? panel.view.fileId : ""}`}
            space={space}
            view={panel.view}
            state={state}
            onChange={change}
            records={records}
            setRecords={setRecords}
            controls={controls}
            onSend={send}
            onUpload={upload}
            stagedUploads={stagedUploads}
            onUploadTo={uploadTo}
          />
        )}
      />
    </div>
  );
}
