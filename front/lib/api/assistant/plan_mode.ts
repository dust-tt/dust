import { PLAN_FILE_NAME } from "@app/lib/api/actions/servers/plan_mode/metadata";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { SCOPED_PREFIX_CONVERSATION } from "@app/lib/api/file_system/types";
import { writeToConversationFolder } from "@app/lib/api/files/action_output_fs";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLock } from "@app/lib/lock";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { Err, Ok, type Result } from "@app/types/shared/result";

// Plan mode has no database model: all state is derived from the conversation file system.
const ARCHIVED_PLANS_DIR = "archived_plans";

function planPath(conversation: ConversationWithoutContentType): string {
  return `${SCOPED_PREFIX_CONVERSATION}${conversation.sId}/${PLAN_FILE_NAME}`;
}

function archivedPlansDir(
  conversation: ConversationWithoutContentType
): string {
  return `${SCOPED_PREFIX_CONVERSATION}${conversation.sId}/${ARCHIVED_PLANS_DIR}`;
}

// One plan per conversation: a conversation-scoped lock serializes create/edit/close.
export async function withPlanModeLock<T>(
  conversationId: string,
  fn: () => Promise<T>
): Promise<T> {
  return executeWithLock(`plan_mode:${conversationId}`, fn);
}

// Read the active plan's markdown. Ok(null) when there is no active plan; Err only on a real read
// failure, so callers can tell "no plan" apart from "failed to read".
export async function getActivePlanContent(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<Result<string | null, Error>> {
  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return new Err(new Error(fsResult.error.message));
  }

  const bufferResult = await fsResult.value.readBuffer(planPath(conversation));
  if (bufferResult.isErr()) {
    return new Err(new Error(bufferResult.error.message));
  }

  return new Ok(
    bufferResult.value ? bufferResult.value.toString("utf8") : null
  );
}

// Shared by create_plan and edit_plan; the "is there already an active plan" guard lives in the
// handlers.
export async function writePlanContent(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  content: string
): Promise<Result<void, Error>> {
  const writeResult = await writeToConversationFolder(auth, conversation, {
    content,
    contentType: "text/markdown",
    fileName: PLAN_FILE_NAME,
  });
  if (writeResult.isErr()) {
    return new Err(new Error(writeResult.error.message));
  }

  return new Ok(undefined);
}

export async function closePlan(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<Result<void, Error>> {
  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return new Err(new Error(fsResult.error.message));
  }
  const fs = fsResult.value;

  const listResult = await fs.list(archivedPlansDir(conversation));
  if (listResult.isErr()) {
    return new Err(new Error(listResult.error.message));
  }

  // Next index = max existing `plan-{n}.md` + 1 (robust to gaps). Empty folder => 1.
  const maxIndex = listResult.value.reduce((max, entry) => {
    const match = entry.isDirectory
      ? null
      : entry.fileName.match(/^plan-(\d+)\.md$/);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);

  const dest = `${archivedPlansDir(conversation)}/plan-${maxIndex + 1}.md`;
  const moveResult = await fs.move({ src: planPath(conversation), dest });
  if (moveResult.isErr()) {
    return new Err(new Error(moveResult.error.message));
  }

  return new Ok(undefined);
}
