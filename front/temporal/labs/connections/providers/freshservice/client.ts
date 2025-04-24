import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";
import logger from "@app/logger/logger";
import https from "https";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import { freshServiceLimiter } from "@app/temporal/labs/connections/providers/freshservice/utils";
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

export class FreshServiceError extends Error {
  readonly status?: string;
  readonly endpoint: string;
  readonly body?: {
    code?: string;
    message?: string;
  };

  constructor(
    message: string,
    {
      endpoint,
      status,
      body,
    }: {
      endpoint: string;
      status?: string;
      body?: {
        code?: string;
        message?: string;
      };
    }
  ) {
    super(message);
    this.endpoint = endpoint;
    this.status = status;
    this.body = body;
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
      body: {
        code: "validation_error",
        message: pathErrors.join(", "),
      },
    });
  }
}

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
    options: {
      method?: string;
      params?: Record<string, string | number>;
      body?: any;
    } = {}
  ): Promise<T> {
    const { method = "GET", params = {}, body } = options;

    // Build URL with query parameters
    let url = `${this.baseURL}${endpoint}`;
    if (Object.keys(params).length > 0) {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        queryParams.append(key, String(value));
      });
      url += `?${queryParams.toString()}`;
    }

    // Freshservice counts an additional call for each param in the include query param
    // so we need to calculate the weight of the request based on the number of fields in the include query param
    const include = params.include as string;
    const includeFields = include ? include.split(",") : [];
    const weight = includeFields.length + 1;

    const parsedUrl = new URL(url);

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " + Buffer.from(`${this.apiKey}:X`).toString("base64"),
      } as Record<string, string>,
    };

    if (body) {
      requestOptions.headers["Content-Length"] = Buffer.byteLength(
        JSON.stringify(body)
      ).toString();
    }

    return new Promise((resolve, reject) => {
      freshServiceLimiter
        .schedule({ weight }, () => {
          return new Promise<T>((innerResolve, innerReject) => {
            logger.info(
              { endpoint, method, params },
              "Making request to FreshService API"
            );

            const req = https.request(requestOptions, (res) => {
              let data = "";

              res.on("data", (chunk) => {
                data += chunk;
              });

              res.on("end", async () => {
                try {
                  const response = {
                    status: res.statusCode,
                    headers: res.headers,
                    data: data ? JSON.parse(data) : null,
                  };

                  const result = await this.handleResponse(
                    response,
                    endpoint,
                    codec
                  );
                  innerResolve(result);
                } catch (error) {
                  innerReject(error);
                }
              });
            });

            req.on("error", (error) => {
              logger.error(
                { error, endpoint },
                "Error making request to FreshService"
              );
              innerReject(
                new FreshServiceError(`Connection error: ${error.message}`, {
                  endpoint,
                })
              );
            });

            if (body) {
              req.write(JSON.stringify(body));
            }

            req.end();
          });
        })
        .then(resolve)
        .catch(reject);
    });
  }

  private async handleResponse<T>(
    response: { status: number | undefined; headers: any; data: any },
    endpoint: string,
    codec: t.Type<T>
  ): Promise<T> {
    // Ensure status is a number, default to 500 if undefined
    const statusCode = response.status || 500;

    if (statusCode >= 400) {
      if (statusCode === 401 || statusCode === 403) {
        throw new FreshServiceError(
          "Invalid or expired FreshService credentials",
          {
            endpoint,
            status: String(statusCode),
            body: {
              code: "access_denied",
              message: "You are not authorized to perform this action.",
            },
          }
        );
      }

      logger.error(
        { status: statusCode, endpoint, data: response.data },
        "FreshService API error response"
      );

      throw new FreshServiceError(
        `FreshService API responded with status: ${statusCode}`,
        {
          endpoint,
          status: String(statusCode),
          body: response.data?.body || {
            code: "api_error",
            message: `Error with status code ${statusCode}`,
          },
        }
      );
    }

    // If the codec is provided, validate the response
    if (codec) {
      const result = codec.decode(response.data);

      if (isLeft(result)) {
        const pathErrors = reporter.formatValidationErrors(result.left);
        logger.error(
          { endpoint, pathErrors, data: response.data },
          "FreshService API response validation failed"
        );

        throw FreshServiceError.fromValidationError({
          endpoint,
          pathErrors,
        });
      }

      return result.right;
    }

    return response.data;
  }

  async testCredentials(): Promise<Result<void, Error>> {
    try {
      await this.makeRequest("/api/v2/tickets", TicketResponseCodec);

      return new Ok(undefined);
    } catch (error) {
      if (error instanceof FreshServiceError) {
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
