import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { Authenticator } from "@app/lib/auth";
import { EdgeeConnectionResource } from "@app/lib/resources/edgee_connection_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { InMemoryOAuthAPI } from "@app/tests/utils/mocks/in_memory_oauth_api";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCheckEdgeeOrganizationAccess = vi.hoisted(() => vi.fn());
const mockCreateEdgeeGatewayApiKey = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/edgee/console_client", () => ({
  checkEdgeeOrganizationAccess: mockCheckEdgeeOrganizationAccess,
  createEdgeeGatewayApiKey: mockCreateEdgeeGatewayApiKey,
  deleteEdgeeGatewayApiKey: vi.fn(),
}));

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual = await importOriginal<object>();
  const { InMemoryOAuthAPI } =
    await import("@app/tests/utils/mocks/in_memory_oauth_api");
  return { ...actual, OAuthAPI: InMemoryOAuthAPI };
});

describe("getLlmCredentials on an Edgee workspace", () => {
  beforeEach(() => {
    InMemoryOAuthAPI.reset();
    mockCheckEdgeeOrganizationAccess.mockResolvedValue(new Ok(undefined));
    mockCreateEdgeeGatewayApiKey.mockResolvedValue(
      new Ok({ apiKeyId: "key_1", apiKey: "sk-edgee-user" })
    );
  });

  it("returns the caller's Edgee key and nothing else", async () => {
    const { authenticator } = await createResourceTest({
      role: "admin",
      plan: "edgee",
    });
    const res = await EdgeeConnectionResource.upsert(authenticator, {
      adminToken: "pat",
      organizationId: "org_1",
    });
    assert(res.isOk(), "the Edgee connection should be saved");

    const credentials = await getLlmCredentials(authenticator);

    expect(credentials).toEqual({ EDGEE_API_KEY: "sk-edgee-user" });
  });

  it("returns no credential at all while Edgee is not configured", async () => {
    const { workspace } = await createResourceTest({
      role: "admin",
      plan: "edgee",
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const credentials = await getLlmCredentials(auth);

    expect(credentials).toEqual({});
  });
});
