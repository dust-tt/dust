import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";
import logger from "@app/logger/logger";
import https from "https";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import { freshServiceLimiter } from "@app/temporal/labs/connections/providers/freshservice/utils";
import { LabsConnectionAPIError } from "@app/temporal/labs/connections/errors";
import {
  ConversationResponseCodec,
  SlaPolicyResponseCodec,
  TaskResponseCodec,
  TicketCodec,
  TicketResponseCodec,
  AssetCodec,
  ProblemCodec,
  ChangeCodec,
} from "@app/temporal/labs/connections/providers/freshservice/types";

export class FreshServiceClient {
  public readonly baseURL: string;

  constructor(
    private readonly apiKey: string,
    private readonly domain: string
  ) {
    this.baseURL = `https://${domain}.freshservice.com`;
    logger.info({ domain: this.baseURL }, "FreshService client initialized");
  }

  private async makeRequest<T>(
    endpoint: string,
    codec: t.Type<T>,
    options: RequestInit & { params?: Record<string, unknown> } = {}
  ): Promise<T> {
    const { params, ...fetchOptions } = options;

    let url = `${this.baseURL}${endpoint}`;
    logger.info({ url }, "Freshservice request URL");

    if (params) {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        queryParams.append(key, String(value));
      });
      url += `?${queryParams.toString()}`;
    }

    // Freshservice counts an additional call for each param in the include query param
    // so we need to calculate the weight of the request based on the number of fields in the include query param
    const include = params?.include as string;
    const includeFields = include ? include.split(",") : [];
    const limiterWeight = includeFields.length + 1;

    const response = await freshServiceLimiter.schedule(
      { weight: limiterWeight },
      async () =>
        fetch(url.toString(), {
          ...fetchOptions,
          headers: {
            Authorization:
              "Basic " + Buffer.from(`${this.apiKey}:X`).toString("base64"),
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
    // Ensure status is a number, default to 500 if undefined
    const statusCode = response.status || 500;

    if (!response.ok) {
      if (statusCode === 401 || statusCode === 403) {
        throw new LabsConnectionAPIError(
          "Invalid or expired FreshService credentials",
          {
            endpoint,
            status: statusCode,
          }
        );
      }

      const errorBody = await response.text();
      logger.error(
        { status: statusCode, endpoint, errorBody },
        "FreshService API error response"
      );

      throw new LabsConnectionAPIError(
        `FreshService API responded with status: ${statusCode}`,
        {
          endpoint,
          status: statusCode,
        }
      );
    }

    const responseData = await response.json();
    const result = codec.decode(responseData);

    if (isLeft(result)) {
      const pathErrors = reporter.formatValidationErrors(result.left);
      logger.error(
        { endpoint, pathErrors, data: responseData },
        "FreshService API response validation failed"
      );

      throw LabsConnectionAPIError.fromValidationError({
        endpoint,
        pathErrors,
      });
    }

    return result.right;
  }

  async testCredentials(): Promise<Result<void, Error>> {
    try {
      await this.makeRequest("/api/v2/tickets", TicketResponseCodec);

      return new Ok(undefined);
    } catch (error) {
      if (error instanceof LabsConnectionAPIError) {
        return new Err(error);
      }
      return new Err(
        new Error("Unknown error during FreshService credentials test")
      );
    }
  }

  async getTickets(
    page: number = 1,
    per_page: number = 100,
    updated_since: string = "1970-01-01T00:00:00Z"
  ) {
    const options = {
      params: {
        per_page,
        page,
        updated_since,
      },
    };
    return await this.makeRequest(
      `/api/v2/tickets`,
      TicketResponseCodec,
      options
    );
  }

  async getTicket(ticketId: number) {
    const include = "requester,stats,problem,assets,changes,related_tickets";
    const options = {
      params: {
        include,
      },
    };
    const response = await this.makeRequest(
      `/api/v2/tickets/${ticketId}`,
      t.type({ ticket: TicketCodec }),
      options
    );
    return response.ticket;
  }

  async getTicketTasks(
    ticketId: number,
    page: number = 1,
    per_page: number = 100
  ) {
    const options = {
      params: {
        per_page,
        page,
      },
    };
    return await this.makeRequest(
      `/api/v2/tickets/${ticketId}/tasks`,
      TaskResponseCodec,
      options
    );
  }

  async getConversations(
    ticketId: number,
    page: number = 1,
    per_page: number = 100
  ) {
    const options = {
      params: {
        per_page,
        page,
      },
    };
    return await this.makeRequest(
      `/api/v2/tickets/${ticketId}/conversations`,
      ConversationResponseCodec,
      options
    );
  }

  async getSlaPolicies(page: number = 1, per_page: number = 100) {
    const options = {
      params: {
        per_page,
        page,
      },
    };
    return await this.makeRequest(
      `/api/v2/sla_policies`,
      SlaPolicyResponseCodec,
      options
    );
  }

  async getProblem(problemId: number) {
    const response = await this.makeRequest(
      `/api/v2/problems/${problemId}`,
      t.type({ problem: ProblemCodec })
    );
    return response.problem;
  }

  async getChange(changeId: number) {
    const response = await this.makeRequest(
      `/api/v2/changes/${changeId}`,
      t.type({ change: ChangeCodec })
    );
    return response.change;
  }

  async getAsset(assetId: number) {
    const response = await this.makeRequest(
      `/api/v2/assets/${assetId}`,
      t.type({ asset: AssetCodec })
    );
    return response.asset;
  }
}
