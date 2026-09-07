// This defines the commands that the iframe can send to the host window.

// Define parameter types for each command.

interface GetFileParams {
  fileId: string;
}

interface CallFunctionParams {
  functionIdOrSlug: string;
  input?: unknown;
}

export interface WorkspaceUserIdentity {
  sId: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  image: string | null;
}

export type UserIdentityState =
  | {
      isAuthenticated: true;
      isWorkspaceMember: true;
      // Whether the viewer is an editor of the Pod hosting the Frame. Display-only: functions
      // resolve the caller server-side, never from what the Frame sends.
      isPodEditor: boolean;
      // Whether the viewer belongs to one of the Pod's groups (member or editor). Display-only,
      // like isPodEditor: gate what the Frame shows, never what the server allows.
      isPodMember: boolean;
      // Whether the viewer can modify the source files backing this Frame v2. Display-only: use
      // frame_author_required to enforce the same capability on a server-side function.
      isFrameAuthor: boolean;
      user: WorkspaceUserIdentity;
    }
  | {
      isAuthenticated: false;
      isWorkspaceMember: false;
      isPodEditor: false;
      isPodMember: false;
      isFrameAuthor: false;
      user: null;
    };

interface SetContentHeightParams {
  height: number;
}

interface DownloadFileRequestParams {
  blob: Blob;
  filename?: string;
}

interface SetErrorMessageParams {
  errorMessage: string;
  fileId: string;
  isInteractiveContent: boolean;
}

interface EditTextParams {
  oldText: string;
  newText: string;
  targetFileId?: string;
  // Clicked element's `data-source` ("<relPath>:<line>:<col>") for location-based edits on a
  // published (bundled) Frame. When set, oldText/newText are the visible (trimmed) text.
  source?: string;
}

// Define a mapped type to extend the base with specific parameters.
export type VisualizationRPCRequestMap = {
  callFunction: CallFunctionParams;
  getUserIdentity: null;
  getFile: GetFileParams;
  getCodeToExecute: null;
  setContentHeight: SetContentHeightParams;
  setErrorMessage: SetErrorMessageParams;
  downloadFileRequest: DownloadFileRequestParams;
  displayCode: null;
  editText: EditTextParams;
};

// Derive the command type from the keys of the request map
export type VisualizationRPCCommand = keyof VisualizationRPCRequestMap;

// Command results.

export interface CommandResultMap {
  callFunction: unknown;
  getUserIdentity: UserIdentityState;
  getCodeToExecute: { code: string };
  getFile: { fileBlob: Blob | null };
  downloadFileRequest: { blob: Blob; filename?: string };
  setContentHeight: void;
  setErrorMessage: void;
  displayCode: void;
  editText: { success: boolean; error?: string };
}

export function isDevelopment() {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.IS_DEVELOPMENT === "true"
  );
}
