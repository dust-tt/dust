import { OAuthConnectionType, OAuthProvider } from "../oauth/lib";
import { LoggerInterface } from "../shared/logger";
import { Err, Ok, Result } from "../shared/result";

export type OAuthAPIError = {
  message: string;
  code: string;
};

export type MigratedCredentialsType = {
  redirect_uri: string;
  access_token_expiry?: number;
  authorization_code?: string;
  access_token: string;
  refresh_token?: string;
  raw_json: unknown;
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

export class OAuthAPI {
  _logger: LoggerInterface;
  _url: string;
  _apiKey: string | null;

  constructor(
    config: { url: string; apiKey: string | null },
    logger: LoggerInterface
  ) {
    this._url = config.url;
    this._logger = logger;
    this._apiKey = config.apiKey;
  }

  apiUrl() {
    return this._url;
  }

  async createConnection({
    provider,
    metadata,
    migratedCredentials,
  }: {
    provider: OAuthProvider;
    metadata: Record<string, unknown> | null;
    migratedCredentials?: MigratedCredentialsType;
  }): Promise<OAuthAPIResponse<{ connection: OAuthConnectionType }>> {
    const body: {
      provider: OAuthProvider;
      metadata: Record<string, unknown> | null;
      migrated_credentials?: MigratedCredentialsType;
    } = {
      provider,
      metadata,
    };

    if (migratedCredentials) {
      body.migrated_credentials = migratedCredentials;
    }

    const response = await this._fetchWithError(`${this._url}/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return this._resultFromResponse(response);
  }

  async finalizeConnection({
    provider,
    connectionId,
    code,
    redirectUri,
  }: {
    provider: OAuthProvider;
    connectionId: string;
    code: string;
    redirectUri: string;
  }): Promise<OAuthAPIResponse<{ connection: OAuthConnectionType }>> {
    const response = await this._fetchWithError(
      `${this._url}/connections/${connectionId}/finalize`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          code,
          redirect_uri: redirectUri,
        }),
      }
    );
    return this._resultFromResponse(response);
  }

  async getAccessToken({
    provider,
    connectionId,
  }: {
    provider: OAuthProvider;
    connectionId: string;
  }): Promise<
    OAuthAPIResponse<{
      connection: OAuthConnectionType;
      access_token: string;
      access_token_expiry: number | null;
      scrubbed_raw_json: unknown;
    }>
  > {
    const response = await this._fetchWithError(
      `${this._url}/connections/${connectionId}/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
        }),
      }
    );
    return this._resultFromResponse(response);
  }

  private async _fetchWithError(
    url: string,
    init?: RequestInit
  ): Promise<Result<{ response: Response; duration: number }, OAuthAPIError>> {
    const now = Date.now();
    const params = { ...init };
    if (this._apiKey) {
      params.headers = {
        ...params.headers,
        Authorization: `Bearer ${this._apiKey}`,
      };
    }
    try {
      const res = await fetch(url, params);
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
