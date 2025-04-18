import axios from "axios";
import moment from "moment-timezone";

import logger from "@app/logger/logger";
import type {
  Company,
  Contact,
  Deal,
  HubspotFilter,
  Note,
  Order,
  Ticket,
} from "@app/temporal/labs/connections/providers/hubspot/types";
import { hubspotLimiter } from "@app/temporal/labs/connections/providers/hubspot/utils";

export function formatDate(dateString: string): string {
  return moment(dateString).utc().format("YYYY-MM-DD");
}

export async function getRecentlyUpdatedCompanyIds({
  accessToken,
  since = null,
}: {
  accessToken: string;
  since?: Date | null;
}): Promise<string[]> {
  const hubspotApi = axios.create({
    baseURL: "https://api.hubapi.com",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  try {
    const filters: HubspotFilter[] = [];
    if (since) {
      filters.push({
        propertyName: "hs_lastmodifieddate",
        operator: "GTE",
        value: since.toISOString(),
      });
    }

    const response = await hubspotLimiter.schedule(() =>
      hubspotApi.post("/crm/v3/objects/companies/search", {
        filterGroups: filters.length > 0 ? [{ filters }] : [],
        properties: ["hs_object_id"],
        limit: 100,
      })
    );
    return response.data.results.map((company: Company) => company.id);
  } catch (error) {
    logger.error({ error }, "Error fetching company IDs");
    return [];
  }
}

export async function getCompanyDetails(
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

export async function getAssociatedContacts(
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

export async function getAssociatedDeals(
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

export async function getAssociatedTickets(
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

export async function getAssociatedOrders(
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

export async function getNotes(
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
