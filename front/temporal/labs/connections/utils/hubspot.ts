import axios from "axios";
import Bottleneck from "bottleneck";

import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { stopLabsConnectionWorkflow } from "@app/temporal/labs/connections/client";
import { stopRetrieveTranscriptsWorkflow } from "@app/temporal/labs/transcripts/client";
import type { ConnectionCredentials, ModelId, Result } from "@app/types";
import { Err, isHubspotCredentials, OAuthAPI, Ok } from "@app/types";
import { CoreAPI, dustManagedCredentials } from "@app/types";

interface Company {
  id: string;
  properties: {
    [key: string]: string;
  };
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

interface Contact {
  id: string;
  properties: {
    [key: string]: string;
  };
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

interface Deal {
  id: string;
  properties: {
    [key: string]: string;
  };
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

interface Ticket {
  id: string;
  properties: {
    [key: string]: string;
  };
}

interface Order {
  id: string;
  properties: {
    [key: string]: string;
  };
}

interface Note {
  id: string;
  properties: {
    [key: string]: string;
  };
}

const hubspotLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 100, // 1000ms / 10 requests per second
});

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toISOString().split("T")[0];
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

async function getRecentlyUpdatedCompanyIds(
  hubspotApi: ReturnType<typeof axios.create>
): Promise<string[]> {
  try {
    const response = await hubspotLimiter.schedule(() =>
      hubspotApi.post("/crm/v3/objects/companies/search", {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "hs_lastmodifieddate",
                operator: "GTE",
                value: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
              },
            ],
          },
        ],
        properties: ["hs_object_id"],
        limit: 100,
      })
    );
    return response.data.results.map((company: Company) => company.id);
  } catch (error) {
    logger.error({ error }, "Error fetching recently updated company IDs");
    return [];
  }
}

async function getCompanyDetails(
  hubspotApi: ReturnType<typeof axios.create>,
  companyId: string
): Promise<Company | null> {
  try {
    const response = await hubspotLimiter.schedule(() =>
      hubspotApi.get(`/crm/v3/objects/companies/${companyId}`, {
        params: {
          properties: [
            "name",
            "industry",
            "annualrevenue",
            "numberofemployees",
            "phone",
            "website",
            "description",
            "hs_lead_status",
            "createdate",
            "hs_lastmodifieddate",
            "lifecyclestage",
            "hubspot_owner_id",
            "type",
            "city",
            "state",
            "country",
            "zip",
            "address",
            "facebook_company_page",
            "linkedin_company_page",
            "twitterhandle",
            "hs_analytics_source",
            "notes_last_updated",
            "hs_pipeline",
          ],
        },
      })
    );
    return response.data;
  } catch (error) {
    logger.error({ error, companyId }, "Error fetching company details");
    return null;
  }
}

async function getAssociatedContacts(
  hubspotApi: ReturnType<typeof axios.create>,
  companyId: string
): Promise<Contact[]> {
  try {
    const response = await hubspotLimiter.schedule(() =>
      hubspotApi.get(
        `/crm/v3/objects/companies/${companyId}/associations/contacts`,
        {
          params: { limit: 100 },
        }
      )
    );
    const contactIds = response.data.results.map(
      (result: { id: string }) => result.id
    );

    if (contactIds.length === 0) {
      return [];
    }

    const contactsResponse = await hubspotLimiter.schedule(() =>
      hubspotApi.post("/crm/v3/objects/contacts/batch/read", {
        properties: ["firstname", "lastname", "email", "phone", "jobtitle"],
        inputs: contactIds.map((id: string) => ({ id })),
      })
    );

    return contactsResponse.data.results;
  } catch (error) {
    logger.error({ error, companyId }, "Error fetching associated contacts");
    return [];
  }
}

async function getAssociatedDeals(
  hubspotApi: ReturnType<typeof axios.create>,
  companyId: string
): Promise<Deal[]> {
  try {
    const response = await hubspotLimiter.schedule(() =>
      hubspotApi.get(
        `/crm/v3/objects/companies/${companyId}/associations/deals`,
        {
          params: { limit: 100 },
        }
      )
    );
    const dealIds = response.data.results.map(
      (result: { id: string }) => result.id
    );

    if (dealIds.length === 0) {
      return [];
    }

    const dealsResponse = await hubspotLimiter.schedule(() =>
      hubspotApi.post("/crm/v3/objects/deals/batch/read", {
        properties: ["dealname", "dealstage", "amount", "closedate"],
        inputs: dealIds.map((id: string) => ({ id })),
      })
    );

    return dealsResponse.data.results;
  } catch (error) {
    logger.error({ error, companyId }, "Error fetching associated deals");
    return [];
  }
}

async function getAssociatedTickets(
  hubspotApi: ReturnType<typeof axios.create>,
  companyId: string
): Promise<Ticket[]> {
  try {
    const response = await hubspotLimiter.schedule(() =>
      hubspotApi.get(
        `/crm/v3/objects/companies/${companyId}/associations/tickets`,
        {
          params: { limit: 100 },
        }
      )
    );
    const ticketIds = response.data.results.map(
      (result: { id: string }) => result.id
    );

    if (ticketIds.length === 0) {
      return [];
    }

    const ticketsResponse = await hubspotLimiter.schedule(() =>
      hubspotApi.post("/crm/v3/objects/tickets/batch/read", {
        properties: [
          "subject",
          "content",
          "hs_pipeline_stage",
          "hs_ticket_priority",
          "createdate",
        ],
        inputs: ticketIds.map((id: string) => ({ id })),
      })
    );

    return ticketsResponse.data.results;
  } catch (error) {
    logger.error({ error, companyId }, "Error fetching associated tickets");
    return [];
  }
}

async function getAssociatedOrders(
  hubspotApi: ReturnType<typeof axios.create>,
  companyId: string
): Promise<Order[]> {
  try {
    const response = await hubspotLimiter.schedule(() =>
      hubspotApi.get(
        `/crm/v3/objects/companies/${companyId}/associations/line_items`,
        {
          params: { limit: 100 },
        }
      )
    );
    const orderIds = response.data.results.map(
      (result: { id: string }) => result.id
    );

    if (orderIds.length === 0) {
      return [];
    }

    const ordersResponse = await hubspotLimiter.schedule(() =>
      hubspotApi.post("/crm/v3/objects/line_items/batch/read", {
        properties: ["name", "quantity", "price", "amount", "createdate"],
        inputs: orderIds.map((id: string) => ({ id })),
      })
    );

    return ordersResponse.data.results;
  } catch (error) {
    logger.error({ error, companyId }, "Error fetching associated orders");
    return [];
  }
}

async function getNotes(
  hubspotApi: ReturnType<typeof axios.create>,
  companyId: string
): Promise<Note[]> {
  try {
    const response = await hubspotLimiter.schedule(() =>
      hubspotApi.get(
        `/crm/v3/objects/companies/${companyId}/associations/notes`,
        {
          params: { limit: 100 },
        }
      )
    );
    const noteIds = response.data.results.map(
      (result: { id: string }) => result.id
    );

    if (noteIds.length === 0) {
      return [];
    }

    const notesResponse = await hubspotLimiter.schedule(() =>
      hubspotApi.post("/crm/v3/objects/notes/batch/read", {
        properties: ["hs_note_body", "hs_createdate"],
        inputs: noteIds.map((id: string) => ({ id })),
      })
    );

    return notesResponse.data.results;
  } catch (error) {
    logger.error({ error, companyId }, "Error fetching notes");
    return [];
  }
}

async function upsertToDustDatasource(
  coreAPI: CoreAPI,
  workspaceId: string,
  dataSourceViewId: ModelId,
  company: Company,
  contacts: Contact[],
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
      const cleanedNoteBody = stripHtmlTags(
        nProps.hs_note_body || "Empty note"
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
      projectId: workspaceId,
      dataSourceId: dataSource.sId,
      documentId: documentId,
      tags: ["hubspot", "company"],
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
      title: `Company ${props.name || company.id}`,
      mimeType: "text/plain",
    });

    if (upsertRes.isErr()) {
      logger.error(
        { error: upsertRes.error, companyId: company.id },
        "Error upserting company to Dust datasource"
      );
      return;
    }

    logger.info(
      { companyId: company.id },
      "Upserted company to Dust datasource"
    );
  } catch (error) {
    logger.error(
      { error, companyId: company.id },
      "Error upserting company to Dust datasource"
    );
  }
}

export async function syncHubspotConnection(
  configuration: LabsConnectionsConfigurationResource
): Promise<Result<void, Error>> {
  const credentialId = configuration.credentialId;
  if (!credentialId) {
    return new Err(new Error("No credentials found"));
  }

  const dataSourceViewId = configuration.dataSourceViewId;
  if (!dataSourceViewId) {
    return new Err(new Error("No data source view found"));
  }

  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  const credentialsRes = await oauthApi.getCredentials({
    credentialsId: credentialId,
  });

  if (credentialsRes.isErr()) {
    logger.error(
      { error: credentialsRes.error },
      "Error fetching credentials from OAuth API"
    );
    return new Err(new Error("Failed to fetch credentials"));
  }

  if (!isHubspotCredentials(credentialsRes.value.credential.content)) {
    return new Err(
      new Error("Invalid credentials type - expected hubspot credentials")
    );
  }

  const credentials = credentialsRes.value.credential.content;

  const hubspotApi = axios.create({
    baseURL: "https://api.hubapi.com",
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      "Content-Type": "application/json",
    },
  });

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const companyIds = await getRecentlyUpdatedCompanyIds(hubspotApi);
  logger.info({ count: companyIds.length }, "Found companies with updates");

  for (const companyId of companyIds) {
    const company = await getCompanyDetails(hubspotApi, companyId);
    if (company) {
      const contacts = await getAssociatedContacts(hubspotApi, companyId);
      const deals = await getAssociatedDeals(hubspotApi, companyId);
      const tickets = await getAssociatedTickets(hubspotApi, companyId);
      const orders = await getAssociatedOrders(hubspotApi, companyId);
      const notes = await getNotes(hubspotApi, companyId);

      await upsertToDustDatasource(
        coreAPI,
        configuration.workspaceId.toString(),
        dataSourceViewId.toString(),
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

  return new Ok(undefined);
}
