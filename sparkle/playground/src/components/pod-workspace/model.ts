import type { PanelSizingType } from "../PanelLayout";

export type PodWorkspaceView =
  | { kind: "upload-location"; podId: string }
  | { kind: "file" | "file-details" | "conversation-files"; fileId: string }
  | { kind: "context"; containerId?: string }
  | { kind: "members" }
  | { kind: "trigger-editor"; fileId?: string };

export type PodWorkspacePanel = {
  view: PodWorkspaceView;
  label: string;
  sizingType: PanelSizingType;
  fullscreenEnabled: boolean;
};

export type PodWorkspacePanelControls = {
  openPanel: (panel: PodWorkspacePanel) => void;
  openPrimaryPanel: (panel: PodWorkspacePanel) => void;
  replacePanel: (panel: PodWorkspacePanel) => void;
  closePanel: () => void;
};

export function workspacePanel(
  view: PodWorkspaceView,
  files: WorkspaceFile[]
): PodWorkspacePanel {
  switch (view.kind) {
    case "file":
    case "file-details":
    case "conversation-files": {
      const file = files.find((entry) => entry.id === view.fileId);
      return {
        view,
        label:
          view.kind === "conversation-files"
            ? "Files"
            : view.kind === "file-details"
              ? "Location and sharing"
              : (file?.name ?? "File"),
        sizingType: view.kind === "file" ? "default" : "shared",
        fullscreenEnabled: view.kind === "file" && file?.kind === "frame",
      };
    }
    case "trigger-editor":
      return {
        view,
        label: view.fileId ? "Edit trigger" : "New trigger",
        sizingType: "shared",
        fullscreenEnabled: false,
      };
    case "upload-location":
      return {
        view,
        label: "Choose location",
        sizingType: "shared",
        fullscreenEnabled: false,
      };
    case "context":
      return {
        view,
        label: "Add files",
        sizingType: "shared",
        fullscreenEnabled: false,
      };
    case "members":
      return {
        view,
        label: "Members",
        sizingType: "secondary",
        fullscreenEnabled: false,
      };
  }
}

export type FileKind =
  | "document"
  | "folder"
  | "conversation"
  | "agent"
  | "skill"
  | "tool"
  | "frame"
  | "link"
  | "recording"
  | "email"
  | "trigger";
export type FileScope = "My files" | "Workspace files" | "Shared with me";
export type WorkspaceLocation = { scope: FileScope; folderId: string | null };

export type TriggerDefinition = {
  podId: string;
  enabled: boolean;
  kind: "event" | "schedule";
  agentId: string;
  prompt: string;
  folderId: string;
  cadence: "daily" | "weekly";
  time: string;
  timezone: string;
};

export type FileRole = "viewer" | "commenter" | "editor" | "none";
export type FilePermissions = {
  inherit: boolean;
  entries: { principal: string; role: FileRole }[];
};

export type WorkspaceFile = {
  permissions?: FilePermissions;
  updatedBy?: string;
  updatedAt?: string;
  trigger?: TriggerDefinition;
  fixedLocation?: boolean;
  approvedAnswers?: { topic: string; answer: string; sourceId: string }[];
  recordId?: string;
  targetId?: string;
  sourceIds?: string[];
  mediaUrl?: string;
  downloadUrl?: string;
  revision?: number;
  signals?: { topic: string; quote: string; account: string }[];
  id: string;
  name: string;
  kind: FileKind;
  scope: FileScope;
  location: string;
  description: string;
  content: string;
  access: "company" | "private" | "limited";
  sharedWith: string[];
  canShare: boolean;
  parentId?: string;
};

export type PodReference = {
  fileId: string;
  role: "Reference" | "Always apply" | "Available";
};
export type PodFileTab = {
  fileId: string;
  title: string;
  icon?: string;
};

export type PodConfiguration = {
  fileTabs?: PodFileTab[];
  references: PodReference[];
  instructions: string;
  defaultAgentId: string;
  confirmActions: boolean;
  audience: "private" | "pod" | "workspace";
  triggerEnabled: boolean;
};

export {
  workspacePods,
  createWorkspaceFiles,
  createPodConfiguration,
} from "./fixtures";

export function accessLabel(file: WorkspaceFile, podId?: string): string {
  if (file.access === "company") {
    return "Everyone in the workspace";
  }
  if (podId && file.sharedWith.includes(podId)) {
    return "Everyone in this pod";
  }
  if (file.sharedWith.length) {
    return "Shared with selected people";
  }
  return file.access === "private" ? "Only you" : "Shared with you";
}

export function isContainer(file: WorkspaceFile): boolean {
  return file.kind === "folder" || file.kind === "conversation";
}
