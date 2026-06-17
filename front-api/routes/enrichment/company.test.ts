import app from "./company";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnrichCompanyFromDomain,
  mockFetchUsersFromWorkOSWithEmails,
  mockHasValidMxRecords,
  mockIsDomainAutoJoinEnabled,
  mockRateLimiter,
  mockSendUserOperationMessage,
} = vi.hoisted(() => ({
  mockEnrichCompanyFromDomain: vi.fn(),
  mockFetchUsersFromWorkOSWithEmails: vi.fn(),
  mockHasValidMxRecords: vi.fn(),
  mockIsDomainAutoJoinEnabled: vi.fn(),
  mockRateLimiter: vi.fn(),
  mockSendUserOperationMessage: vi.fn(),
}));

vi.mock("@app/lib/api/enrichment/company", () => ({
  ENTERPRISE_THRESHOLD: 500,
  enrichCompanyFromDomain: mockEnrichCompanyFromDomain,
}));

vi.mock("@app/lib/api/workos/user", () => ({
  fetchUsersFromWorkOSWithEmails: mockFetchUsersFromWorkOSWithEmails,
}));

vi.mock("@app/lib/resources/workspace_resource", () => ({
  WorkspaceResource: {
    isDomainAutoJoinEnabled: mockIsDomainAutoJoinEnabled,
  },
}));

vi.mock("@app/lib/utils", () => ({
  isEmailValid: (email: string | null) =>
    typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
}));

vi.mock("@app/lib/utils/email", () => ({
  extractDomain: (email: string) =>
    email.match(/@([^@]+)$/)?.[1].toLowerCase() ?? null,
  hasValidMxRecords: mockHasValidMxRecords,
}));

vi.mock("@app/lib/utils/personal_email_domains", () => ({
  isPersonalEmailDomain: () => false,
}));

vi.mock("@app/lib/utils/rate_limiter", () => ({
  rateLimiter: mockRateLimiter,
}));

vi.mock("@app/types/shared/user_operation", () => ({
  sendUserOperationMessage: mockSendUserOperationMessage,
}));

async function postCompanyEnrichment(
  email: unknown,
  headers: Record<string, string> = {}
) {
  return app.request("/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ email }),
  });
}

describe("POST /api/enrichment/company", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimiter.mockResolvedValue(30);
    mockFetchUsersFromWorkOSWithEmails.mockResolvedValue([]);
    mockIsDomainAutoJoinEnabled.mockResolvedValue(false);
    mockHasValidMxRecords.mockResolvedValue(true);
    mockEnrichCompanyFromDomain.mockResolvedValue({
      size: 2000,
      name: "Example Corp",
      region: "North America",
      funding: "Unknown",
      revenue: "Unknown",
    });
  });

  it("rejects non-email strings before enrichment or Slack notification", async () => {
    const response = await postCompanyEnrichment("hello <!channel>");

    expect(response.status).toBe(400);
    expect(mockFetchUsersFromWorkOSWithEmails).not.toHaveBeenCalled();
    expect(mockEnrichCompanyFromDomain).not.toHaveBeenCalled();
    expect(mockSendUserOperationMessage).not.toHaveBeenCalled();
  });

  it("rate limits the unauthenticated endpoint by client IP", async () => {
    mockRateLimiter.mockResolvedValueOnce(0);

    const response = await postCompanyEnrichment("lead@example.com", {
      "cf-connecting-ip": "203.0.113.10",
    });

    expect(response.status).toBe(429);
    expect(mockRateLimiter).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "enrichment_company:ip:203.0.113.10",
        maxPerTimeframe: 30,
        timeframeSeconds: 60,
      })
    );
    expect(mockSendUserOperationMessage).not.toHaveBeenCalled();
  });

  it("posts Slack notifications without mrkdwn and escapes Slack control characters", async () => {
    mockEnrichCompanyFromDomain.mockResolvedValueOnce({
      size: 2000,
      name: "Evil <@U123> & Co",
      region: "NA <here>",
      funding: "<http://evil.example|funding>",
      revenue: "1 > 0 & growing",
    });

    const response = await postCompanyEnrichment("lead@example.com");

    expect(response.status).toBe(200);
    expect(mockSendUserOperationMessage).toHaveBeenCalledTimes(1);
    const slackArgs = mockSendUserOperationMessage.mock.calls[0][0];

    expect(slackArgs).toEqual(
      expect.objectContaining({
        channel: "C0A1XKES0JY",
        mrkdwn: false,
        parse: "none",
      })
    );
    expect(slackArgs.message).toContain("Company: Evil &lt;@U123&gt; &amp; Co");
    expect(slackArgs.message).toContain("Region: NA &lt;here&gt;");
    expect(slackArgs.message).toContain(
      "Funding: &lt;http://evil.example|funding&gt;"
    );
    expect(slackArgs.message).toContain("Revenue: 1 &gt; 0 &amp; growing");
    expect(slackArgs.message).not.toContain("<@U123>");
  });
});
