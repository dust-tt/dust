import type { ConversationSidePanelType } from "@app/types/conversation_side_panel";
import {
  AGENT_ACTIONS_SIDE_PANEL_TYPE,
  CREDITS_SIDE_PANEL_TYPE,
  FILE_PREVIEW_SIDE_PANEL_TYPE,
  FILES_SIDE_PANEL_TYPE,
  INTERACTIVE_CONTENT_SIDE_PANEL_TYPE,
  PLAN_SIDE_PANEL_TYPE,
  SKILL_SIDE_PANEL_TYPE,
} from "@app/types/conversation_side_panel";
import {
  assertNever,
  assertNeverAndIgnore,
} from "@app/types/shared/utils/assert_never";

export type OpenPanelParams =
  | {
      type: "actions";
      messageId: string;
      actionId?: string;
    }
  | {
      type: "interactive_content";
      fileId: string;
      timestamp?: string;
    }
  | {
      type: "file_preview";
      filePath: string;
    }
  | {
      type: "files";
    }
  | {
      type: "credits";
    }
  | {
      type: "plan";
    }
  | {
      type: "skill";
      skillId: string;
    };

// The `spid` hash value for a panel. Two panels are the same when type and key match.
export function panelDataKey(params: OpenPanelParams): string {
  switch (params.type) {
    case AGENT_ACTIONS_SIDE_PANEL_TYPE:
      return params.actionId
        ? `${params.messageId}@${params.actionId}`
        : params.messageId;
    case INTERACTIVE_CONTENT_SIDE_PANEL_TYPE:
      return params.timestamp
        ? `${params.fileId}@${params.timestamp}`
        : params.fileId;
    case FILE_PREVIEW_SIDE_PANEL_TYPE:
      return params.filePath;
    case FILES_SIDE_PANEL_TYPE:
    case CREDITS_SIDE_PANEL_TYPE:
    case PLAN_SIDE_PANEL_TYPE:
      return params.type;
    case SKILL_SIDE_PANEL_TYPE:
      return params.skillId;
    default:
      return assertNever(params);
  }
}

// What makes two panels "the same view" for history purposes. Unlike the hash key, a Frame's
// timestamp is ignored: streaming refreshes the same Frame with a new timestamp, and that must
// update the shown panel rather than stack a copy of it.
export function panelIdentityKey(params: OpenPanelParams): string {
  if (params.type === INTERACTIVE_CONTENT_SIDE_PANEL_TYPE) {
    return `${params.type}:${params.fileId}`;
  }
  return `${params.type}:${panelDataKey(params)}`;
}

// Inverse of panelDataKey, for panels restored from the URL hash (deep links, back/forward).
export function panelParamsFromHash(
  type: ConversationSidePanelType,
  data: string | undefined
): OpenPanelParams | null {
  if (!type || !data) {
    return null;
  }
  switch (type) {
    case AGENT_ACTIONS_SIDE_PANEL_TYPE: {
      const [messageId, actionId] = data.split("@");
      return { type, messageId, actionId };
    }
    case INTERACTIVE_CONTENT_SIDE_PANEL_TYPE: {
      const [fileId, timestamp] = data.split("@");
      return { type, fileId, timestamp };
    }
    case FILE_PREVIEW_SIDE_PANEL_TYPE:
      return { type, filePath: data };
    case FILES_SIDE_PANEL_TYPE:
    case CREDITS_SIDE_PANEL_TYPE:
    case PLAN_SIDE_PANEL_TYPE:
      return { type };
    case SKILL_SIDE_PANEL_TYPE:
      return { type, skillId: data };
    default:
      assertNeverAndIgnore(type);
      return null;
  }
}
