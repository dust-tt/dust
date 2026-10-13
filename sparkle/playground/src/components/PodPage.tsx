import {
  ArrowDown,
  ArrowUp,
  Avatar,
  Brackets,
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbItem,
  BreadcrumbPage,
  Button,
  CheckCircle,
  CheckDone01,
  Clock,
  CloudArrowLeftRight,
  DotsHorizontal,
  Download01,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Edit04,
  Folder,
  GooglePdfLogo,
  Icon,
  Image01,
  LayoutAlt02,
  List,
  MessageChatSquare,
  NavTabPill,
  NavTabPillContent,
  NavTabPillList,
  NavTabPillTrigger,
  Plus,
  ScrollArea,
  SearchInput,
  Settings01,
  Table,
  Trash01,
  UploadCloud02,
  XClose,
} from "@dust-tt/sparkle";
import { type ComponentType, useState } from "react";

import { mockUsers } from "../data";

// Production's Pod page (front: PodPage, PodHeaderActions, PodFilesTab,
// FileExplorer): tabs, members, and the Pod's files. Mock files; a markdown
// file opens with `onOpenFile`.

export interface PodFile {
  /** Path in the Pod, folders included ("Research/Survey.pdf"). */
  path: string;
  contentType: string;
  modifiedAt: Date;
}

const MEMBERS = [0, 1, 3, 5, 6, 8].map((i) => mockUsers[i]);

/** Production's file icons (lib/file_icon_utils.ts). */
function fileIcon(file: PodFile): ComponentType {
  if (file.path.endsWith(".md")) {
    return Brackets;
  }
  if (file.contentType === "application/pdf") {
    return GooglePdfLogo;
  }
  if (file.contentType === "text/csv") {
    return Table;
  }
  if (file.contentType.startsWith("image/")) {
    return Image01;
  }
  return Brackets;
}

function fileType(file: PodFile): string {
  if (file.contentType === "application/pdf") {
    return "PDF";
  }
  if (file.contentType === "text/csv") {
    return "Table";
  }
  if (file.contentType.startsWith("image/")) {
    return "Image";
  }
  return "Document";
}

function relativeTime(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 60) {
    return minutes <= 1 ? "just now" : `${minutes} minutes ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

const fileName = (path: string) => path.split("/").pop() ?? path;

type Entry =
  | { kind: "folder"; name: string; count: number }
  | { kind: "file"; file: PodFile };

/** The folders and files directly in `folder` ("" for the root). */
function entriesIn(files: PodFile[], folder: string): Entry[] {
  const prefix = folder ? `${folder}/` : "";
  const folders = new Map<string, number>();
  const entries: Entry[] = [];
  for (const file of files) {
    if (!file.path.startsWith(prefix)) {
      continue;
    }
    const rest = file.path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) {
      entries.push({ kind: "file", file });
    } else {
      const name = rest.slice(0, slash);
      folders.set(name, (folders.get(name) ?? 0) + 1);
    }
  }
  return [
    ...[...folders].map(
      ([name, count]): Entry => ({ kind: "folder", name, count })
    ),
    ...entries,
  ];
}

function RowMenu({ isFolder }: { isFolder: boolean }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          icon={DotsHorizontal}
          aria-label="File options"
          onClick={(e) => e.stopPropagation()}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem label="Download" icon={Download01} />
        {!isFolder && (
          <DropdownMenuItem label="Add as Pod tab" icon={LayoutAlt02} />
        )}
        <DropdownMenuItem label="Rename" icon={Edit04} />
        <DropdownMenuItem label="Delete" icon={Trash01} variant="warning" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PodFiles({
  files,
  onOpenFile,
}: {
  files: PodFile[];
  onOpenFile: (file: PodFile) => void;
}) {
  const [folder, setFolder] = useState("");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const entries = query
    ? files
        .filter((f) => fileName(f.path).toLowerCase().includes(query))
        .map((file): Entry => ({ kind: "file", file }))
    : entriesIn(files, folder);
  const sorted = [...entries].sort((a, b) =>
    a.kind === "folder" || b.kind === "folder"
      ? Number(b.kind === "folder") - Number(a.kind === "folder")
      : b.file.modifiedAt.getTime() - a.file.modifiedAt.getTime()
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden px-6 py-8">
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-5">
        <div className="px-4 pt-5">
          <Breadcrumb>
            {folder ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbButton
                    label="All files"
                    variant="outline"
                    onClick={() => setFolder("")}
                  />
                </BreadcrumbItem>
                <span className="select-none px-0.5 text-sm text-muted-foreground">
                  /
                </span>
                <BreadcrumbItem>
                  <BreadcrumbPage>{folder}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbPage>All files</BreadcrumbPage>
              </BreadcrumbItem>
            )}
          </Breadcrumb>
        </div>
        <div className="flex shrink-0 items-center gap-2 px-4">
          <SearchInput
            name="file-explorer-search"
            placeholder="Search files"
            value={search}
            onChange={setSearch}
            className="flex-1"
          />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                icon={CheckDone01}
                tooltip="Layout"
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem label="Grid" />
              <DropdownMenuItem label="List" icon={List} />
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                icon={Clock}
                label="Last modified"
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem label="Last modified" icon={Clock} />
              <DropdownMenuItem label="Name A → Z" icon={ArrowDown} />
              <DropdownMenuItem label="Name Z → A" icon={ArrowUp} />
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button label="Add" isSelect variant="highlight" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                label="From Company Data"
                icon={CloudArrowLeftRight}
              />
              <DropdownMenuItem label="New folder" icon={Folder} />
              <DropdownMenuItem label="Upload file" icon={UploadCloud02} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-0.5 px-4 pb-4">
            {sorted.map((entry) => {
              const isFolder = entry.kind === "folder";
              const name = isFolder ? entry.name : fileName(entry.file.path);
              return (
                <div
                  key={isFolder ? `folder:${entry.name}` : entry.file.path}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    isFolder
                      ? setFolder(
                          folder ? `${folder}/${entry.name}` : entry.name
                        )
                      : onOpenFile(entry.file)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isFolder) {
                      onOpenFile(entry.file);
                    }
                  }}
                  className="flex cursor-pointer items-center gap-4 rounded-xl px-3 py-2 hover:bg-muted-background"
                >
                  <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                    <Icon
                      visual={isFolder ? Folder : fileIcon(entry.file)}
                      size="sm"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={
                        isFolder
                          ? "truncate text-sm font-semibold leading-5 text-foreground"
                          : "truncate text-sm leading-5 text-foreground"
                      }
                    >
                      {name}
                    </span>
                    <span className="text-xs font-normal leading-4 text-muted-foreground">
                      {isFolder
                        ? `${entry.count} ${entry.count === 1 ? "item" : "items"}`
                        : `${fileType(entry.file)} - ${relativeTime(entry.file.modifiedAt)}`}
                    </span>
                  </div>
                  <RowMenu isFolder={isFolder} />
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function PodPage({
  files,
  onOpenFile,
}: {
  files: PodFile[];
  onOpenFile: (file: PodFile) => void;
}) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <NavTabPill
        className="flex min-h-0 flex-1 flex-col overflow-hidden pt-2"
        defaultValue="files"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-separator px-2 pb-2">
          <NavTabPillList>
            <NavTabPillTrigger value="conversations" icon={MessageChatSquare}>
              Conversations
            </NavTabPillTrigger>
            <NavTabPillTrigger value="files" icon={Folder}>
              Files
            </NavTabPillTrigger>
            <NavTabPillTrigger value="tasks" icon={CheckCircle}>
              Tasks
            </NavTabPillTrigger>
            <Button
              size="xs"
              variant="ghost"
              icon={Plus}
              tooltip="Add file to Tabs"
            />
            <NavTabPillTrigger value="settings" icon={Settings01}>
              Settings
            </NavTabPillTrigger>
          </NavTabPillList>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex md:h-9 md:items-center">
              <Avatar.Stack
                avatars={MEMBERS.map((m) => ({
                  name: m.fullName,
                  visual: m.portrait,
                  isRounded: true,
                }))}
                nbVisibleItems={5}
                size="sm"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  icon={DotsHorizontal}
                  variant="ghost"
                  size="sm"
                  tooltip="Pod options"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent collisionPadding={8}>
                <DropdownMenuItem label="Leave the Pod" icon={XClose} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <NavTabPillContent value="conversations">
          <Placeholder label="The Pod's conversations." />
        </NavTabPillContent>
        <NavTabPillContent value="files">
          <PodFiles files={files} onOpenFile={onOpenFile} />
        </NavTabPillContent>
        <NavTabPillContent value="tasks">
          <Placeholder label="The Pod's tasks." />
        </NavTabPillContent>
        <NavTabPillContent value="settings">
          <Placeholder label="The Pod's settings." />
        </NavTabPillContent>
      </NavTabPill>
    </div>
  );
}
