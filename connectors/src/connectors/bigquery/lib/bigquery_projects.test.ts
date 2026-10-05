import { GoogleAuth } from "google-auth-library";
import { HttpsProxyAgent } from "https-proxy-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listAccessibleProjects,
  withGoogleAuthStaticIpProxy,
} from "./bigquery_projects";

vi.mock("google-auth-library", () => {
  return {
    GoogleAuth: vi.fn(),
  };
});

vi.mock("undici", async () => {
  const actual = await vi.importActual<typeof import("undici")>("undici");
  return {
    ...actual,
    fetch: vi.fn(),
    ProxyAgent: actual.ProxyAgent,
  };
});

import { fetch as undiciFetch } from "undici";

const BASE_CREDENTIALS = {
  type: "service_account",
  project_id: "proj",
  private_key_id: "key-id",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n",
  client_email: "sa@proj.iam.gserviceaccount.com",
  client_id: "123",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token" as const,
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/sa",
  universe_domain: "googleapis.com",
  location: "US",
};

describe("withGoogleAuthStaticIpProxy", () => {
  afterEach(() => {
    delete process.env.PROXY_HOST;
    delete process.env.PROXY_PORT;
    delete process.env.PROXY_USER_NAME;
    delete process.env.PROXY_USER_PASSWORD;
  });

  it("adds a transporter agent when PROXY_* is set", () => {
    process.env.PROXY_HOST = "proxy.example.com";
    process.env.PROXY_PORT = "8080";
    process.env.PROXY_USER_NAME = "user";
    process.env.PROXY_USER_PASSWORD = "pass";

    const options = withGoogleAuthStaticIpProxy({
      credentials: { client_email: "a", private_key: "b" },
    });
    expect(options.clientOptions?.transporterOptions?.agent).toBeInstanceOf(
      HttpsProxyAgent
    );
  });

  it("leaves options unchanged when PROXY_* is unset", () => {
    const options = withGoogleAuthStaticIpProxy({
      credentials: { client_email: "a", private_key: "b" },
    });
    expect(options.clientOptions).toBeUndefined();
  });
});

describe("listAccessibleProjects", () => {
  afterEach(() => {
    vi.mocked(GoogleAuth).mockReset();
    vi.mocked(undiciFetch).mockReset();
    delete process.env.PROXY_HOST;
    delete process.env.PROXY_PORT;
    delete process.env.PROXY_USER_NAME;
    delete process.env.PROXY_USER_PASSWORD;
  });

  it("rejects non-Google token_uri before opening outbound connections", async () => {
    await expect(
      listAccessibleProjects({
        ...BASE_CREDENTIALS,
        // @ts-expect-error intentional invalid token_uri for regression coverage
        token_uri: "https://evil.example/token",
      })
    ).rejects.toThrow(/Google OAuth token endpoint/);

    expect(GoogleAuth).not.toHaveBeenCalled();
    expect(undiciFetch).not.toHaveBeenCalled();
  });

  it("mints a token and pages Cloud Resource Manager REST search", async () => {
    const getAccessToken = vi.fn().mockResolvedValue({ token: "access-token" });
    const getClient = vi.fn().mockResolvedValue({ getAccessToken });
    vi.mocked(GoogleAuth).mockImplementation(
      class {
        getClient = getClient;
      } as unknown as typeof GoogleAuth
    );

    vi.mocked(undiciFetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            projects: [{ projectId: "other-proj" }],
            nextPageToken: "page-2",
          }),
          { status: 200 }
        ) as unknown as Awaited<ReturnType<typeof undiciFetch>>
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            projects: [{ projectId: "third-proj" }],
          }),
          { status: 200 }
        ) as unknown as Awaited<ReturnType<typeof undiciFetch>>
      );

    const projects = await listAccessibleProjects(BASE_CREDENTIALS);
    expect(projects.map((p) => p.projectId)).toEqual([
      "other-proj",
      "third-proj",
    ]);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(undiciFetch).toHaveBeenCalledTimes(2);

    const firstUrl = String(vi.mocked(undiciFetch).mock.calls[0]![0]);
    expect(firstUrl).toContain(
      "https://cloudresourcemanager.googleapis.com/v3/projects:search"
    );
    expect(firstUrl).toContain("query=state%3AACTIVE");
  });
});
