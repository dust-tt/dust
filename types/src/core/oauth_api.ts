import { LoggerInterface } from "../shared/logger";
import { Err, Ok, Result } from "../shared/result";

export const OAUTH_PROVIDERS = [
  "confluence",
  "github",
  "google_drive",
  "intercom",
  "notion",
  "slack",
  "microsoft",
] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(obj: unknown): obj is OAuthProvider {
  return OAUTH_PROVIDERS.includes(obj as OAuthProvider);
}

const { OAUTH_API = "http://127.0.0.1:3006" } = process.env;

export type OAuthAPIError = {
  message: string;
  code: string;
};

export function isOAuthAPIError(obj: unknown): obj is OAuthAPIError {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "message" in obj &&
    typeof obj.message === "string" &&
    "code" in obj &&
    typeof obj.code === "string"
  );
}

export type OAuthAPIResponse<T> = Result<T, OAuthAPIError>;

export type OAuthConnectionType = {
  connection_id: string;
  created: number;
  provider: OAuthProvider;
  status: "pending" | "finalized";
  secret: string;
};

export class OAuthAPI {
  _logger: LoggerInterface;

  constructor(logger: LoggerInterface) {
    this._logger = logger;
  }

  apiUrl() {
    return OAUTH_API;
  }

  async createConnection(
    provider: OAuthProvider,
    metadata: Record<string, unknown> | null = null
  ): Promise<OAuthAPIResponse<{ connection: OAuthConnectionType }>> {
    const response = await this._fetchWithError(`${OAUTH_API}/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider,
        metadata,
      }),
    });
    return this._resultFromResponse(response);
  }

  private async _fetchWithError(
    url: string,
    init?: RequestInit
  ): Promise<Result<{ response: Response; duration: number }, OAuthAPIError>> {
    const now = Date.now();
    try {
      const res = await fetch(url, init);
      return new Ok({ response: res, duration: Date.now() - now });
    } catch (e) {
      const duration = Date.now() - now;
      const err: OAuthAPIError = {
        code: "unexpected_network_error",
        message: `Unexpected network error from OAuthAPI: ${e}`,
      };
      this._logger.error(
        {
          url,
          duration,
          oAuthError: err,
          error: e,
        },
        "OAuthAPI error"
      );
      return new Err(err);
    }
  }

  private async _resultFromResponse<T>(
    res: Result<
      {
        response: Response;
        duration: number;
      },
      OAuthAPIError
    >
  ): Promise<OAuthAPIResponse<T>> {
    if (res.isErr()) {
      return res;
    }

    // We get the text and attempt to parse so that we can log the raw text in case of error (the
    // body is already consumed by response.json() if used otherwise).
    const text = await res.value.response.text();

    let json = null;
    try {
      json = JSON.parse(text);
    } catch (e) {
      const err: OAuthAPIError = {
        code: "unexpected_response_format",
        message: `Unexpected response format from OAuthAPI: ${e}`,
      };

      this._logger.error(
        {
          oAuthError: err,
          parseError: e,
          rawText: text,
          status: res.value.response.status,
          url: res.value.response.url,
          duration: res.value.duration,
        },
        "OAuthAPI error"
      );
      return new Err(err);
    }

    if (!res.value.response.ok) {
      const err = json?.error;
      if (isOAuthAPIError(err)) {
        this._logger.error(
          {
            oAuthError: err,
            status: res.value.response.status,
            url: res.value.response.url,
            duration: res.value.duration,
          },
          "OAuthAPI error"
        );
        return new Err(err);
      } else {
        const err: OAuthAPIError = {
          code: "unexpected_error_format",
          message: "Unexpected error format from OAuthAPI",
        };
        this._logger.error(
          {
            oAuthError: err,
            json,
            status: res.value.response.status,
            url: res.value.response.url,
            duration: res.value.duration,
          },
          "OAuthAPI error"
        );
        return new Err(err);
      }
    } else {
      const err = json?.error;
      const res = json?.response;

      if (err && isOAuthAPIError(err)) {
        this._logger.error(
          {
            oauthError: err,
            json,
            status: res.value.response.status,
            url: res.value.response.url,
            duration: res.value.duration,
          },
          "OAuthAPI error"
        );
        return new Err(err);
      } else if (res) {
        return new Ok(res);
      } else {
        const err: OAuthAPIError = {
          code: "unexpected_response_format",
          message: "Unexpected response format from OAuthAPI",
        };
        this._logger.error(
          {
            oAuthError: err,
            json,
            status: res.value.response.status,
            url: res.value.response.url,
            duration: res.value.duration,
          },
          "OAuthAPI error"
        );
        return new Err(err);
      }
    }
  }
}
