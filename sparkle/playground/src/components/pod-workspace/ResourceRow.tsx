import {
  ActionFrame,
  ArrowUpRight,
  ContextItem,
  File02,
  Folder,
  Icon,
  MessageChatSquare,
  PuzzlePiece01,
  Robot,
  Zap,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";

import type { FileKind, WorkspaceFile } from "./model";

export const fileIcons = {
  document: File02,
  folder: Folder,
  conversation: MessageChatSquare,
  agent: Robot,
  skill: PuzzlePiece01,
  tool: Zap,
  frame: ActionFrame,
  link: ArrowUpRight,
  recording: MessageChatSquare,
  email: File02,
  trigger: Zap,
} satisfies Record<FileKind, typeof File02>;

export function ResourceRow({
  file,
  onOpen,
  description,
  action,
}: {
  file: WorkspaceFile;
  onOpen: () => void;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <ContextItem
      title={file.name}
      visual={
        <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted-background text-muted-foreground">
          <Icon visual={fileIcons[file.kind]} size="sm" />
        </div>
      }
      onClick={onOpen}
      hasSeparator={false}
      action={
        action ?? (
          <Icon
            visual={ArrowUpRight}
            size="xs"
            className="text-muted-foreground"
          />
        )
      }
    >
      <ContextItem.Description description={description ?? file.description} />
    </ContextItem>
  );
}
