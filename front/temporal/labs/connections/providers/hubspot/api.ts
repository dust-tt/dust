import moment from "moment-timezone";

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
  const client = new HubspotClient(accessToken);

  try {
    const filters: HubspotFilter[] = [];
    if (since) {
      filters.push({
        propertyName: "hs_lastmodifieddate",
        operator: "GTE",
        value: since.toISOString(),
      });
    }

    const response = await client.searchCompanies({
      filterGroups: filters.length > 0 ? [{ filters }] : [],
      properties: ["hs_object_id"],
      limit: 100,
    });

    return response.results.map((company) => company.id);
  } catch (error) {
    logger.error({ error }, "Error fetching company IDs");
    return [];
  }
}

export async function getCompanyDetails(
  accessToken: string,
  companyId: string
): Promise<Company | null> {
  const client = new HubspotClient(accessToken);

  try {
    return await client.getCompanyDetails(companyId);
  } catch (error) {
    logger.error({ error, companyId }, "Error fetching company details");
    return null;
  }
}

export async function getAssociatedContacts(
  accessToken: string,
  companyId: string
): Promise<Contact[]> {
  const client = new HubspotClient(accessToken);

  try {
    const response = await client.getAssociatedContacts(companyId);
    return response.results;
  } catch (error) {
    logger.error({ error, companyId }, "Error fetching associated contacts");
    return [];
  }
}

export async function getAssociatedDeals(
  accessToken: string,
  companyId: string
): Promise<Deal[]> {
  const client = new HubspotClient(accessToken);

  try {
    const response = await client.getAssociatedDeals(companyId);
    return response.results;
  } catch (error) {
    logger.error({ error, companyId }, "Error fetching associated deals");
    return [];
  }
}

export async function getAssociatedTickets(
  accessToken: string,
  companyId: string
): Promise<Ticket[]> {
  const client = new HubspotClient(accessToken);

  try {
    const response = await client.getAssociatedTickets(companyId);
    return response.results;
  } catch (error) {
    logger.error({ error, companyId }, "Error fetching associated tickets");
    return [];
  }
}

export async function getAssociatedOrders(
  accessToken: string,
  companyId: string
): Promise<Order[]> {
  const client = new HubspotClient(accessToken);

  try {
    const response = await client.getAssociatedOrders(companyId);
    return response.results;
  } catch (error) {
    logger.error({ error, companyId }, "Error fetching associated orders");
    return [];
  }
}

export async function getNotes(
  accessToken: string,
  companyId: string
): Promise<Note[]> {
  const client = new HubspotClient(accessToken);

  try {
    const response = await client.getNotes(companyId);
    return response.results;
  } catch (error) {
    logger.error({ error, companyId }, "Error fetching notes");
    return [];
  }
}
