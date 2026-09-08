import { Avatar, Button, Chip, Separator } from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";

import {
  getBeneficiary,
  getResolverLabel,
  REQUEST_OUTCOME_LABELS,
  REQUEST_TYPE_ICONS,
  REQUEST_TYPE_LABELS,
} from "../data/requests";
import type { AdminRequest } from "../data/types";
import { getUserById } from "../data/users";

interface RequestDetailViewProps {
  request: AdminRequest;
  currentUserId?: string;
  onApprove?: (requestId: string) => void;
  onDeny?: (requestId: string) => void;
}

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
 * A single request: who asked, what they are asking for, and the decision. The
 * payload is rendered from the request's own `details` lines, so the same panel
 * hosts a spend-limit bump, a Pod access grant, or an agent publication.
 */
export function RequestDetailView({
  request,
  currentUserId,
  onApprove,
  onDeny,
}: RequestDetailViewProps) {
  const requester = getUserById(request.requesterId);
  const beneficiary = getBeneficiary(request);
  const resolver = request.resolvedByUserId
    ? getUserById(request.resolvedByUserId)
    : undefined;
  const isPending = request.status === "pending";

  return (
    <div className="flex h-full w-full flex-col overflow-x-clip overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-6 pb-8">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip
              size="sm"
              icon={REQUEST_TYPE_ICONS[request.type]}
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

        <div className="flex flex-col gap-3">
          <h2 className="heading-sm text-foreground">Request</h2>
          <dl className="flex flex-col gap-2">
            {request.details.map((detail) => (
              <div
                key={detail.label}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
              >
                <dt className="w-40 shrink-0 text-sm text-muted-foreground">
                  {detail.label}
                </dt>
                <dd className="min-w-0 flex-1 text-sm text-foreground">
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

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
              Approving applies the change in Dust and records you as the
              decision maker.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="highlight"
                label="Approve"
                onClick={() => onApprove?.(request.id)}
              />
              <Button
                variant="outline"
                label="Deny"
                onClick={() => onDeny?.(request.id)}
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
          </div>
        )}
      </div>
    </div>
  );
}
