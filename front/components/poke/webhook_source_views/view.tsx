import Link from "next/link";

import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableHead,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { WebhookSourceViewForAdminType } from "@app/types/triggers/webhooks";

export function ViewWebhookSourceViewTable({
  webhookSourceView,
  workspaceId,
}: {
  webhookSourceView: WebhookSourceViewForAdminType;
  workspaceId: string;
}) {
  return (
    <div className="border-material-200 overflow-x-auto rounded-lg border">
      <PokeTable>
        <PokeTableBody>
          <PokeTableRow>
            <PokeTableHead>ID</PokeTableHead>
            <PokeTableCell>{webhookSourceView.id}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>sId</PokeTableHead>
            <PokeTableCell>{webhookSourceView.sId}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Custom Name</PokeTableHead>
            <PokeTableCell>{webhookSourceView.customName}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Description</PokeTableHead>
            <PokeTableCell>{webhookSourceView.description}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Icon</PokeTableHead>
            <PokeTableCell>{webhookSourceView.icon}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Webhook Source</PokeTableHead>
            <PokeTableCell>
              <Link
                href={`/poke/${workspaceId}/webhook_sources/${webhookSourceView.webhookSource.sId}`}
                className="text-action-500 hover:text-action-600"
              >
                {webhookSourceView.webhookSource.sId}
              </Link>
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Space ID</PokeTableHead>
            <PokeTableCell>{webhookSourceView.spaceId}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Provider</PokeTableHead>
            <PokeTableCell>
              {webhookSourceView.provider ?? "custom"}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Subscribed Events</PokeTableHead>
            <PokeTableCell>
              {webhookSourceView.subscribedEvents.length > 0
                ? webhookSourceView.subscribedEvents.join(", ")
                : "None"}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Edited By</PokeTableHead>
            <PokeTableCell>
              {webhookSourceView.editedByUser
                ? `${webhookSourceView.editedByUser.fullName} (${webhookSourceView.editedByUser.email})`
                : "None"}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Created</PokeTableHead>
            <PokeTableCell>
              {new Date(webhookSourceView.createdAt).toLocaleString()}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Updated</PokeTableHead>
            <PokeTableCell>
              {new Date(webhookSourceView.updatedAt).toLocaleString()}
            </PokeTableCell>
          </PokeTableRow>
        </PokeTableBody>
      </PokeTable>
    </div>
  );
}
