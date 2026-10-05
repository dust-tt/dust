import type { BigQueryCredentialsWithLocation } from "@connectors/types";
import { GoogleAuth, type GoogleAuthOptions } from "google-auth-library";
import {
  ProxyAgent,
  type RequestInfo,
  type RequestInit,
  type Response,
  fetch as undiciFetch,
} from "undici";

import {
  getStaticIpProxyAgent,
  getStaticIpProxyUrl,
  pinGoogleOAuthTokenUri,
} from "./bigquery_proxy";

const CLOUD_RESOURCE_MANAGER_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform.read-only";

const SEARCH_PROJECTS_URL =
  "https://cloudresourcemanager.googleapis.com/v3/projects:search";

type SearchProjectsResponse = {
  projects?: Array<{ projectId?: string | null }>;
  nextPageToken?: string;
};

/**
 * Lists ACTIVE projects accessible to the service account via Cloud Resource
 * Manager REST (`projects:search`).
 *
 * Uses HTTP (not gRPC) so traffic can share Dust's static `PROXY_*` egress —
 * the HTTP CONNECT proxy cannot carry gRPC. Token minting and the CRM calls
 * both go through the proxy when configured; otherwise they use direct HTTPS
 * (local/unproxied development).
 *
 * `token_uri` from credentials is validated against Google's canonical OAuth
 * endpoints before minting so a crafted credential cannot redirect the proxied
 * token exchange to an arbitrary URL.
 */
export async function listAccessibleProjects(
  credentials: BigQueryCredentialsWithLocation
): Promise<Array<{ projectId?: string | null }>> {
  pinGoogleOAuthTokenUri(credentials.token_uri);

  // google-auth-library/gtoken ignores credential token_uri and posts to its
  // hardcoded Google endpoint; pinGoogleOAuthTokenUri above still rejects bad
  // credentials before we open any outbound connection.
  const auth = new GoogleAuth(
    withGoogleAuthStaticIpProxy({
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key,
      },
      scopes: [CLOUD_RESOURCE_MANAGER_SCOPE],
    })
  );

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken =
    typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;
  if (!accessToken) {
    throw new Error("Failed to mint Google access token for project listing");
  }

  const fetchFn = createOptionalProxiedFetch();
  const projects: Array<{ projectId?: string | null }> = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(SEARCH_PROJECTS_URL);
    url.searchParams.set("query", "state:ACTIVE");
    url.searchParams.set("pageSize", "100");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetchFn(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Cloud Resource Manager projects:search failed (${response.status}): ${body}`
      );
    }

    const data = (await response.json()) as SearchProjectsResponse;
    if (data.projects?.length) {
      projects.push(...data.projects);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return projects;
}

/**
 * Routes google-auth-library token minting through the static IP proxy when
 * configured, by setting the JWT transporter's HTTPS agent.
 */
export function withGoogleAuthStaticIpProxy(
  options: GoogleAuthOptions
): GoogleAuthOptions {
  const agent = getStaticIpProxyAgent();
  if (!agent) {
    return options;
  }

  const existingClientOptions = options.clientOptions ?? {};
  const existingTransporterOptions =
    "transporterOptions" in existingClientOptions &&
    existingClientOptions.transporterOptions
      ? existingClientOptions.transporterOptions
      : {};

  return {
    ...options,
    clientOptions: {
      ...existingClientOptions,
      transporterOptions: {
        ...existingTransporterOptions,
        agent,
      },
    },
  };
}

function createOptionalProxiedFetch(): (
  input: RequestInfo,
  init?: RequestInit
) => Promise<Response> {
  const proxyUrl = getStaticIpProxyUrl();
  if (!proxyUrl) {
    return undiciFetch;
  }

  const dispatcher = new ProxyAgent(proxyUrl);
  return (input, init) => undiciFetch(input, { ...init, dispatcher });
}
