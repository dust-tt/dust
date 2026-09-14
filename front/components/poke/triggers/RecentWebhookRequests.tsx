import { WebhookRequestStatusBadge } from "@app/components/agent_builder/triggers/WebhookRequestStatusBadge";
import { usePokeWebhookRequests } from "@app/poke/swr/triggers";
import type { WebhookRequestTriggerStatus } from "@app/types/assistant/triggers";
import { WEBHOOK_REQUEST_TRIGGER_STATUSES } from "@app/types/assistant/triggers";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessageInline,
  Label,
  Markdown,
  Separator,
  Spinner,
} from "@dust-tt/sparkle";
import moment from "moment";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useState } from "react";

const PAGE_SIZE = 15;

interface PokeRecentWebhookRequestsProps {
  owner: LightWorkspaceType;
  triggerId: string;
}

const STATUS_FILTER_LABELS: Record<WebhookRequestTriggerStatus, string> = {
  workflow_start_succeeded: "Matched",
  workflow_start_failed: "Failed",
  not_matched: "Not Matched",
  rate_limited: "Rate Limited",
  credits_exhausted: "Out Of Credits",
};

export function PokeRecentWebhookRequests({
  owner,
  triggerId,
}: PokeRecentWebhookRequestsProps) {
  const defaultOpen = true;
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="my-4 flex min-h-24 flex-col rounded-lg border bg-background">
      <div className="flex justify-between gap-3 rounded-t-lg border-b border-separator bg-background p-4">
        <h2 className="text-md font-bold">Webhook Request History</h2>
      </div>
      <div className="flex flex-grow flex-col justify-center p-4">
        <Collapsible defaultOpen={defaultOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger>
            <Label className="cursor-pointer">Recent requests</Label>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <PokeRecentWebhookRequestsContent
              isOpen={isOpen}
              owner={owner}
              triggerId={triggerId}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

interface PokeRecentWebhookRequestsContentProps {
  isOpen: boolean;
  owner: LightWorkspaceType;
  triggerId: string;
}

function PokeRecentWebhookRequestsContent({
  isOpen,
  owner,
  triggerId,
}: PokeRecentWebhookRequestsContentProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [statusFilter, setStatusFilter] = useState<
    WebhookRequestTriggerStatus | undefined
  >(undefined);
  const { webhookRequests, isWebhookRequestsLoading, isWebhookRequestsError } =
    usePokeWebhookRequests({
      owner,
      triggerId,
      limit,
      status: statusFilter,
      disabled: !isOpen,
    });
  const hasMore = webhookRequests.length === limit;

  if (isWebhookRequestsLoading || !isOpen) {
    return (
      <div className="flex items-center gap-2 pt-2">
        <Spinner size="sm" />
        <span className="text-sm text-muted-foreground">
          Loading recent requests...
        </span>
      </div>
    );
  }

  if (isWebhookRequestsError) {
    return (
      <ContentMessageInline variant="warning" className="pt-2">
        Unable to load recent webhook requests.
      </ContentMessageInline>
    );
  }

  const lastBlocked = webhookRequests.find(
    (request) =>
      request.status === "rate_limited" ||
      request.status === "credits_exhausted"
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Chip
          color={statusFilter === undefined ? "primary" : "primary"}
          size="xs"
          label="All"
          className="cursor-pointer select-none"
          onClick={() => {
            setStatusFilter(undefined);
            setLimit(PAGE_SIZE);
          }}
        />
        {WEBHOOK_REQUEST_TRIGGER_STATUSES.map((s) => (
          <Chip
            key={s}
            color={statusFilter === s ? "primary" : "primary"}
            size="xs"
            label={STATUS_FILTER_LABELS[s]}
            className="cursor-pointer select-none"
            onClick={() => {
              setStatusFilter(s);
              setLimit(PAGE_SIZE);
            }}
          />
        ))}
      </div>
      {webhookRequests.length === 0 ? (
        <p className="text-sm text-muted-foreground pt-2">
          {statusFilter
            ? `No ${STATUS_FILTER_LABELS[statusFilter].toLowerCase()} requests.`
            : "No webhook requests yet."}
        </p>
      ) : (
        <>
          {lastBlocked && !statusFilter && (
            <div className="text-sm text-muted-foreground">
              {lastBlocked.errorMessage ??
                `Some requests were blocked (${STATUS_FILTER_LABELS[lastBlocked.status]}).`}
            </div>
          )}
          <div className="flex flex-col px-4">
            {webhookRequests.map((request, idx) => (
              <div key={request.id}>
                <Collapsible defaultOpen={false}>
                  <CollapsibleTrigger>
                    <div className="my-2 flex w-full items-center justify-between gap-4">
                      {moment(new Date(request.timestamp)).calendar(undefined, {
                        sameDay: "[Today at] LTS",
                        lastDay: "[Yesterday at] LTS",
                        lastWeek: "[Last] dddd [at] LTS",
                      })}
                      <WebhookRequestStatusBadge status={request.status} />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {request.errorMessage && (
                      <p className="pb-2 text-sm text-muted-foreground">
                        {request.errorMessage}
                      </p>
                    )}
                    {request.payload && (
                      <div className="rounded">
                        <pre className="max-h-64 overflow-auto text-xs">
                          <Markdown
                            forcedTextSize="xs"
                            content={`\`\`\`json\n${JSON.stringify(request.payload.body, null, 2)}\n\`\`\``}
                          />
                        </pre>
                      </div>
                    )}
                    {!request.payload && !request.errorMessage && (
                      <p className="text-sm text-muted-foreground">
                        No payload available.
                      </p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
                {idx < webhookRequests.length - 1 && <Separator />}
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                label="Load more"
                onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
