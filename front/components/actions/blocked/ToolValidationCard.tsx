import {
  Avatar,
  Button,
  Card,
  Check,
  CheckDouble,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  PieChart01,
  XClose,
} from "@dust-tt/sparkle";
import type React from "react";
import { useState } from "react";

export type ToolValidationDecision =
  | "approved"
  | "rejected"
  | "always_approved";

export interface ToolValidationProgress {
  current: number;
  total: number;
}

export interface ToolValidationCardProps {
  title: string;
  description: React.ReactNode;
  icon?: React.ComponentProps<typeof Avatar>["icon"];
  approvalProgress?: ToolValidationProgress;
  canRespond: boolean;
  triggeringUserName?: string;
  details?: React.ReactNode;
  detailsDefaultOpen?: boolean;
  errorMessage?: string | null;
  isValidating?: boolean;
  isPulsing?: boolean;
  canAlwaysAllow?: boolean;
  alwaysAllowTooltip?: string;
  approveLabel?: string;
  onValidate: (decision: ToolValidationDecision) => Promise<unknown>;
}

function ApprovalProgress({ current, total }: ToolValidationProgress) {
  if (total <= 1) {
    return null;
  }

  return (
    <div className="heading-xs shrink-0 text-muted-foreground">
      <span className="sr-only">
        Approval {current} of {total}
      </span>
      <span aria-hidden="true">
        {current}/{total}
      </span>
    </div>
  );
}

interface ToolValidationDetailsDialogProps {
  title: string;
  description: React.ReactNode;
  icon: NonNullable<ToolValidationCardProps["icon"]>;
  details: React.ReactNode;
  defaultOpen: boolean;
  isSubmitting: boolean;
}

function ToolValidationDetailsDialog({
  title,
  description,
  icon,
  details,
  defaultOpen,
  isSubmitting,
}: ToolValidationDetailsDialogProps) {
  return (
    <Dialog defaultOpen={defaultOpen}>
      <DialogTrigger asChild>
        <Button
          label="Review details"
          variant="ghost"
          size="sm"
          className="min-h-11 sm:min-h-0"
          disabled={isSubmitting}
        />
      </DialogTrigger>
      <DialogContent
        size="lg"
        className="gap-4 p-5"
        preventAutoFocusOnClose={false}
      >
        <DialogHeader className="gap-1 p-0">
          <DialogTitle visual={<Avatar icon={icon} size="sm" />}>
            {title}
          </DialogTitle>
          <DialogDescription className="pl-11">{description}</DialogDescription>
        </DialogHeader>
        <DialogContainer className="p-0">{details}</DialogContainer>
      </DialogContent>
    </Dialog>
  );
}

export function ToolValidationCard({
  title,
  description,
  icon = PieChart01,
  approvalProgress,
  canRespond,
  triggeringUserName,
  details,
  detailsDefaultOpen = false,
  errorMessage,
  isValidating = false,
  isPulsing = false,
  canAlwaysAllow = false,
  alwaysAllowTooltip,
  approveLabel = "Allow",
  onValidate,
}: ToolValidationCardProps) {
  const [submittingDecision, setSubmittingDecision] =
    useState<ToolValidationDecision | null>(null);
  const isSubmitting = isValidating || submittingDecision !== null;

  const handleValidation = async (decision: ToolValidationDecision) => {
    setSubmittingDecision(decision);
    try {
      await onValidate(decision);
    } finally {
      setSubmittingDecision(null);
    }
  };

  return (
    <Card
      variant="secondary"
      containerClassName="w-full max-w-xl"
      className="flex flex-col gap-4 shadow"
      isPulsing={isPulsing}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar icon={icon} size="sm" />
          <div className="heading-base min-w-0">{title}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {approvalProgress && <ApprovalProgress {...approvalProgress} />}
          {canRespond && details && (
            <ToolValidationDetailsDialog
              title={title}
              description={description}
              icon={icon}
              details={details}
              defaultOpen={detailsDefaultOpen}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      </div>

      <div className="text-base text-muted-foreground">{description}</div>

      {canRespond ? (
        <>
          {errorMessage && (
            <div className="text-sm font-medium text-warning-800">
              {errorMessage}
            </div>
          )}
        </>
      ) : (
        <div className="text-sm text-muted-foreground">
          Waiting for{" "}
          <span className="font-semibold text-foreground">
            {triggeringUserName}
          </span>{" "}
          to confirm.
        </div>
      )}

      {canRespond && (
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            label="Decline"
            variant="outline"
            icon={XClose}
            disabled={isSubmitting}
            isLoading={submittingDecision === "rejected"}
            onClick={() => void handleValidation("rejected")}
          />
          {canAlwaysAllow && (
            <Button
              label="Always allow"
              variant="outline"
              icon={CheckDouble}
              tooltip={alwaysAllowTooltip}
              disabled={isSubmitting}
              isLoading={submittingDecision === "always_approved"}
              onClick={() => void handleValidation("always_approved")}
            />
          )}
          <Button
            label={canAlwaysAllow ? `${approveLabel} once` : approveLabel}
            variant="highlight"
            icon={Check}
            disabled={isSubmitting}
            isLoading={submittingDecision === "approved"}
            onClick={() => void handleValidation("approved")}
          />
        </div>
      )}
    </Card>
  );
}
