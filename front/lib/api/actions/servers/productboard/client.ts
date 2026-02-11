import type { z } from "zod";

import type { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ProductboardConfiguration,
  ProductboardEntity,
  ProductboardNote,
  ProductboardRelationship,
} from "@app/lib/api/actions/servers/productboard/types";
import {
  ProductboardConfigurationResponseSchema,
  ProductboardConfigurationsResponseSchema,
  ProductboardEntitiesSearchResponseSchema,
  ProductboardEntityResponseSchema,
  ProductboardErrorResponseSchema,
  ProductboardNoteResponseSchema,
  ProductboardNotesListResponseSchema,
  ProductboardRelationshipsListResponseSchema,
} from "@app/lib/api/actions/servers/productboard/types";
import { untrustedFetch } from "@app/lib/egress/server";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const PRODUCTBOARD_API_V2_BASE_URL = "https://api.productboard.com/v2";

export class ProductboardApiError extends Error {
  public readonly isInvalidInput: boolean;
  public readonly statusCode: number;

  constructor(
    message: string,
    {
      isInvalidInput,
      statusCode,
    }: { isInvalidInput: boolean; statusCode: number }
  ) {
    super(message);
    this.isInvalidInput = isInvalidInput;
    this.statusCode = statusCode;
  }
}

export function getProductboardClient(
  apiToken: string
): Result<ProductboardClient, MCPError> {
  return new Ok(new ProductboardClient(apiToken));
}

export class ProductboardClient {
  constructor(private apiToken: string) {}

  private async request<T extends z.Schema>(
    endpoint: string,
    schema: T,
    options: {
      method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
      body?: unknown;
      params?: Record<string, string | number | boolean | string[] | undefined>;
    } = { method: "GET" }
  ): Promise<Result<z.infer<T>, ProductboardApiError>> {
    const url = new URL(`${PRODUCTBOARD_API_V2_BASE_URL}${endpoint}`);

    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            value.forEach((v) => url.searchParams.append(key, v));
          } else {
            url.searchParams.append(key, String(value));
          }
        }
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiToken}`,
    };

    const response = await untrustedFetch(url.toString(), {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const isInvalidInput = response.status === 400 || response.status === 422;
      const errorText = await response.text();

      let errorMessage: string;
      try {
        const errorData = JSON.parse(errorText);
        const parseResult =
          ProductboardErrorResponseSchema.safeParse(errorData);

        if (parseResult.success) {
          const errorDetails = parseResult.data.errors
            .map((err) => `[${err.code}] ${err.title}: ${err.detail}`)
            .join(" | ");
          errorMessage = errorDetails;
        } else {
          errorMessage = errorText ?? response.statusText;
        }
      } catch {
        errorMessage = errorText ?? response.statusText;
      }

      return new Err(
        new ProductboardApiError(errorMessage, {
          isInvalidInput,
          statusCode: response.status,
        })
      );
    }

    const rawData = await response.json();
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      return new Err(
        new ProductboardApiError(
          `Invalid Productboard API response format: ${parseResult.error.message}`,
          { isInvalidInput: false, statusCode: response.status }
        )
      );
    }

    return new Ok(parseResult.data);
  }

  async createNote(params: {
    type: "simple" | "conversation";
    fields: Record<string, unknown>;
    relationships?: Array<{
      type: "customer" | "link";
      target: { id: string; type: "user" | "company" | "link" };
    }>;
  }): Promise<Result<ProductboardNote, ProductboardApiError>> {
    const data: Record<string, unknown> = {
      type: params.type,
      fields: params.fields,
    };

    if (params.relationships && params.relationships.length > 0) {
      data.relationships = params.relationships;
    }

    const body = { data };

    const result = await this.request(
      "/notes",
      ProductboardNoteResponseSchema,
      {
        method: "POST",
        body,
      }
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.data);
  }

  async updateNote(
    noteId: string,
    updates: {
      fields?: Record<string, unknown>;
      patch?: Array<{
        op: "set" | "clear" | "addItems" | "removeItems";
        path: string;
        value?: unknown;
      }>;
    }
  ): Promise<Result<ProductboardNote, ProductboardApiError>> {
    const data: Record<string, unknown> = {};

    if (updates.fields && Object.keys(updates.fields).length > 0) {
      data.fields = updates.fields;
    }

    if (updates.patch && updates.patch.length > 0) {
      data.patch = updates.patch;
    }

    if (Object.keys(data).length === 0) {
      return new Err(
        new ProductboardApiError("No updates provided", {
          isInvalidInput: true,
          statusCode: 400,
        })
      );
    }

    const body = { data };

    const result = await this.request(
      `/notes/${noteId}`,
      ProductboardNoteResponseSchema,
      {
        method: "PATCH",
        body,
      }
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.data);
  }

  async getNote(
    noteId: string,
    fields?: string[]
  ): Promise<Result<ProductboardNote, ProductboardApiError>> {
    const params: Record<string, string | undefined> = {};

    if (fields && fields.length > 0) {
      params.fields = fields.join(",");
    }

    const result = await this.request(
      `/notes/${noteId}`,
      ProductboardNoteResponseSchema,
      {
        method: "GET",
        params,
      }
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.data);
  }

  async queryNotes(filters: {
    pageCursor?: string;
    archived?: boolean;
    processed?: boolean;
    ownerId?: string;
    ownerEmail?: string;
    creatorId?: string;
    creatorEmail?: string;
    sourceRecordId?: string;
    createdFrom?: string;
    createdTo?: string;
    updatedFrom?: string;
    updatedTo?: string;
    fields?: string;
  }): Promise<
    Result<
      {
        notes: ProductboardNote[];
        pageCursor: string | null;
        totalResults?: number;
      },
      ProductboardApiError
    >
  > {
    const params: Record<string, string | number | boolean | undefined> = {};

    if (filters.pageCursor) {
      params.pageCursor = filters.pageCursor;
    }
    if (filters.archived !== undefined) {
      params.archived = filters.archived;
    }
    if (filters.processed !== undefined) {
      params.processed = filters.processed;
    }
    if (filters.ownerId) {
      params["owner[id]"] = filters.ownerId;
    }
    if (filters.ownerEmail) {
      params["owner[email]"] = filters.ownerEmail;
    }
    if (filters.creatorId) {
      params["creator[id]"] = filters.creatorId;
    }
    if (filters.creatorEmail) {
      params["creator[email]"] = filters.creatorEmail;
    }
    if (filters.sourceRecordId) {
      params["source[recordId]"] = filters.sourceRecordId;
    }
    if (filters.createdFrom) {
      params.createdFrom = filters.createdFrom;
    }
    if (filters.createdTo) {
      params.createdTo = filters.createdTo;
    }
    if (filters.updatedFrom) {
      params.updatedFrom = filters.updatedFrom;
    }
    if (filters.updatedTo) {
      params.updatedTo = filters.updatedTo;
    }
    if (filters.fields) {
      params.fields = filters.fields;
    }

    const result = await this.request(
      "/notes",
      ProductboardNotesListResponseSchema,
      {
        method: "GET",
        params,
      }
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    let pageCursor: string | null = null;
    if (result.value.links?.next) {
      try {
        const url = new URL(result.value.links.next);
        const cursor = url.searchParams.get("pageCursor");
        if (cursor) {
          pageCursor = cursor;
        }
      } catch {
        pageCursor = null;
      }
    }

    return new Ok({
      notes: result.value.data,
      pageCursor,
      totalResults: result.value.totalResults,
    });
  }

  async searchEntities(filters: {
    type:
      | "product"
      | "component"
      | "feature"
      | "subfeature"
      | "initiative"
      | "objective"
      | "keyResult"
      | "release"
      | "releaseGroup"
      | "company"
      | "user";
    name?: string;
    archived?: boolean;
    parentId?: string;
    ids?: string[];
    statusIds?: string[];
    statusNames?: string[];
    ownerIds?: string[];
    ownerEmails?: string[];
    timeframeStartDate?: string;
    timeframeEndDate?: string;
    fields?: "all" | "default";
    pageCursor?: string;
  }): Promise<
    Result<
      { entities: ProductboardEntity[]; pageCursor: string | null },
      ProductboardApiError
    >
  > {
    const queryParams: Record<string, string | undefined> = {};
    if (filters.pageCursor) {
      queryParams.pageCursor = filters.pageCursor;
    }

    const searchData: {
      type: string;
      name?: string;
      archived?: boolean;
      parent?: { id: string };
      ids?: string[];
      statuses?: Array<{ id?: string; name?: string }>;
      owners?: Array<{ id?: string; email?: string }>;
      timeframe?: { startDate?: string; endDate?: string };
      fields?: "all" | "default";
    } = {
      type: filters.type,
    };

    if (filters.name !== undefined) {
      searchData.name = filters.name;
    }
    if (filters.archived !== undefined) {
      searchData.archived = filters.archived;
    }
    if (filters.parentId !== undefined) {
      searchData.parent = { id: filters.parentId };
    }
    if (filters.ids !== undefined && filters.ids.length > 0) {
      searchData.ids = filters.ids;
    }
    if (filters.statusIds !== undefined && filters.statusIds.length > 0) {
      searchData.statuses = filters.statusIds.map((id) => ({ id }));
    }
    if (filters.statusNames !== undefined && filters.statusNames.length > 0) {
      if (searchData.statuses) {
        searchData.statuses.push(
          ...filters.statusNames.map((name) => ({ name }))
        );
      } else {
        searchData.statuses = filters.statusNames.map((name) => ({ name }));
      }
    }
    if (filters.ownerIds !== undefined && filters.ownerIds.length > 0) {
      searchData.owners = filters.ownerIds.map((id) => ({ id }));
    }
    if (filters.ownerEmails !== undefined && filters.ownerEmails.length > 0) {
      if (searchData.owners) {
        searchData.owners.push(
          ...filters.ownerEmails.map((email) => ({ email }))
        );
      } else {
        searchData.owners = filters.ownerEmails.map((email) => ({ email }));
      }
    }
    if (
      filters.timeframeStartDate !== undefined ||
      filters.timeframeEndDate !== undefined
    ) {
      searchData.timeframe = {};
      if (filters.timeframeStartDate !== undefined) {
        searchData.timeframe.startDate = filters.timeframeStartDate;
      }
      if (filters.timeframeEndDate !== undefined) {
        searchData.timeframe.endDate = filters.timeframeEndDate;
      }
    }
    if (filters.fields !== undefined) {
      searchData.fields = filters.fields;
    }

    const result = await this.request(
      "/entities/search",
      ProductboardEntitiesSearchResponseSchema,
      {
        method: "POST",
        body: { data: searchData },
        params: queryParams,
      }
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    let pageCursor: string | null = null;
    if (result.value.links?.next) {
      try {
        const url = new URL(result.value.links.next);
        const cursor = url.searchParams.get("pageCursor");
        if (cursor) {
          pageCursor = cursor;
        }
      } catch {
        pageCursor = null;
      }
    }

    return new Ok({
      entities: result.value.data,
      pageCursor,
    });
  }

  async createEntity(params: {
    type:
      | "product"
      | "component"
      | "feature"
      | "subfeature"
      | "initiative"
      | "objective"
      | "keyResult"
      | "release"
      | "releaseGroup"
      | "company"
      | "user";
    fields: Record<string, unknown>;
    relationships?: Array<{
      type: "parent" | "child" | "link" | "isBlockedBy" | "isBlocking";
      target: { id: string };
    }>;
  }): Promise<Result<ProductboardEntity, ProductboardApiError>> {
    const body: {
      data: {
        type: string;
        fields: Record<string, unknown>;
        relationships?: Array<{
          type: string;
          target: { id: string };
        }>;
      };
    } = {
      data: {
        type: params.type,
        fields: params.fields,
      },
    };

    if (params.relationships && params.relationships.length > 0) {
      body.data.relationships = params.relationships;
    }

    const result = await this.request(
      "/entities",
      ProductboardEntityResponseSchema,
      {
        method: "POST",
        body,
      }
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.data);
  }

  async updateEntity(
    entityId: string,
    updates: {
      fields?: Record<string, unknown>;
      patch?: Array<{
        op: "set" | "clear" | "addItems" | "removeItems";
        path: string;
        value?: unknown;
      }>;
    }
  ): Promise<Result<ProductboardEntity, ProductboardApiError>> {
    const data: Record<string, unknown> = {};

    if (updates.fields && Object.keys(updates.fields).length > 0) {
      data.fields = updates.fields;
    }

    if (updates.patch && updates.patch.length > 0) {
      data.patch = updates.patch;
    }

    if (Object.keys(data).length === 0) {
      return new Err(
        new ProductboardApiError("No updates provided", {
          isInvalidInput: true,
          statusCode: 400,
        })
      );
    }

    const body = { data };

    const result = await this.request(
      `/entities/${entityId}`,
      ProductboardEntityResponseSchema,
      {
        method: "PATCH",
        body,
      }
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.data);
  }

  async getEntityRelationships(
    entityId: string,
    filters?: {
      relationshipType?: string;
      pageCursor?: string;
    }
  ): Promise<
    Result<
      { relationships: ProductboardRelationship[]; pageCursor: string | null },
      ProductboardApiError
    >
  > {
    const params: Record<string, string | undefined> = {};

    if (filters?.relationshipType) {
      params.type = filters.relationshipType;
    }
    if (filters?.pageCursor) {
      params.pageCursor = filters.pageCursor;
    }

    const result = await this.request(
      `/entities/${entityId}/relationships`,
      ProductboardRelationshipsListResponseSchema,
      {
        method: "GET",
        params,
      }
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    let pageCursor: string | null = null;
    if (result.value.links?.next) {
      try {
        const url = new URL(result.value.links.next);
        const cursor = url.searchParams.get("pageCursor");
        if (cursor) {
          pageCursor = cursor;
        }
      } catch {
        pageCursor = null;
      }
    }

    return new Ok({
      relationships: result.value.data,
      pageCursor,
    });
  }

  async getNotesConfigurations(): Promise<
    Result<ProductboardConfiguration[], ProductboardApiError>
  > {
    const result = await this.request(
      "/notes/configurations",
      ProductboardConfigurationsResponseSchema,
      {
        method: "GET",
      }
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.data ?? []);
  }

  async getEntitiesConfigurations(): Promise<
    Result<ProductboardConfiguration[], ProductboardApiError>
  > {
    const result = await this.request(
      "/entities/configurations",
      ProductboardConfigurationsResponseSchema,
      {
        method: "GET",
      }
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.data ?? []);
  }

  async getEntityConfiguration(
    type: string
  ): Promise<Result<ProductboardConfiguration, ProductboardApiError>> {
    const result = await this.request(
      `/entities/configurations/${type}`,
      ProductboardConfigurationResponseSchema,
      {
        method: "GET",
      }
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.data);
  }

  async getNoteConfiguration(
    type: string
  ): Promise<Result<ProductboardConfiguration, ProductboardApiError>> {
    const result = await this.request(
      `/notes/configurations/${type}`,
      ProductboardConfigurationResponseSchema,
      {
        method: "GET",
      }
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.data);
  }
}
