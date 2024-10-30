import type { ModelId } from "@dust-tt/types";

import type { ZendeskFetchedTicket } from "@connectors/connectors/zendesk/lib/node-zendesk-types";
import { ZendeskTicketResource } from "@connectors/resources/zendesk_resources";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export async function syncTicket({
  connectorId,
  ticket,
  brandId,
  currentSyncDateMs,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  ticket: ZendeskFetchedTicket;
  brandId: number;
  currentSyncDateMs: number;
  loggerArgs: Record<string, string | number | null>;
  forceResync: boolean;
}) {
  let ticketInDb = await ZendeskTicketResource.fetchByTicketId({
    connectorId,
    ticketId: ticket.id,
  });
  const createdAtDate = new Date(ticket.created_at);
  const updatedAtDate = new Date(ticket.updated_at);

  if (!ticketInDb) {
    ticketInDb = await ZendeskTicketResource.makeNew({
      blob: {
        createdAt: createdAtDate,
        updatedAt: updatedAtDate,
        ticketId: ticket.id,
        brandId,
        permission: "read",
        assigneeId: ticket.assignee_id,
        groupId: ticket.group_id,
        organizationId: ticket.organization_id,
        name: "Ticket",
        description: ticket.description,
        subject: ticket.subject,
        requesterMail: ticket?.requester?.email || "",
        url: ticket.url,
        lastUpsertedTs: new Date(currentSyncDateMs),
        satisfactionScore: ticket.satisfaction_rating?.score || "unknown",
        satisfactionComment: ticket.satisfaction_rating?.comment || "",
        status: ticket.status,
        tags: ticket.tags,
        type: ticket.type,
        customFields: ticket.custom_fields.map((field) => field.value),
        connectorId,
      },
    });
  } else {
    await ticketInDb.update({
      createdAt: createdAtDate,
      updatedAt: updatedAtDate,
      assigneeId: ticket.assignee_id,
      groupId: ticket.group_id,
      organizationId: ticket.organization_id,
      description: ticket.description,
      subject: ticket.subject,
      requesterMail: ticket?.requester?.email || "",
      url: ticket.url,
      satisfactionScore: ticket.satisfaction_rating?.score || "unknown",
      satisfactionComment: ticket.satisfaction_rating?.comment || "",
      status: ticket.status,
      tags: ticket.tags,
      type: ticket.type,
      customFields: ticket.custom_fields.map((field) => field.value),
      lastUpsertedTs: new Date(currentSyncDateMs),
    });
  }
  /// TODO: upsert the ticket here
}
