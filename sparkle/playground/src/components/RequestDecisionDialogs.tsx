import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  TextArea,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { formatCredits } from "./RequestPayload";

/** Every decision goes through a dialog, so nothing is applied on a stray click. */

export function ApproveDialog({
  isOpen,
  title,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  /** The request's title, so the admin sees what they are applying. */
  title: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Approve "{title}"?</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          This applies the change in Dust and records you as the decision maker.
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Approve",
            variant: "highlight",
            onClick: onConfirm,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function DeclineDialog({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (message?: string) => void;
}) {
  const [message, setMessage] = useState("");

  const handleClose = () => {
    setMessage("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Are you sure you want to decline?</DialogTitle>
        </DialogHeader>
        <DialogContainer className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            The requester is told their request was declined. Adding a reason
            saves them from asking why.
          </p>
          <TextArea
            placeholder="Why are you declining? (optional)"
            value={message}
            minRows={3}
            resize="vertical"
            onChange={(event) => setMessage(event.target.value)}
          />
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: handleClose,
          }}
          rightButtonProps={{
            label: "Decline",
            variant: "warning",
            onClick: () => {
              onConfirm(message.trim() || undefined);
              setMessage("");
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function SetLimitDialog({
  isOpen,
  memberName,
  currentLimit,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  memberName: string;
  currentLimit: number;
  onClose: () => void;
  onConfirm: (limit: number) => void;
}) {
  const [limit, setLimit] = useState(String(currentLimit));

  const parsed = Number(limit);
  const isValid = Number.isFinite(parsed) && parsed > 0;

  const handleClose = () => {
    setLimit(String(currentLimit));
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Set a new limit for {memberName}</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <Input
            label="Personal limit"
            type="number"
            value={limit}
            suffix="credits/month"
            isUnit
            autoFocus
            onChange={(event) => setLimit(event.target.value)}
          />
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: handleClose,
          }}
          rightButtonProps={{
            label: "Validate",
            variant: "highlight",
            disabled: !isValid,
            onClick: () => isValid && onConfirm(parsed),
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function UpdateSeatDialog({
  isOpen,
  memberName,
  currentSeatLabel,
  nextSeatLabel,
  currentLimit,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  memberName: string;
  currentSeatLabel: string;
  nextSeatLabel: string;
  currentLimit: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            Move {memberName} to a {nextSeatLabel} seat?
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          {memberName} is on a {currentSeatLabel} seat, capped at{" "}
          {formatCredits(currentLimit)} credits/month. A {nextSeatLabel} seat
          comes with a larger allowance and is billed to the workspace.
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: `Move to ${nextSeatLabel}`,
            variant: "highlight",
            onClick: onConfirm,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
