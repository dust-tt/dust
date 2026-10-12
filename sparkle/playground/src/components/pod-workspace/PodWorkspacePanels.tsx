import { Avatar, Button, ContextItem } from "@dust-tt/sparkle";
import {
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import type { Space } from "../../data/types";
import type { InputBarMessage } from "../InputBar";
import { WorkspaceConversation } from "./WorkspaceConversation";
import { FileName, FileActions } from "./FileActions";
import { TriggerEditor } from "./PodTriggers";
import { ContextPicker } from "./ContextPicker";
import {
  canonicalFile,
  filePath,
  linkToPod,
  permissionLabel,
  reviewProposal,
  transferFiles,
  type WorkspaceState,
} from "./engine";
import { podMembers, workspacePods } from "./fixtures";
import {
  workspacePanel,
  type FileScope,
  type WorkspaceLocation,
  type PodWorkspacePanelControls,
  type PodWorkspaceView,
  type WorkspaceFile,
} from "./model";
import type { WorkspaceRecords } from "./records";
import { ResourceRow } from "./ResourceRow";
import { TenderReview } from "./TenderReview";
import { SpecialFileView } from "./SpecialFileView";
import { UploadLocationPicker } from "./UploadLocationPicker";
import { WorkspaceFilesBrowser } from "./WorkspaceFilesBrowser";

type Change = (update: (state: WorkspaceState) => WorkspaceState) => void;
type Send = (
  podId: string,
  message: InputBarMessage,
  existingId?: string
) => Promise<string | undefined>;
type Upload = (
  uploads: File[],
  podId: string,
  parentId?: string | null,
  scope?: FileScope
) => Promise<WorkspaceFile[]>;

function PanelContent({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 text-foreground"
    >
      <h1 className="mb-3 text-xl font-semibold">{label}</h1>
      {description && (
        <p className="mb-6 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

function FilePanel({
  file,
  state,
  onChange,
  records,
  setRecords,
  space,
  controls,
  onSend,
  onUpload,
  detailsOnly = false,
}: {
  detailsOnly?: boolean;
  file: WorkspaceFile;
  state: WorkspaceState;
  onChange: Change;
  records: WorkspaceRecords;
  setRecords: Dispatch<SetStateAction<WorkspaceRecords>>;
  space: Space | null;
  controls: PodWorkspacePanelControls;
  onSend: Send;
  onUpload: Upload;
}) {
  const [content, setContent] = useState(file.content);
  const [editing, setEditing] = useState(false);
  const files = state.files;
  const openFile = (id: string) =>
    controls.openPanel(
      workspacePanel(
        { kind: "file", fileId: canonicalFile(files, id)?.id ?? id },
        files
      )
    );
  const setFiles: Dispatch<SetStateAction<WorkspaceFile[]>> = (update) =>
    onChange((current) => ({
      ...current,
      files: typeof update === "function" ? update(current.files) : update,
    }));
  const childrenView = (
    <WorkspaceFilesBrowser
      files={files}
      state={state}
      onChange={onChange}
      scope={file.scope}
      folderId={file.id}
      onOpen={openFile}
    />
  );
  return (
    <section
      aria-label={file.name}
      className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6 text-foreground"
    >
      <div className="flex flex-wrap items-center gap-3">
        <FileName file={file} onChange={onChange} />
        <FileActions file={file} state={state} onChange={onChange} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{filePath(files, file)}</span>
        <span>{permissionLabel(files, file)}</span>
      </div>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          {file.downloadUrl && (
            <a
              className="rounded-lg border border-border px-3 py-1 text-xs"
              href={file.downloadUrl}
              download={file.name}
            >
              Download original
            </a>
          )}
          {["document", "email"].includes(file.kind) && file.canShare && (
            <Button
              label={editing ? "Cancel editing" : "Edit content"}
              variant="ghost"
              size="xs"
              onClick={() => {
                setContent(file.content);
                setEditing(!editing);
              }}
            />
          )}
        </div>
        {detailsOnly ? null : file.kind === "folder" ? (
          childrenView
        ) : ["agent", "skill", "tool", "frame"].includes(file.kind) ? (
          <div>
            <h2 className="sr-only">Details</h2>
            <SpecialFileView
              file={file}
              files={files}
              records={records}
              setRecords={setRecords}
              setFiles={setFiles}
              onFileUpdated={(updated) =>
                controls.replacePanel(
                  workspacePanel(
                    { kind: "file", fileId: file.id },
                    files.map((item) => (item.id === file.id ? updated : item))
                  )
                )
              }
            />
          </div>
        ) : (
          <>
            {file.mediaUrl && (
              <section>
                <h2 className="mb-2 text-sm font-semibold">Recording</h2>
                <audio
                  className="w-full"
                  controls
                  preload="metadata"
                  src={file.mediaUrl}
                  aria-label={`${file.name} recording`}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {file.id.startsWith("incoming:") ||
                  ["northstar-call", "meridian-call", "lumen-call"].includes(
                    file.id
                  )
                    ? "Synthetic recording · Fictional customer conversation"
                    : "Uploaded audio"}
                </p>
              </section>
            )}
            {editing ? (
              <div className="flex flex-col gap-3">
                <textarea
                  aria-label="File content"
                  className="min-h-72 w-full rounded-lg border border-border bg-background p-3 text-sm leading-7"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                />
                <Button
                  label="Save content"
                  variant="highlight"
                  onClick={() => {
                    setFiles((current) =>
                      current.map((item) =>
                        item.id === file.id
                          ? {
                              ...item,
                              content,
                              revision: (item.revision ?? 1) + 1,
                            }
                          : item
                      )
                    );
                    setEditing(false);
                  }}
                />
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-7">
                {file.content}
              </p>
            )}
          </>
        )}
        {state.proposals
          .filter((proposal) => proposal.id === file.id)
          .map((proposal) => (
            <section
              key={proposal.id}
              className="flex flex-col gap-3 border-t border-border pt-5"
            >
              <h2 className="text-sm font-semibold">Roadmap proposal</h2>
              <p className="text-sm text-muted-foreground">
                {proposal.status === "pending"
                  ? "Review the evidence before creating a Linear issue."
                  : proposal.status === "approved"
                    ? "Issue created"
                    : "Dismissed"}
              </p>
              <div className="flex gap-2">
                {proposal.status === "pending" ? (
                  <>
                    <Button
                      label="Create issue"
                      variant="highlight"
                      onClick={() =>
                        onChange((current) => {
                          const tool = records.tools["tool-linear"];
                          if (
                            !tool?.isConnected ||
                            !tool.operations.some(
                              (operation) =>
                                operation.name === "create_issue" &&
                                operation.enabled
                            )
                          ) {
                            throw new Error(
                              "Connect Linear and enable create_issue before creating an issue."
                            );
                          }
                          return reviewProposal(current, proposal.id, true);
                        })
                      }
                    />
                    <Button
                      label="Dismiss"
                      variant="ghost"
                      onClick={() =>
                        onChange((current) =>
                          reviewProposal(current, proposal.id, false)
                        )
                      }
                    />
                  </>
                ) : (
                  proposal.issueId && (
                    <Button
                      label="Open issue"
                      variant="outline"
                      onClick={() =>
                        proposal.issueId && openFile(proposal.issueId)
                      }
                    />
                  )
                )}
              </div>
            </section>
          ))}
        {file.id === "tender-frame" && (
          <TenderReview
            file={file}
            state={state}
            onSave={(topic, answer, sourceId) =>
              setFiles((current) =>
                current.map((item) =>
                  item.id === file.id
                    ? {
                        ...item,
                        sourceIds: [
                          ...new Set([...(item.sourceIds ?? []), sourceId]),
                        ],
                        approvedAnswers: [
                          ...(item.approvedAnswers ?? []).filter(
                            (value) => value.topic !== topic
                          ),
                          { topic, answer, sourceId },
                        ],
                      }
                    : item
                )
              )
            }
          />
        )}
        {!detailsOnly && !!file.sourceIds?.length && (
          <section className="border-t border-border pt-5">
            <h2 className="mb-3 text-sm font-semibold">Sources</h2>
            <ContextItem.List>
              {file.sourceIds.map((id) => {
                const source = canonicalFile(files, id);
                return source ? (
                  <ResourceRow
                    key={id}
                    file={source}
                    onOpen={() => openFile(id)}
                  />
                ) : null;
              })}
            </ContextItem.List>
          </section>
        )}
      </div>
    </section>
  );
}

export function PodWorkspacePanels({
  view,
  state,
  onChange,
  records,
  setRecords,
  space,
  controls,
  onSend,
  onUpload,
  stagedUploads,
  onUploadTo,
}: {
  view: PodWorkspaceView;
  state: WorkspaceState;
  onChange: Change;
  records: WorkspaceRecords;
  setRecords: Dispatch<SetStateAction<WorkspaceRecords>>;
  space: Space | null;
  controls: PodWorkspacePanelControls;
  onSend: Send;
  onUpload: Upload;
  stagedUploads: { podId: string; files: File[] } | null;
  onUploadTo: (
    files: File[],
    location: WorkspaceLocation,
    podId?: string
  ) => Promise<void>;
}) {
  const files = state.files;
  switch (view.kind) {
    case "upload-location":
      return (
        <UploadLocationPicker
          state={state}
          onChange={onChange}
          initialLocation={{ scope: "My files", folderId: null }}
          uploads={
            stagedUploads?.podId === view.podId ? stagedUploads.files : []
          }
          onClose={controls.closePanel}
          onUpload={(location) =>
            onUploadTo(stagedUploads?.files ?? [], location, view.podId)
          }
        />
      );
    case "trigger-editor": {
      const file = files.find((entry) => entry.id === view.fileId);
      const podId = file?.trigger?.podId ?? space?.id;
      return podId ? (
        <TriggerEditor
          key={file?.id ?? "new"}
          state={state}
          podId={podId}
          file={file}
          onChange={onChange}
          onClose={controls.closePanel}
          onOpen={(next) => controls.openPanel(workspacePanel(next, files))}
        />
      ) : null;
    }
    case "context":
      if (!space && !view.containerId) {
        return null;
      }
      return (
        <ContextPicker
          files={files.filter((file) => file.id !== view.containerId)}
          linkedIds={
            new Set(
              view.containerId
                ? files
                    .filter((file) => file.parentId === view.containerId)
                    .map((file) => file.targetId ?? file.id)
                : state.configurations[space!.id].references.map(
                    (ref) => ref.fileId
                  )
            )
          }
          destination={view.containerId ? "conversation" : "pod"}
          onClose={controls.closePanel}
          onOpen={(fileId) => {
            const panel = workspacePanel({ kind: "file", fileId }, files);
            if (view.containerId) {
              controls.openPrimaryPanel(panel);
            } else {
              controls.openPanel(panel);
            }
          }}
          onAdd={(ids) => {
            const container = files.find(
              (file) => file.id === view.containerId
            );
            if (container) {
              onChange((current) =>
                transferFiles(
                  current,
                  ids,
                  { scope: container.scope, folderId: container.id },
                  "link"
                )
              );
              controls.replacePanel(
                workspacePanel(
                  { kind: "conversation-files", fileId: container.id },
                  files
                )
              );
            } else if (space) {
              onChange((current) => linkToPod(current, space.id, ids));
              controls.closePanel();
            }
          }}
        />
      );
    case "members":
      return space ? (
        <PanelContent
          label={`People in ${space.name}`}
          description="Pod membership doesn’t change access to linked files."
        >
          <div className="flex flex-col gap-5">
            {(podMembers[space.id] ?? []).map((name) => (
              <div key={name} className="flex items-center gap-3">
                <Avatar name={name} size="sm" isRounded />
                <span className="flex-1 text-sm">
                  {name}
                  {name === "Emma" ? " (you)" : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {name === "Emma" ? "Owner" : "Member"}
                </span>
              </div>
            ))}
          </div>
        </PanelContent>
      ) : null;
    case "conversation-files": {
      const conversation = canonicalFile(files, view.fileId);
      return conversation ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <WorkspaceFilesBrowser
            files={files}
            state={state}
            onChange={onChange}
            scope={conversation.scope}
            folderId={conversation.id}
            onOpen={(fileId) =>
              controls.openPrimaryPanel(
                workspacePanel({ kind: "file", fileId }, files)
              )
            }
            createAction={
              <Button
                label="Add files"
                variant="outline"
                onClick={() =>
                  controls.replacePanel(
                    workspacePanel(
                      {
                        kind: "context",
                        containerId: conversation.id,
                      },
                      files
                    )
                  )
                }
              />
            }
          />
        </div>
      ) : null;
    }
    case "file-details":
    case "file": {
      const file = canonicalFile(files, view.fileId);
      if (file?.kind === "conversation" && view.kind === "file") {
        let parent = file.parentId;
        const visited = new Set<string>();
        while (parent && !parent.startsWith("home:") && !visited.has(parent)) {
          visited.add(parent);
          parent = files.find((item) => item.id === parent)?.parentId;
        }
        const podId =
          state.runs.find((run) => run.conversationId === file.id)?.podId ??
          workspacePods.find((pod) => parent === `home:${pod.id}`)?.id ??
          workspacePods.find((pod) =>
            state.configurations[pod.id].references.some(
              (ref) => ref.fileId === file.id
            )
          )?.id ??
          space?.id ??
          "voice-of-customer";
        return (
          <WorkspaceConversation
            key={file.id}
            file={file}
            state={state}
            podId={podId}
            onOpen={(next) => controls.openPanel(workspacePanel(next, files))}
            onSend={(message) => {
              void onSend(podId, message, file.id);
            }}
          />
        );
      }
      if (file?.trigger) {
        return (
          <TriggerEditor
            key={file.id}
            state={state}
            podId={file.trigger.podId}
            file={file}
            onChange={onChange}
            onClose={controls.closePanel}
            onOpen={(next) => controls.openPanel(workspacePanel(next, files))}
          />
        );
      }
      return file ? (
        <FilePanel
          detailsOnly={view.kind === "file-details"}
          key={`${view.kind}:${file.id}`}
          file={file}
          state={state}
          onChange={onChange}
          records={records}
          setRecords={setRecords}
          space={space}
          controls={controls}
          onSend={onSend}
          onUpload={onUpload}
        />
      ) : (
        <PanelContent label="File unavailable">
          <p className="text-sm text-muted-foreground">
            The original is no longer available.
          </p>
        </PanelContent>
      );
    }
  }
}
