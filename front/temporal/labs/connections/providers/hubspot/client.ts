import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import logger from "@app/logger/logger";
import type { HubspotFilter } from "@app/temporal/labs/connections/providers/hubspot/types";
import type { Contact } from "@app/temporal/labs/connections/providers/hubspot/types";
import {
  ContactCodec,
  DealCodec,
  NoteCodec,
  OrderCodec,
  TicketCodec,
} from "@app/temporal/labs/connections/providers/hubspot/types";
import { hubspotLimiter } from "@app/temporal/labs/connections/providers/hubspot/utils";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

const CompanySearchResult = t.type({
  id: t.string,
  properties: t.record(t.string, t.unknown),
  createdAt: t.string,
  updatedAt: t.string,
  archived: t.boolean,
});

const PagingNext = t.type({
  after: t.string,
  link: t.union([t.string, t.undefined]),
});

const Paging = t.type({
  next: t.union([PagingNext, t.undefined]),
});

const CompanySearchResponse = t.type({
  results: t.array(CompanySearchResult),
  paging: t.union([Paging, t.undefined]),
});

const CompanyDetailsResponse = t.type({
  id: t.string,
  properties: t.record(t.string, t.unknown),
});

const AssociationResult = t.type({
  id: t.string,
});

const AssociationsResponse = t.type({
  results: t.array(AssociationResult),
});

const ContactResponse = t.type({
  results: t.array(ContactCodec),
});

const DealResponse = t.type({
  results: t.array(DealCodec),
});

const TicketResponse = t.type({
  results: t.array(TicketCodec),
});

const OrderResponse = t.type({
  results: t.array(OrderCodec),
});

const NoteResponse = t.type({
  results: t.array(NoteCodec),
});

const PropertyResponse = t.type({
  results: t.array(
    t.type({
      name: t.string,
      label: t.string,
      type: t.string,
      fieldType: t.string,
      description: t.union([t.string, t.undefined]),
      groupName: t.string,
      options: t.array(t.unknown),
      displayOrder: t.number,
      calculated: t.boolean,
      externalOptions: t.boolean,
      hasUniqueValue: t.boolean,
      hidden: t.boolean,
      hubspotDefined: t.union([t.boolean, t.undefined]),
      modificationMetadata: t.record(t.string, t.unknown),
      formField: t.boolean,
      dataSensitivity: t.string,
    })
  ),
});

export class HubspotAPIError extends Error {
  readonly status?: number;
  readonly endpoint: string;
  readonly pathErrors?: string[];

  constructor(
    message: string,
    {
      endpoint,
      status,
      pathErrors,
    }: {
      endpoint: string;
      status?: number;
      pathErrors?: string[];
    }
  ) {
    super(message);
    this.endpoint = endpoint;
    this.status = status;
    this.pathErrors = pathErrors;
  }

  static fromValidationError({
    endpoint,
    pathErrors,
  }: {
    endpoint: string;
    pathErrors: string[];
  }) {
    return new this("Response validation failed", {
      endpoint,
      pathErrors,
    });
  }
}

export class HubspotClient {
  private readonly baseURL = "https://api.hubapi.com";

  constructor(private readonly accessToken: string) {}

  private async makeRequest<T>(
    endpoint: string,
    codec: t.Type<T>,
    options: RequestInit & { params?: Record<string, unknown> } = {}
  ): Promise<T> {
    const { params, ...fetchOptions } = options;
    const url = new URL(`${this.baseURL}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((v) => url.searchParams.append(key, String(v)));
        } else {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await hubspotLimiter.schedule(() =>
      fetch(url.toString(), {
        ...fetchOptions,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          ...fetchOptions.headers,
        },
      })
    );

    return this.handleResponse(response, endpoint, codec);
  }

  private async handleResponse<T>(
    response: Response,
    endpoint: string,
    codec: t.Type<T>
  ): Promise<T> {
    if (!response.ok) {
      if (response.status === 401) {
        throw new HubspotAPIError("Invalid or expired HubSpot credentials", {
          endpoint,
          status: response.status,
        });
      }

      const errorBody = await response.text();
      logger.error(
        { status: response.status, endpoint, errorBody },
        "Hubspot API error response"
      );

      throw new HubspotAPIError(
        `HubSpot API responded with status: ${response.status}`,
        {
          endpoint,
          status: response.status,
        }
      );
    }

    const responseBody = await response.json();
    const result = codec.decode(responseBody);

    if (isLeft(result)) {
      const pathErrors = reporter.formatValidationErrors(result.left);
      logger.error(
        { endpoint, pathErrors, responseBody },
        "Hubspot API response validation failed"
      );
      throw HubspotAPIError.fromValidationError({
        endpoint,
        pathErrors,
      });
    }

    return result.right;
  }

  async getAssociatedContacts(
    companyId: string
  ): Promise<{ results: Contact[] }> {
    const associations = await this.makeRequest(
      `/crm/v3/objects/companies/${companyId}/associations/contacts`,
      AssociationsResponse,
      { params: { limit: 100 } }
    );

    const contactIds = associations.results.map((result) => result.id);
    if (contactIds.length === 0) {
      return { results: [] };
    }

    const response = await this.makeRequest(
      "/crm/v3/objects/contacts/batch/read",
      ContactResponse,
      {
        method: "POST",
        body: JSON.stringify({
          properties: [
            "firstname",
            "lastname",
            "email",
            "phone",
            "jobtitle",
            "createdate",
            "lastmodifieddate",
          ],
          inputs: contactIds.map((id) => ({ id })),
        }),
      }
    );

    return {
      results: response.results.map((contact) => ({
        ...contact,
        createdAt: contact.properties?.createdate || new Date().toISOString(),
        updatedAt:
          contact.properties?.lastmodifieddate || new Date().toISOString(),
        archived: false,
      })),
    };
  }

  async getAssociatedDeals(companyId: string) {
    const associations = await this.makeRequest(
      `/crm/v3/objects/companies/${companyId}/associations/deals`,
      AssociationsResponse,
      { params: { limit: 100 } }
    );

    const dealIds = associations.results.map((result) => result.id);
    if (dealIds.length === 0) {
      return { results: [] };
    }

    // First get all deal properties
    const propertiesResponse = await this.makeRequest(
      "/crm/v3/properties/deals",
      PropertyResponse,
      { method: "GET" }
    );

    const propertyNames = propertiesResponse.results.map((p) => p.name);

    return this.makeRequest("/crm/v3/objects/deals/batch/read", DealResponse, {
      method: "POST",
      body: JSON.stringify({
        properties: propertyNames,
        inputs: dealIds.map((id) => ({ id })),
      }),
    });
  }

  async getDealActivities(dealId: string) {
    return this.makeRequest(
      `/crm/v3/objects/deals/${dealId}/associations/meetings`,
      AssociationsResponse,
      {
        params: {
          limit: 100,
          // Sort by timestamp descending to get most recent activities first
          sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }],
        },
      }
    );
  }

  async getAssociatedTickets(companyId: string) {
    const associations = await this.makeRequest(
      `/crm/v3/objects/companies/${companyId}/associations/tickets`,
      AssociationsResponse,
      { params: { limit: 100 } }
    );

    const ticketIds = associations.results.map((result) => result.id);
    if (ticketIds.length === 0) {
      return { results: [] };
    }

    return this.makeRequest(
      "/crm/v3/objects/tickets/batch/read",
      TicketResponse,
      {
        method: "POST",
        body: JSON.stringify({
          properties: [
            "subject",
            "content",
            "hs_pipeline_stage",
            "hs_ticket_priority",
            "createdate",
          ],
          inputs: ticketIds.map((id) => ({ id })),
        }),
      }
    );
  }

  async getAssociatedOrders(companyId: string) {
    const associations = await this.makeRequest(
      `/crm/v3/objects/companies/${companyId}/associations/line_items`,
      AssociationsResponse,
      { params: { limit: 100 } }
    );

    const orderIds = associations.results.map((result) => result.id);
    if (orderIds.length === 0) {
      return { results: [] };
    }

    return this.makeRequest(
      "/crm/v3/objects/line_items/batch/read",
      OrderResponse,
      {
        method: "POST",
        body: JSON.stringify({
          properties: ["name", "quantity", "price", "amount", "createdate"],
          inputs: orderIds.map((id) => ({ id })),
        }),
      }
    );
  }

  async getNotes(companyId: string) {
    const associations = await this.makeRequest(
      `/crm/v3/objects/companies/${companyId}/associations/notes`,
      AssociationsResponse,
      { params: { limit: 100 } }
    );

    const noteIds = associations.results.map((result) => result.id);
    if (noteIds.length === 0) {
      return { results: [] };
    }

    return this.makeRequest("/crm/v3/objects/notes/batch/read", NoteResponse, {
      method: "POST",
      body: JSON.stringify({
        properties: ["hs_note_body", "hs_createdate"],
        inputs: noteIds.map((id) => ({ id })),
      }),
    });
  }

  async testCredentials(): Promise<Result<void, Error>> {
    try {
      await this.makeRequest(
        "/crm/v3/objects/companies?limit=1",
        CompanySearchResponse
      );
      return new Ok(undefined);
    } catch (error) {
      if (error instanceof HubspotAPIError) {
        return new Err(error);
      }
      return new Err(
        new Error("Unknown error occurred while testing credentials")
      );
    }
  }

  async searchCompanies(params: {
    filterGroups: Array<{ filters: HubspotFilter[] }>;
    properties: string[];
    limit: number;
  }) {
    return this.makeRequest(
      "/crm/v3/objects/companies/search",
      CompanySearchResponse,
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    );
  }

  async getCompanyDetails(companyId: string) {
    return this.makeRequest(
      `/crm/v3/objects/companies/${companyId}`,
      CompanyDetailsResponse,
      {
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
      }
    );
  }
}
