import { StagedFiles } from "./StagedFiles";
import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  ContextItem,
  Cube01,
  Icon,
  Plus,
  NavTabPill,
  Settings01,
  NavTabPillContent,
  NavTabPillList,
  NavTabPillTrigger,
  Upload01,
  Users01,
} from "@dust-tt/sparkle";
import { useRef, useState } from "react";

import type { Space } from "../../data/types";
import { ConversationListItem } from "../ConversationListItem";
import { mockUsers } from "../../data/users";
import { workspaceConversation } from "./WorkspaceConversation";
import { InputBar, type InputBarMessage } from "../InputBar";
import { FilePreviewPanel } from "../FilePreviewPanel";
import { PodTriggers } from "./PodTriggers";
import { podFileTabs } from "./fileTabs";
import {
  PodFileTabsSettings,
  fileTabIcon,
  tabDataSource,
} from "./PodFileTabsSettings";
import { podMembers } from "./fixtures";
import type { WorkspaceState } from "./engine";
import type { PodConfiguration, PodWorkspaceView } from "./model";
import { fileIcons, ResourceRow } from "./ResourceRow";
import { WorkspaceFilesBrowser } from "./WorkspaceFilesBrowser";

export function PodWorkspace({
  space,
  state,
  onOpenPanel,
  onConfigure,
  onSubmitMessage,
  onChange,
  onUpload,
  stagedUploads,
}: {
  space: Space;
  state: WorkspaceState;
  onOpenPanel: (view: PodWorkspaceView) => void;
  onConfigure: (configuration: PodConfiguration) => void;
  onSubmitMessage: (message: InputBarMessage) => void;
  onChange: (update: (state: WorkspaceState) => WorkspaceState) => void;
  onUpload: (files: File[]) => void;
  stagedUploads: File[];
}) {
  const fileTabs = podFileTabs(state, space.id);
  const [selectedTab, setTab] = useState(() =>
    fileTabs[0] ? `file:${fileTabs[0].fileId}` : "work"
  );
  const tab =
    selectedTab.startsWith("file:") &&
    !fileTabs.some((tab) => `file:${tab.fileId}` === selectedTab)
      ? "work"
      : selectedTab;
  const [draggingFiles, setDraggingFiles] = useState(false);
  const dragDepth = useRef(0);
  const uploadInput = useRef<HTMLInputElement>(null);
  const files = state.files;
  const configuration = state.configurations[space.id];
  const linkedIds = new Set(
    configuration.references.map((reference) => reference.fileId)
  );
  const linked = files.filter((file) => linkedIds.has(file.id));
  const conversations = linked
    .filter((file) => file.kind === "conversation")
    .reverse();
  const capabilities = linked.filter((file) =>
    ["agent", "skill", "tool"].includes(file.kind)
  );
  const defaultAgent = linked.find(
    (file) => file.id === configuration.defaultAgentId
  );
  const voc = space.id === "voice-of-customer";
  const inputs = linked.filter(
    (file) =>
      !["conversation", "agent", "skill", "tool", "trigger"].includes(
        file.kind
      ) && !file.id.startsWith("issue:")
  );
  const openFile = (fileId: string) => {
    if (files.some((file) => file.id === fileId)) {
      onOpenPanel({ kind: "file", fileId });
    }
  };

  return (
    <main className="@container flex min-h-0 flex-1 flex-col overflow-hidden text-foreground">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-6 py-8 @md:px-10 @lg:px-14">
          <header className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-highlight-200 bg-highlight-50 text-highlight-600 dark:bg-highlight-900 dark:text-highlight-300">
                  <Icon visual={Cube01} size="md" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {space.name}
                  </h1>
                </div>
              </div>
              <Button
                label={`${podMembers[space.id]?.length ?? 1} members`}
                icon={Users01}
                variant="ghost"
                onClick={() => onOpenPanel({ kind: "members" })}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                {space.description}
              </p>
            </div>
            <section
              aria-label="New conversation"
              className="flex w-full max-w-3xl flex-col gap-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <h2 className="font-medium">New conversation</h2>
                <label className="flex items-center gap-2 text-muted-foreground">
                  Share with
                  <select
                    aria-label="New conversation sharing"
                    className="min-w-28 rounded-md border border-border bg-background py-1 pl-2 pr-7 text-foreground"
                    value={configuration.audience}
                    onChange={(event) => {
                      const audience = event.target.value;
                      if (
                        audience === "private" ||
                        audience === "pod" ||
                        audience === "workspace"
                      ) {
                        onConfigure({ ...configuration, audience });
                      }
                    }}
                  >
                    <option value="private">Only me</option>
                    <option value="pod">Pod members</option>
                    <option value="workspace">Workspace</option>
                  </select>
                </label>
              </div>
              <InputBar
                placeholder={
                  voc
                    ? "Ask about a customer, topic, or source"
                    : "Work on the Northstar response"
                }
                isFloating={false}
                agentLabel={defaultAgent?.name ?? "Choose an agent"}
                onAgentClick={() => setTab("settings")}
                onSubmitMessage={onSubmitMessage}
              />
            </section>
          </header>
          <NavTabPill value={tab} onValueChange={setTab}>
            <NavTabPillList>
              {fileTabs.map((tab) => {
                const file = files.find((file) => file.id === tab.fileId);
                return (
                  file && (
                    <NavTabPillTrigger
                      key={file.id}
                      value={`file:${file.id}`}
                      icon={fileTabIcon(file, tab.icon)}
                    >
                      {tab.title}
                    </NavTabPillTrigger>
                  )
                );
              })}
              <NavTabPillTrigger value="sources" icon={fileIcons.folder}>
                Files
              </NavTabPillTrigger>
              <NavTabPillTrigger value="work" icon={fileIcons.conversation}>
                Conversations
              </NavTabPillTrigger>
              <NavTabPillTrigger value="settings" icon={Settings01}>
                Settings
              </NavTabPillTrigger>
            </NavTabPillList>
            {fileTabs.map((tab) => {
              const file = files.find((file) => file.id === tab.fileId);
              return (
                file && (
                  <NavTabPillContent key={file.id} value={`file:${file.id}`}>
                    {file.kind === "frame" ? (
                      <div className="mt-5 min-h-[620px] h-[calc(100dvh-340px)]">
                        <FilePreviewPanel
                          dataSource={tabDataSource(file)}
                          frameDocument={file.content}
                        />
                      </div>
                    ) : (
                      <article className="flex flex-col gap-5 py-7">
                        <div className="flex items-center justify-between gap-3">
                          <h2 className="text-xl font-semibold">{file.name}</h2>
                          <Button
                            label="Open file"
                            variant="outline"
                            onClick={() => openFile(file.id)}
                          />
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-7">
                          {file.content}
                        </p>
                      </article>
                    )}
                  </NavTabPillContent>
                )
              );
            })}
            <NavTabPillContent value="sources">
              <section
                aria-label="Files"
                className="relative min-h-80 pt-7"
                onDragEnter={(event) => {
                  if (event.dataTransfer.types.includes("Files")) {
                    event.preventDefault();
                    dragDepth.current += 1;
                    setDraggingFiles(true);
                  }
                }}
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes("Files")) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                  }
                }}
                onDragLeave={() => {
                  dragDepth.current = Math.max(0, dragDepth.current - 1);
                  if (!dragDepth.current) {
                    setDraggingFiles(false);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  dragDepth.current = 0;
                  setDraggingFiles(false);
                  if (event.dataTransfer.files.length) {
                    onUpload(Array.from(event.dataTransfer.files));
                  }
                }}
              >
                {draggingFiles && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-highlight-500 bg-background/95">
                    <p className="text-sm font-medium">
                      Drop files to add to Files
                    </p>
                  </div>
                )}
                <input
                  ref={uploadInput}
                  type="file"
                  multiple
                  className="hidden"
                  aria-label="Upload files"
                  onChange={(event) => {
                    const uploads = Array.from(event.target.files ?? []);
                    if (uploads.length) {
                      onUpload(uploads);
                    }
                    event.target.value = "";
                  }}
                />
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">Files</h2>
                  </div>
                </div>
                {!!stagedUploads.length && (
                  <div className="mb-5">
                    <StagedFiles
                      files={stagedUploads}
                      onCancel={() => onUpload([])}
                    >
                      <Button
                        label="Choose location"
                        variant="highlight"
                        onClick={() =>
                          onOpenPanel({
                            kind: "upload-location",
                            podId: space.id,
                          })
                        }
                      />
                    </StagedFiles>
                  </div>
                )}
                <WorkspaceFilesBrowser
                  files={files}
                  state={state}
                  onChange={onChange}
                  referenceIds={inputs.map((file) => file.id)}
                  onOpen={openFile}
                  createAction={
                    <div className="flex gap-2">
                      <Button
                        label="Upload files"
                        icon={Upload01}
                        variant="outline"
                        onClick={() => uploadInput.current?.click()}
                      />
                      <Button
                        label="Add files"
                        icon={Plus}
                        variant="outline"
                        onClick={() => onOpenPanel({ kind: "context" })}
                      />
                    </div>
                  }
                />
              </section>
            </NavTabPillContent>
            <NavTabPillContent value="work">
              <section className="pt-7">
                <h2 className="mb-4 text-base font-semibold">Conversations</h2>
                <div className="divide-y divide-border">
                  {conversations.map((file) => {
                    const conversation = workspaceConversation(
                      state,
                      file,
                      space.id
                    );
                    return (
                      <ConversationListItem
                        key={file.id}
                        unread={false}
                        conversation={{
                          ...conversation,
                          description: file.description,
                        }}
                        creator={mockUsers[0]}
                        time={conversation.updatedAt.toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                        onClick={() => openFile(file.id)}
                      />
                    );
                  })}
                </div>
              </section>
            </NavTabPillContent>
            <NavTabPillContent value="settings">
              <Tabs defaultValue="customization" className="max-w-3xl pt-7">
                <TabsList>
                  <TabsTrigger value="general" label="General" />
                  <TabsTrigger value="customization" label="Customization" />
                </TabsList>
                <TabsContent value="customization">
                  <div className="pt-7">
                    <PodFileTabsSettings
                      state={state}
                      podId={space.id}
                      onChange={onChange}
                      onOpen={openFile}
                    />
                  </div>
                </TabsContent>
                <TabsContent
                  value="general"
                  className="flex flex-col gap-7 pt-7"
                >
                  <PodTriggers
                    state={state}
                    podId={space.id}
                    onOpen={onOpenPanel}
                    onChange={onChange}
                  />
                  <section>
                    <h2 className="mb-3 text-base font-semibold">
                      Agents, skills, and tools
                    </h2>
                    <ContextItem.List>
                      {capabilities.map((file) => (
                        <ResourceRow
                          key={file.id}
                          file={file}
                          onOpen={() => openFile(file.id)}
                        />
                      ))}
                    </ContextItem.List>
                    <Button
                      label="Add a capability"
                      icon={Plus}
                      variant="outline"
                      onClick={() => onOpenPanel({ kind: "context" })}
                    />
                  </section>
                </TabsContent>
              </Tabs>
            </NavTabPillContent>
          </NavTabPill>
        </div>
      </div>
    </main>
  );
}
