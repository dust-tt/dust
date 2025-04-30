import moment from "moment-timezone";
import sanitizeHtml from "sanitize-html";

import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  getWorkspaceByModelId,
  renderLightWorkspaceType,
} from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { HubspotClient } from "@app/temporal/labs/connections/providers/hubspot/client";
import type {
  Company,
  Contact,
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

interface Section {
  prefix: string;
  content: string;
  sections: Section[];
}

function createContactSection(contact: Contact, documentId: string): Section {
  const props = contact.properties || {};
  const contactName = [props.firstname, props.lastname]
    .filter(Boolean)
    .join(" ");
  const contactDetails = [
    props.jobtitle && `Title: ${props.jobtitle}`,
    props.email && `Email: ${props.email}`,
    props.phone && `Phone: ${props.phone}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    prefix: `${documentId}-contact-${contact.id}`,
    content: `${contactName}\n${contactDetails}`,
    sections: [],
  };
}

async function createDealSection(
  deal: Deal,
  documentId: string,
  hubspotClient: HubspotClient
): Promise<Section> {
  const props = deal.properties || {};

  // Get all activities
  const activities = await hubspotClient.getDealActivities(deal.id);

  // Format all properties
  const propertyEntries = Object.entries(props)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  const dealDetails = [
    "Deal Details:",
    propertyEntries,
    activities.results.length > 0 ? "Activities:" : null,
    ...activities.results.map((activity) => `Meeting: ${activity.id}`),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    prefix: `${documentId}-deal-${deal.id}`,
    content: dealDetails,
    sections: [],
  };
}

function createTicketSection(ticket: Ticket, documentId: string): Section {
  return {
    prefix: `${documentId}-ticket-${ticket.id}`,
    content: [
      ticket.properties.subject || "Untitled",
      `Stage: ${ticket.properties.hs_pipeline_stage || "Unknown stage"}`,
      `Priority: ${ticket.properties.hs_ticket_priority || "Unknown"}`,
      `Created: ${ticket.properties.createdate || "Unknown"}`,
    ].join("\n"),
    sections: [],
  };
}

function createOrderSection(order: Order, documentId: string): Section {
  return {
    prefix: `${documentId}-order-${order.id}`,
    content: [
      order.properties.name || "Untitled",
      `Quantity: ${order.properties.quantity || "0"}`,
      `Price: ${order.properties.price || "0"}`,
      `Total: ${order.properties.amount || "0"}`,
      `Date: ${order.properties.createdate || "Unknown"}`,
    ].join("\n"),
    sections: [],
  };
}

function createNoteSection(note: Note, documentId: string): Section {
  const props = note.properties || {};
  const formattedDate =
    typeof props.hs_createdate === "string"
      ? formatDate(props.hs_createdate)
      : "Unknown date";
  const noteBody =
    typeof props.hs_note_body === "string" ? props.hs_note_body : "Empty note";
  const cleanedNoteBody = sanitizeHtml(noteBody, {
    allowedTags: [],
    allowedAttributes: {},
  });

  return {
    prefix: `${documentId}-note-${note.id}`,
    content: `${formattedDate}: ${cleanedNoteBody}`,
    sections: [],
  };
}

async function createCompanySection(
  documentId: string,
  company: Company,
  contacts: Contact[],
  deals: Deal[],
  tickets: Ticket[],
  orders: Order[],
  notes: Note[],
  hubspotClient: HubspotClient
): Promise<Section> {
  const props = company.properties || {};
  const companyDetails = [
    `Company Name: ${typeof props.name === "string" ? props.name : "Unknown Company"}`,
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
      `Address: ${props.address}, ${props.city || ""}, ${props.state || ""}, ${props.country || ""}, ${props.zip || ""}`,
    props.facebook_company_page && `Facebook: ${props.facebook_company_page}`,
    props.linkedin_company_page && `LinkedIn: ${props.linkedin_company_page}`,
    props.twitterhandle && `Twitter: ${props.twitterhandle}`,
    props.hs_analytics_source && `Source: ${props.hs_analytics_source}`,
    props.hs_pipeline && `Pipeline: ${props.hs_pipeline}`,
  ]
    .filter((line) => typeof line === "string")
    .join("\n");

  const sections: Section[] = [
    {
      prefix: `${documentId}-details`,
      content: companyDetails,
      sections: [],
    },
  ];

  if (contacts.length > 0) {
    sections.push({
      prefix: `${documentId}-contacts`,
      content: "Key Contacts:",
      sections: contacts.map((contact) =>
        createContactSection(contact, documentId)
      ),
    });
  }

  if (deals.length > 0) {
    sections.push({
      prefix: `${documentId}-deals`,
      content: "Deals:",
      sections: await Promise.all(
        deals.map((deal) => createDealSection(deal, documentId, hubspotClient))
      ),
    });
  }

  if (tickets.length > 0) {
    sections.push({
      prefix: `${documentId}-tickets`,
      content: "Tickets:",
      sections: tickets.map((ticket) =>
        createTicketSection(ticket, documentId)
      ),
    });
  }

  if (orders.length > 0) {
    sections.push({
      prefix: `${documentId}-orders`,
      content: "Orders:",
      sections: orders.map((order) => createOrderSection(order, documentId)),
    });
  }

  if (notes.length > 0) {
    sections.push({
      prefix: `${documentId}-notes`,
      content: "Notes:",
      sections: notes.map((note) => createNoteSection(note, documentId)),
    });
  }

  return {
    prefix: documentId,
    content: `Company Summary for ${typeof props.name === "string" ? props.name : "Unknown Company"}`,
    sections,
  };
}

function createCompanyTags(
  company: Company,
  contacts: Contact[],
  deals: Deal[]
): string[] {
  const props = company.properties || {};

  const baseTags = ["hubspot"];

  const companyTags = [
    props.name && `company:${props.name}`,
    props.industry && `industry:${props.industry}`,
    props.lifecyclestage && `stage:${props.lifecyclestage}`,
    props.hs_lead_status && `lead_status:${props.hs_lead_status}`,
    props.type && `type:${props.type}`,
    props.hs_pipeline && `pipeline:${props.hs_pipeline}`,
    props.hs_analytics_source && `source:${props.hs_analytics_source}`,
  ].filter((tag): tag is string => Boolean(tag));

  const contactRoleTags = contacts
    .map((contact) => contact.properties?.jobtitle)
    .filter((title): title is string => Boolean(title))
    .map((title) => `role:${title}`);

  const dealStageTags = deals
    .map((deal) => deal.properties?.dealstage)
    .filter((stage): stage is string => Boolean(stage))
    .map((stage) => `deal_stage:${stage}`);

  return [...baseTags, ...companyTags, ...contactRoleTags, ...dealStageTags];
}

async function upsertToDustDatasource(
  coreAPI: CoreAPI,
  userId: ModelId,
  workspaceId: ModelId,
  dataSourceViewId: ModelId,
  company: Company,
  contacts: Contact[],
  deals: Deal[],
  tickets: Ticket[],
  orders: Order[],
  notes: Note[],
  portalId: string,
  hubspotClient: HubspotClient
): Promise<void> {
  const documentId = `company-${company.id}`;
  const props = company.properties || {};

  const section = await createCompanySection(
    documentId,
    company,
    contacts,
    deals,
    tickets,
    orders,
    notes,
    hubspotClient
  );

  try {
    const user = await UserResource.fetchByModelId(userId);
    if (!user) {
      logger.error({ workspaceId }, "User not found");
      return;
    }

    const workspace = await getWorkspaceByModelId(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found");
      return;
    }

    const workspaceLight = renderLightWorkspaceType({ workspace });

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspaceLight.sId
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
      tags: createCompanyTags(company, contacts, deals),
      parentId: null,
      parents: [documentId],
      sourceUrl: `https://app.hubspot.com/contacts/${portalId}/company/${company.id}`,
      timestamp: null,
      section,
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
      filters.push(
        {
          propertyName: "hs_lastmodifieddate",
          operator: "GTE",
          value: since.toISOString(),
        },
        // Also check for companies with deals modified since last sync
        {
          propertyName: "associations.deal.hs_lastmodifieddate",
          operator: "GTE",
          value: since.toISOString(),
        },
        // Check for companies with contacts modified since last sync
        {
          propertyName: "associations.contact.hs_lastmodifieddate",
          operator: "GTE",
          value: since.toISOString(),
        },
        // Check for companies with notes modified since last sync
        {
          propertyName: "notes_last_updated",
          operator: "GTE",
          value: since.toISOString(),
        },
        // Check for companies with tickets modified since last sync
        {
          propertyName: "associations.ticket.hs_lastmodifieddate",
          operator: "GTE",
          value: since.toISOString(),
        }
      );
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
            configuration.userId,
            configuration.workspaceId,
            dataSourceViewId,
            company,
            contacts,
            deals,
            tickets,
            orders,
            notes,
            credentials.portalId,
            hubspotClient
          );
        }
      }

      await markSyncCompleted(configuration);
      return new Ok(undefined);
    } catch (error) {
      const errorMsg = `${error instanceof Error ? error.message : String(error)}`;
      logger.error({ error }, errorMsg);
      await markSyncFailed(configuration, errorMsg);
      return new Err(error as Error);
    }
  } catch (error) {
    const errorMsg = `${error instanceof Error ? error.message : String(error)}`;
    logger.error({ error }, errorMsg);
    await markSyncFailed(configuration, errorMsg);
    return new Err(error as Error);
  }
}
