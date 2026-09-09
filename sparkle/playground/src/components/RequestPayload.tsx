import {
  Chip,
  Cube01,
  CubeOutline,
  Icon,
  Lock01,
  Planet,
  ProgressBar,
} from "@dust-tt/sparkle";
import type { ComponentType, ReactNode } from "react";

import { getIconForFileType } from "../data/dataSources";
import {
  getProviderLabel,
  getProviderLogo,
  SEAT_TYPE_LABELS,
} from "../data/requests";
import type {
  AdminRequest,
  RequestCredit,
  RequestDocument,
  RequestTarget,
} from "../data/types";

/** Credits are shown in full, the way the product prints them. */
export function formatCredits(credits: number): string {
  return credits.toLocaleString("en-US");
}

function getTargetIcon(
  target: RequestTarget
): ComponentType<{ className?: string }> | undefined {
  switch (target.kind) {
    case "pod":
      return target.label.toLowerCase().includes("restricted")
        ? CubeOutline
        : Cube01;
    case "space":
      return Lock01;
    case "workspace":
      return Planet;
    default:
      return undefined;
  }
}

function PayloadRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <dt className="w-40 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** Where the request lands: a Pod or a company Space, with its own icon. */
function DestinationRow({ target }: { target: RequestTarget }) {
  const icon = getTargetIcon(target);
  const kindLabel = target.kind === "space" ? "Space" : "Pod";

  return (
    <PayloadRow label="Destination">
      <span className="flex items-center gap-1.5">
        {icon && <Icon visual={icon} size="xs" />}
        {target.label}
        <span className="text-muted-foreground">({kindLabel})</span>
      </span>
    </PayloadRow>
  );
}

/**
 * Where the requester stands on credits. At 100% they are blocked, which is
 * what "Over quota" says — the same wording the product uses to flag a capped
 * member.
 */
function CreditRows({ credit }: { credit: RequestCredit }) {
  const isOverQuota = credit.usedPercent >= 100;
  const used = Math.min(credit.usedPercent, 100);

  return (
    <>
      <PayloadRow label="Quota status">
        <div className="flex flex-col gap-1.5 pt-1">
          <ProgressBar
            label="Credit usage"
            className="h-2 w-full max-w-xs"
            radius="xs"
            values={[
              {
                value: used,
                className: isOverQuota ? "bg-warning-500" : "bg-highlight-500",
              },
              { value: 100 - used, className: "bg-muted-background" },
            ]}
          />
          <span
            className={
              isOverQuota ? "heading-sm text-warning-700" : "text-foreground"
            }
          >
            {isOverQuota ? "Over quota" : `${credit.usedPercent}% used`}
          </span>
        </div>
      </PayloadRow>
      <PayloadRow label="Current seat">
        <Chip size="xs" label={SEAT_TYPE_LABELS[credit.seatType]} />
      </PayloadRow>
      <PayloadRow label="Current limit">
        {formatCredits(credit.limit)} credits/month
      </PayloadRow>
    </>
  );
}

/** Documents listed the way Pod files are: type icon, name, then its source. */
function DocumentList({ documents }: { documents: RequestDocument[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="heading-sm text-foreground">Documents</h3>
      <div className="flex flex-col rounded-2xl border border-border">
        {documents.map((document) => {
          const providerLogo = getProviderLogo(document.provider);
          const providerLabel = getProviderLabel(document.provider);

          return (
            <div
              key={document.name}
              className="flex items-center gap-2 border-border border-b px-3 py-2 last:border-b-0"
            >
              <Icon visual={getIconForFileType(document.fileType)} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {document.name}
              </span>
              {providerLogo && (
                <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                  <Icon visual={providerLogo} size="xs" />
                  {providerLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * What is being asked for. Types that carry their own shape — credits, or a
 * batch of documents — render it here; the rest fall back to their labelled
 * `details` lines.
 */
export function RequestPayload({ request }: { request: AdminRequest }) {
  const hasDestination =
    request.type === "knowledgeManagement" && request.variant === "dataSource";

  return (
    <div className="flex flex-col gap-3">
      <h2 className="heading-sm text-foreground">Request</h2>
      <dl className="flex flex-col gap-2">
        {request.credit && <CreditRows credit={request.credit} />}
        {hasDestination && <DestinationRow target={request.target} />}
        {request.details?.map((detail) => (
          <PayloadRow key={detail.label} label={detail.label}>
            {detail.value}
          </PayloadRow>
        ))}
      </dl>
      {request.documents && request.documents.length > 0 && (
        <DocumentList documents={request.documents} />
      )}
    </div>
  );
}
