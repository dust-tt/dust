import {
  Button,
  Chip,
  CloudArrowLeftRight,
  ContentMessage,
  ContentMessageAction,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Hoverable,
  Icon,
  InfoCircle,
  Lock01,
  MessageCircle01,
  RefreshCw02,
  UsersPlus,
} from "@dust-tt/sparkle";
import { useState } from "react";

import type { MockTool } from "../../data/build";

// The confirm dialogs and banners the builder raises around the form. Each
// one keeps the production copy verbatim.

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  confirmVariant?: "primary" | "warning" | "highlight";
  cancelLabel?: string;
  onConfirm: () => void;
  confirmDisabled?: boolean;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  confirmVariant = "primary",
  cancelLabel = "Cancel",
  onConfirm,
  confirmDisabled,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" isAlertDialog>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="text-sm text-foreground">{children}</div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: cancelLabel,
            variant: "outline",
            onClick: () => onOpenChange(false),
          }}
          rightButtonProps={{
            label: confirmLabel,
            variant: confirmVariant,
            disabled: confirmDisabled,
            onClick: () => {
              onConfirm();
              onOpenChange(false);
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function PendingSuggestionsDialog({
  open,
  onOpenChange,
  count,
  onSaveAnyway,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onSaveAnyway: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Pending suggestions"
      confirmLabel="Save anyway"
      cancelLabel="Go back"
      onConfirm={onSaveAnyway}
    >
      You have {count} pending instruction suggestion{count === 1 ? "" : "s"}{" "}
      that won’t be included in this save. You can review them later.
    </ConfirmDialog>
  );
}

export function DiscardChangesDialog({
  open,
  onOpenChange,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Discard your unsaved changes?"
      confirmLabel="Discard"
      confirmVariant="warning"
      cancelLabel="Keep editing"
      onConfirm={onDiscard}
    >
      If you leave now, your latest edits won’t be kept.
    </ConfirmDialog>
  );
}

export function AgentCreatedDialog({
  open,
  onOpenChange,
  agentName,
  onStartChat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentName: string;
  onStartChat: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Agent {agentName} created!</DialogTitle>
          <DialogDescription>
            You can now use {agentName} in conversations. Start a chat or keep
            editing this agent.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter
          leftButtonProps={{
            label: "Keep editing",
            variant: "outline",
            onClick: () => onOpenChange(false),
          }}
          rightButtonProps={{
            label: "Start chat",
            variant: "primary",
            icon: MessageCircle01,
            onClick: () => {
              onStartChat();
              onOpenChange(false);
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function PersonalConnectionRequiredDialog({
  open,
  onOpenChange,
  tools,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tools: MockTool[];
  onSave: () => void;
}) {
  const [connectedIds, setConnectedIds] = useState<Set<string>>(
    () => new Set()
  );
  const missing = tools.filter((tool) => !connectedIds.has(tool.id)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" isAlertDialog>
        <DialogHeader>
          <DialogTitle>Connection(s) required for personal tools</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-4">
            <ContentMessage
              title="About personal tools"
              variant="highlight"
              icon={Lock01}
              size="lg"
            >
              Personal tools act on your behalf with your own account. Each
              member connects their account the first time they use the agent.{" "}
              <Hoverable
                variant="highlight"
                href="https://docs.dust.tt"
                target="_blank"
              >
                Learn more
              </Hoverable>
            </ContentMessage>
            <div className="flex flex-col divide-y divide-border">
              {tools.map((tool) => {
                const isConnected = connectedIds.has(tool.id);
                return (
                  <div
                    key={tool.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Icon visual={tool.icon} size="sm" />
                      <span className="text-sm font-medium text-foreground">
                        {tool.name}
                      </span>
                    </div>
                    {isConnected ? (
                      <Chip size="xs" color="success" label="Connected" />
                    ) : (
                      <Button
                        size="xs"
                        variant="outline"
                        icon={CloudArrowLeftRight}
                        label="Connect"
                        onClick={() =>
                          setConnectedIds((prev) => new Set(prev).add(tool.id))
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {missing} connection{missing === 1 ? " is" : "s are"} required. If
              you proceed without connecting, the agent will ask for the
              connection the first time it needs the tool.
            </p>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: () => onOpenChange(false),
          }}
          rightButtonProps={{
            label: "Save",
            variant: missing > 0 ? "warning" : "primary",
            onClick: () => {
              onSave();
              onOpenChange(false);
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function EditorGateMessage({
  isBecoming,
  onBecomeEditor,
}: {
  isBecoming: boolean;
  onBecomeEditor: () => void;
}) {
  return (
    <ContentMessage
      title="You are not an editor of this agent"
      variant="golden"
      icon={InfoCircle}
      size="lg"
      action={
        <ContentMessageAction
          icon={UsersPlus}
          variant="primary"
          label={isBecoming ? "Becoming an editor…" : "Become an editor"}
          isLoading={isBecoming}
          onClick={onBecomeEditor}
        />
      }
    >
      You can view this agent as a workspace admin. Become an editor to save
      changes.
    </ContentMessage>
  );
}

export function EditorLoadErrorMessage({ onRetry }: { onRetry: () => void }) {
  return (
    <ContentMessage
      title="Unable to verify editor access"
      variant="warning"
      icon={InfoCircle}
      size="lg"
      action={
        <ContentMessageAction
          icon={RefreshCw02}
          label="Retry"
          onClick={onRetry}
        />
      }
    >
      We could not load the agent editors. Retry before making changes.
    </ContentMessage>
  );
}

export function ModelsLoadErrorMessage({ onRetry }: { onRetry: () => void }) {
  return (
    <ContentMessage
      title="Unable to load models"
      variant="warning"
      icon={InfoCircle}
      size="lg"
      action={
        <ContentMessageAction
          icon={RefreshCw02}
          label="Retry"
          onClick={onRetry}
        />
      }
    >
      We could not determine the default model for this agent. Please try again.
    </ContentMessage>
  );
}
