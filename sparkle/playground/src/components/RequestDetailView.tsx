import { Avatar, Button, Chip, Separator } from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import { useState } from "react";

import {
  getBeneficiary,
  getRequestTypeIcon,
  getResolverLabel,
  REQUEST_OUTCOME_LABELS,
  REQUEST_TYPE_LABELS,
  SEAT_TYPE_LABELS,
  SEAT_UPGRADE_TARGET,
} from "../data/requests";
import type { AdminRequest, RequestOutcome } from "../data/types";
import { getUserById } from "../data/users";
import {
  ApproveDialog,
  DeclineDialog,
  SetLimitDialog,
  UpdateSeatDialog,
} from "./RequestDecisionDialogs";
import { formatCredits, RequestPayload } from "./RequestPayload";

interface RequestDetailViewProps {
  request: AdminRequest;
  currentUserId?: string;
  /**
   * `note` says what the admin did on the types they act on, or why they
   * declined.
   */
  onResolve?: (
    requestId: string,
    outcome: RequestOutcome,
    note?: string
  ) => void;
}

type OpenDialog = "approve" | "decline" | "limit" | "seat" | null;

function formatFullDate(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * A single request: who asked, what they are asking for, and the decision.
 * Credit management is the one type with no plain Approve — the admin picks
 * how to react, and the action they take is what gets recorded.
 */
export function RequestDetailView({
  request,
  currentUserId,
  onResolve,
}: RequestDetailViewProps) {
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);

  const requester = getUserById(request.requesterId);
  const beneficiary = getBeneficiary(request);
  const resolver = request.resolvedByUserId
    ? getUserById(request.resolvedByUserId)
    : undefined;
  const isPending = request.status === "pending";

  // Credit management acts on the person the credits belong to: the requester,
  // unless a manager asked on their behalf.
  const member = beneficiary ?? requester;
  const credit = request.credit;
  const nextSeat = credit ? SEAT_UPGRADE_TARGET[credit.seatType] : undefined;

  const closeDialog = () => setOpenDialog(null);

  const resolve = (outcome: RequestOutcome, note?: string) => {
    closeDialog();
    onResolve?.(request.id, outcome, note);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-x-clip overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-6 pb-8">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip
              size="sm"
              icon={getRequestTypeIcon(request.type)}
              label={REQUEST_TYPE_LABELS[request.type]}
            />
          </div>
          <h1 className="heading-xl text-foreground">{request.title}</h1>
          {requester && (
            <div className="flex items-center gap-2">
              <Avatar.Stack
                avatars={[requester, ...(beneficiary ? [beneficiary] : [])].map(
                  (user) => ({
                    name: user.fullName,
                    visual: user.portrait,
                    isRounded: true,
                  })
                )}
                onTop="first"
                size="xs"
              />
              <span className="text-sm text-muted-foreground">
                Requested by{" "}
                <span className="heading-sm">{requester.fullName}</span>
                {beneficiary && (
                  <>
                    {" "}
                    on behalf of{" "}
                    <span className="heading-sm">{beneficiary.fullName}</span>
                  </>
                )}{" "}
                on {formatFullDate(request.createdAt)}
              </span>
            </div>
          )}
        </div>

        <Separator />

        <RequestPayload request={request} />

        {request.message && (
          <div className="flex flex-col gap-2">
            <h2 className="heading-sm text-foreground">Message</h2>
            <p className="rounded-2xl bg-muted-background p-3 text-sm text-foreground">
              {request.message}
            </p>
          </div>
        )}

        <Separator />

        {isPending ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {credit
                ? "Pick how to unblock this member, or decline. Either way you are recorded as the decision maker."
                : "Approving applies the change in Dust and records you as the decision maker."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {credit ? (
                <>
                  {nextSeat && (
                    <Button
                      variant="highlight"
                      label="Update seat"
                      onClick={() => setOpenDialog("seat")}
                    />
                  )}
                  <Button
                    variant={nextSeat ? "outline" : "highlight"}
                    label="Set new limit"
                    onClick={() => setOpenDialog("limit")}
                  />
                </>
              ) : (
                <Button
                  variant="highlight"
                  label="Approve"
                  onClick={() => setOpenDialog("approve")}
                />
              )}
              <Button
                variant="outline"
                label="Decline"
                onClick={() => setOpenDialog("decline")}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <h2 className="heading-sm text-foreground">Decision</h2>
            {resolver && request.outcome && (
              <div className="flex items-center gap-2">
                <Avatar
                  name={resolver.fullName}
                  visual={resolver.portrait}
                  size="xs"
                  isRounded
                />
                <span className="text-sm text-muted-foreground">
                  <span
                    className={cn(
                      "heading-sm",
                      request.outcome === "approved"
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-warning-700"
                    )}
                  >
                    {REQUEST_OUTCOME_LABELS[request.outcome]}
                  </span>{" "}
                  by{" "}
                  <span className="heading-sm">
                    {getResolverLabel(request, currentUserId)}
                  </span>
                  {request.resolvedAt
                    ? ` on ${formatFullDate(request.resolvedAt)}`
                    : ""}
                </span>
              </div>
            )}
            {request.resolutionMessage && (
              <p className="rounded-2xl bg-muted-background p-3 text-sm text-foreground">
                {request.resolutionMessage}
              </p>
            )}
          </div>
        )}
      </div>

      <ApproveDialog
        isOpen={openDialog === "approve"}
        title={request.title}
        onClose={closeDialog}
        onConfirm={() => resolve("approved")}
      />
      <DeclineDialog
        isOpen={openDialog === "decline"}
        onClose={closeDialog}
        onConfirm={(message) => resolve("denied", message)}
      />
      {credit && member && (
        <>
          <SetLimitDialog
            isOpen={openDialog === "limit"}
            memberName={member.fullName}
            currentLimit={credit.limit}
            onClose={closeDialog}
            onConfirm={(limit) =>
              resolve(
                "approved",
                `Limit set to ${formatCredits(limit)} credits/month`
              )
            }
          />
          {nextSeat && (
            <UpdateSeatDialog
              isOpen={openDialog === "seat"}
              memberName={member.fullName}
              currentSeatLabel={SEAT_TYPE_LABELS[credit.seatType]}
              nextSeatLabel={SEAT_TYPE_LABELS[nextSeat]}
              currentLimit={credit.limit}
              onClose={closeDialog}
              onConfirm={() =>
                resolve(
                  "approved",
                  `Seat upgraded to ${SEAT_TYPE_LABELS[nextSeat]}`
                )
              }
            />
          )}
        </>
      )}
    </div>
  );
}
