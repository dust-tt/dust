import type { ModelId } from "@connectors/types";
import { safeParseJSON } from "@connectors/types";

type GongAPIErrorType = "validation_error" | "http_response_error";

function isGongAPIErrorBody(body: unknown): body is {
  errors: string[];
  requestId: string;
} {
  return (
    typeof body === "object" &&
    body !== null &&
    "errors" in body &&
    Array.isArray(body.errors) &&
    "requestId" in body &&
    typeof body.requestId === "string"
  );
}

export function parseGongAPIErrorBody(body: string): {
  errors: string[];
  requestId?: string;
} {
  const bodyParsedRes = safeParseJSON(body);

  if (bodyParsedRes.isErr()) {
    return {
      errors: [
        `Failed to parse error response: ${bodyParsedRes.error.message}`,
      ],
    };
  }

  if (isGongAPIErrorBody(bodyParsedRes.value)) {
    return {
      errors: bodyParsedRes.value.errors,
      requestId: bodyParsedRes.value.requestId,
    };
  }

  return { errors: [body] };
}

export class GongAPIError extends Error {
  readonly type: GongAPIErrorType;
  readonly connectorId: ModelId;
  readonly endpoint: string;
  readonly errors?: string[];
  readonly pathErrors?: string[];
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;
  readonly status?: number;

  constructor(
    message: string,
    {
      connectorId,
      endpoint,
      errors,
      pathErrors,
      requestId,
      retryAfterSeconds,
      status,
      type,
    }: {
      connectorId: ModelId;
      endpoint: string;
      errors?: string[];
      pathErrors?: string[];
      requestId?: string;
      retryAfterSeconds?: number;
      status?: number;
      type: GongAPIErrorType;
    }
  ) {
    super(message);
    this.type = type;

    this.connectorId = connectorId;
    this.endpoint = endpoint;
    this.errors = errors;
    this.pathErrors = pathErrors;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
    this.status = status;
  }

  static fromAPIError(
    response: Response,
    {
      body,
      connectorId,
      endpoint,
      pathErrors,
      retryAfterSeconds,
    }: {
      body: string;
      connectorId: ModelId;
      endpoint: string;
      pathErrors?: string[];
      retryAfterSeconds?: number;
    }
  ) {
    const { errors, requestId } = parseGongAPIErrorBody(body);

    return new this(
      `Gong API responded with status: ${response.status} on ${endpoint}`,
      {
        type: "http_response_error",
        connectorId,
        endpoint,
        errors,
        pathErrors,
        requestId,
        status: response.status,
        retryAfterSeconds,
      }
    );
  }

  static fromValidationError({
    endpoint,
    connectorId,
    pathErrors,
  }: {
    endpoint: string;
    connectorId: ModelId;
    pathErrors: string[];
  }) {
    return new this("Response validation failed", {
      type: "validation_error",
      endpoint,
      connectorId,
      pathErrors,
    });
  }

  toString(): string {
    const errorDetails = [
      `message: ${this.message}`,
      `type: ${this.type}`,
      `endpoint: ${this.endpoint}`,
      `status: ${this.status || "N/A"}`,
      `requestId: ${this.requestId || "N/A"}`,
    ];

    if (this.errors && this.errors.length > 0) {
      errorDetails.push(`errors: [${this.errors.join(", ")}]`);
    }

    if (this.pathErrors && this.pathErrors.length > 0) {
      errorDetails.push(`pathErrors: [${this.pathErrors.join(", ")}]`);
    }

    return `GongAPIError: {${errorDetails.join(", ")}}`;
  }
}
