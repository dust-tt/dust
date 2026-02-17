import { WebhookRequestStatusBadge } from "@app/components/agent_builder/triggers/WebhookRequestStatusBadge";
import {
  WEBHOOK_REQUEST_TRIGGER_STATUSES,
  type WebhookRequestTriggerStatus,
} from "@app/types/assistant/triggers";
import { usePokeWebhookRequests } from "@app/poke/swr/triggers";
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
  workflow_start_succeeded: "Succeeded",
  workflow_start_failed: "Failed",
  not_matched: "Not Matched",
  rate_limited: "Rate Limited",
};

export function PokeRecentWebhookRequests({
  owner,
  triggerId,
}: PokeRecentWebhookRequestsProps) {
  const defaultOpen = true;
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-material-200 my-4 flex min-h-24 flex-col rounded-lg border bg-muted-background dark:bg-muted-background-night">
      <div className="flex justify-between gap-3 rounded-t-lg bg-primary-300 p-4 dark:bg-primary-300-night">
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
      <div className="flex items-center gap-2">
        <Spinner size="sm" />
        <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Loading recent requests...
        </span>
      </div>
    );
  }

  if (isWebhookRequestsError) {
    return (
      <ContentMessageInline variant="warning">
        Unable to load recent webhook requests.
      </ContentMessageInline>
    );
  }

  const wasRateLimited = webhookRequests.some(
    (request) => request.status === "rate_limited"
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Chip
          color={statusFilter === undefined ? "primary" : "white"}
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
            color={statusFilter === s ? "primary" : "white"}
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
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night pt-2">
          {statusFilter
            ? `No "${STATUS_FILTER_LABELS[statusFilter]}" requests.`
            : "No webhook requests yet."}
        </p>
      ) : (
        <>
          {wasRateLimited && !statusFilter && (
            <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Some requests were rate limited.
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
                    {request.payload ? (
                      <div className="rounded">
                        <pre className="max-h-64 overflow-auto text-xs">
                          <Markdown
                            forcedTextSize="xs"
                            content={`\`\`\`json\n${JSON.stringify(request.payload.body, null, 2)}\n\`\`\``}
                          />
                        </pre>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
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
