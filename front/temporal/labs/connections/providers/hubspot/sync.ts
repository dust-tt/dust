import moment from "moment-timezone";
import sanitizeHtml from "sanitize-html";

import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { HubspotClient } from "@app/temporal/labs/connections/providers/hubspot/client";
import type {
  Company,
  Deal,
  HubspotFilter,
  Note,
  Order,
  Ticket,
} from "@app/temporal/labs/connections/providers/hubspot/types";
import {
  markSyncCompleted,
  markSyncFailed,
  markSyncStarted,
} from "@app/temporal/labs/connections/utils";
import type { ModelId, Result } from "@app/types";
import { Err, isHubspotCredentials, OAuthAPI, Ok } from "@app/types";
import { CoreAPI, dustManagedCredentials } from "@app/types";

function formatDate(dateString: string): string {
  return moment(dateString).utc().format("YYYY-MM-DD");
}

async function upsertToDustDatasource(
  coreAPI: CoreAPI,
  workspaceId: string,
  dataSourceViewId: ModelId,
  company: Company,
  contacts: { id: string; properties: { [key: string]: string | null } }[],
  deals: Deal[],
  tickets: Ticket[],
  orders: Order[],
  notes: Note[],
  portalId: string
): Promise<void> {
  const documentId = `company-${company.id}`;
  const props = company.properties || {};

  const companyDetails = [
    `Company Name: ${props.name || "Unknown Company"}`,
    props.industry && `Industry: ${props.industry}`,
    props.annualrevenue && `Annual Revenue: ${props.annualrevenue}`,
    props.numberofemployees &&
      `Company Size: ${props.numberofemployees} employees`,
    props.phone && `Phone: ${props.phone}`,
    props.website && `Website: ${props.website}`,
    props.description && `Description: ${props.description}`,
    props.lifecyclestage && `Lifecycle Stage: ${props.lifecyclestage}`,
    props.hubspot_owner_id && `Owner: ${props.hubspot_owner_id}`,
    props.hs_lead_status && `Lead Status: ${props.hs_lead_status}`,
    props.type && `Type: ${props.type}`,
    props.address &&
      `Address: ${props.address}, ${props.city || ""}, ${props.state || ""}, ${
        props.country || ""
      }, ${props.zip || ""}`,
    props.facebook_company_page && `Facebook: ${props.facebook_company_page}`,
    props.linkedin_company_page && `LinkedIn: ${props.linkedin_company_page}`,
    props.twitterhandle && `Twitter: ${props.twitterhandle}`,
    props.hs_analytics_source && `Source: ${props.hs_analytics_source}`,
    props.hs_pipeline && `Pipeline: ${props.hs_pipeline}`,
  ]
    .filter(Boolean)
    .join("\n");

  const contactsInfo = contacts
    .map((contact) => {
      const cProps = contact.properties || {};
      const contactDetails = [
        [cProps.firstname, cProps.lastname].filter(Boolean).join(" "),
        cProps.jobtitle && `Title: ${cProps.jobtitle}`,
        cProps.email && `Email: ${cProps.email}`,
        cProps.phone && `Phone: ${cProps.phone}`,
      ].filter(Boolean);

      return contactDetails.length > 0
        ? `- ${contactDetails.join(", ")}`
        : null;
    })
    .filter(Boolean)
    .join("\n");

  const dealsInfo = deals
    .map((deal) => {
      const dProps = deal.properties || {};
      const dealDetails = [
        dProps.dealname && `${dProps.dealname}`,
        dProps.dealstage && `Stage: ${dProps.dealstage}`,
        dProps.amount && `Amount: ${dProps.amount}`,
        dProps.closedate && `Close Date: ${dProps.closedate}`,
      ].filter(Boolean);

      return dealDetails.length > 0 ? `- ${dealDetails.join(", ")}` : null;
    })
    .filter(Boolean)
    .join("\n");

  const ticketsInfo = tickets
    .map(
      (ticket) =>
        `- ${ticket.properties.subject || "Untitled"}: ${
          ticket.properties.hs_pipeline_stage || "Unknown stage"
        }, Priority: ${ticket.properties.hs_ticket_priority || "Unknown"}, Created: ${
          ticket.properties.createdate || "Unknown"
        }`
    )
    .join("\n");

  const ordersInfo = orders
    .map(
      (order) =>
        `- ${order.properties.name || "Untitled"}: Quantity: ${
          order.properties.quantity || "0"
        }, Price: ${order.properties.price || "0"}, Total: ${
          order.properties.amount || "0"
        }, Date: ${order.properties.createdate || "Unknown"}`
    )
    .join("\n");

  const notesInfo = notes
    .map((note) => {
      const nProps = note.properties || {};
      const formattedDate = nProps.hs_createdate
        ? formatDate(nProps.hs_createdate)
        : "Unknown date";
      const cleanedNoteBody = sanitizeHtml(
        nProps.hs_note_body || "Empty note",
        { allowedTags: [], allowedAttributes: {} }
      );
      return `- ${formattedDate}: ${cleanedNoteBody}`;
    })
    .join("\n");

  const content = `
Company Summary for ${props.name || "Unknown Company"}

Basic Company Details:
${companyDetails}

${contactsInfo ? `Key Contacts:\n${contactsInfo}` : ""}

${dealsInfo ? `Deals:\n${dealsInfo}` : ""}

${ticketsInfo ? `Tickets:\n${ticketsInfo}` : ""}

${ordersInfo ? `Orders:\n${ordersInfo}` : ""}

${notesInfo ? `Notes:\n${notesInfo}` : ""}

${props.notes_last_updated ? `Last Note Updated: ${props.notes_last_updated}` : ""}
  `.trim();

  try {
    const user = await UserResource.fetchByModelId(workspaceId);

    if (!user) {
      logger.error({ workspaceId }, "User not found");
      return;
    }

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspaceId
    );

    const [datasourceView] = await DataSourceViewResource.fetchByModelIds(
      auth,
      [dataSourceViewId]
    );

    if (!datasourceView) {
      logger.error(
        {},
        "[processTranscriptActivity] No datasource view found. Stopping."
      );
      return;
    }

    const dataSource = datasourceView.dataSource;

    if (!dataSource) {
      logger.error(
        {},
        "[processTranscriptActivity] No datasource found. Stopping."
      );
      return;
    }

    const upsertRes = await coreAPI.upsertDataSourceDocument({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      documentId: documentId,
      tags: [
        "hubspot",
        ...(props.name ? [`company:${props.name}`] : []),
        ...(props.industry ? [`industry:${props.industry}`] : []),
        ...(props.lifecyclestage ? [`stage:${props.lifecyclestage}`] : []),
        ...(props.hs_lead_status
          ? [`lead_status:${props.hs_lead_status}`]
          : []),
        ...(props.type ? [`type:${props.type}`] : []),
        ...(props.hs_pipeline ? [`pipeline:${props.hs_pipeline}`] : []),
        ...(props.hs_analytics_source
          ? [`source:${props.hs_analytics_source}`]
          : []),
        ...contacts
          .map((c) => c.properties?.jobtitle)
          .filter(Boolean)
          .map((title) => `role:${title}`),
        ...deals
          .map((d) => d.properties?.dealstage)
          .filter(Boolean)
          .map((stage) => `deal_stage:${stage}`),
      ],
      parentId: null,
      parents: [documentId],
      sourceUrl: `https://app.hubspot.com/contacts/${portalId}/company/${company.id}`,
      timestamp: null,
      section: {
        prefix: documentId,
        content: content,
        sections: [],
      },
      credentials: dustManagedCredentials(),
      lightDocumentOutput: true,
      title: `${props.name || company.id}`,
      mimeType: "text/plain",
    });

    if (upsertRes.isErr()) {
      logger.error(
        {
          error: upsertRes.error,
          companyId: company.id,
          companyName: props.name,
        },
        `Error upserting company to Dust datasource`
      );
      return;
    }

    logger.info(
      { companyId: company.id, companyName: props.name },
      `Upserted hubspot company to Dust datasource`
    );
  } catch (error) {
    logger.error(
      { error, companyId: company.id, companyName: props.name },
      `Error upserting company to Dust datasource`
    );
  }
}

export async function syncHubspotConnection(
  configuration: LabsConnectionsConfigurationResource,
  cursor: string | null = null
): Promise<Result<void, Error>> {
  const isFullSync = cursor === null;
  try {
    await markSyncStarted(configuration);

    const credentialId = configuration.credentialId;
    if (!credentialId) {
      await markSyncFailed(configuration, "No credentials found");
      return new Err(new Error("No credentials found"));
    }

    const dataSourceViewId = configuration.dataSourceViewId;
    if (!dataSourceViewId) {
      await markSyncFailed(configuration, "No data source view found");
      return new Err(new Error("No data source view found"));
    }

    const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);

    const credentialsRes = await oauthApi.getCredentials({
      credentialsId: credentialId,
    });

    if (credentialsRes.isErr()) {
      const errorMsg = "Error fetching credentials from OAuth API";
      logger.error({ error: credentialsRes.error }, errorMsg);
      await markSyncFailed(configuration, errorMsg);
      return new Err(new Error("Failed to fetch credentials"));
    }

    if (!isHubspotCredentials(credentialsRes.value.credential.content)) {
      const errorMsg =
        "Invalid credentials type - expected hubspot credentials";
      await markSyncFailed(configuration, errorMsg);
      return new Err(new Error(errorMsg));
    }

    const credentials = credentialsRes.value.credential.content;
    const hubspotClient = new HubspotClient(credentials.accessToken);
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

    const since = isFullSync
      ? null
      : cursor
        ? new Date(cursor)
        : new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get recently updated companies
    const filters: HubspotFilter[] = [];
    if (since) {
      filters.push({
        propertyName: "hs_lastmodifieddate",
        operator: "GTE",
        value: since.toISOString(),
      });
    }

    const searchResponse = await hubspotClient.searchCompanies({
      filterGroups: filters.length > 0 ? [{ filters }] : [],
      properties: ["hs_object_id"],
      limit: 100,
    });
    const companyIds = searchResponse.results.map((company) => company.id);

    logger.info(
      { count: companyIds.length, isFullSync, since },
      "Found companies to sync"
    );

    try {
      for (const companyId of companyIds) {
        const company = await hubspotClient.getCompanyDetails(companyId);
        if (company) {
          const [contacts, deals, tickets, orders, notes] =
            await concurrentExecutor(
              [
                async () => {
                  const res =
                    await hubspotClient.getAssociatedContacts(companyId);
                  return res.results;
                },
                async () => {
                  const res = await hubspotClient.getAssociatedDeals(companyId);
                  return res.results;
                },
                async () => {
                  const res =
                    await hubspotClient.getAssociatedTickets(companyId);
                  return res.results;
                },
                async () => {
                  const res =
                    await hubspotClient.getAssociatedOrders(companyId);
                  return res.results;
                },
                async () => {
                  const res = await hubspotClient.getNotes(companyId);
                  return res.results;
                },
              ],
              (task) => task(),
              { concurrency: 5 }
            );

          await upsertToDustDatasource(
            coreAPI,
            configuration.workspaceId.toString(),
            dataSourceViewId,
            company,
            contacts,
            deals,
            tickets,
            orders,
            notes,
            credentials.portalId
          );
        }
      }

      await markSyncCompleted(configuration);
      return new Ok(undefined);
    } catch (error) {
      const errorMsg = `Error during sync: ${error instanceof Error ? error.message : String(error)}`;
      logger.error({ error }, errorMsg);
      await markSyncFailed(configuration, errorMsg);
      return new Err(error as Error);
    }
  } catch (error) {
    const errorMsg = `Unexpected error during sync: ${error instanceof Error ? error.message : String(error)}`;
    logger.error({ error }, errorMsg);
    await markSyncFailed(configuration, errorMsg);
    return new Err(error as Error);
  }
}
