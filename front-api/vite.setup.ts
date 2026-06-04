// front-api tests reuse front's vitest setup, then register a shared config mock
// so honoApp can load MCP routes and tests get stable config values.
import { vi } from "vitest";

import "../front/vite.setup.ts";

vi.mock("@app/lib/api/config", async (importOriginal) => {
  const { createAppConfigMock } = await import(
    "@app/tests/utils/mocks/app_config"
  );
  return createAppConfigMock(importOriginal, {
    getApiBaseUrl: () => "http://localhost:3000",
    getAppUrl: () => "http://localhost:3000",
    getCoreAPIConfig: () => ({
      url: "http://localhost:9999",
      apiKey: "foo",
    }),
    getConnectorsAPIConfig: () => ({
      url: "http://localhost:0",
      secret: "test",
      webhookSecret: "test",
    }),
    getDocumentRendererUrl: () => "http://localhost:3100",
    getDustInviteTokenSecret: () => "test-invite-secret-32chars!!!!!",
    getInvitationEmailTemplate: () => "d-test",
    getOAuthAPIConfig: () => ({
      url: "https://oauth-api.example.com",
      apiKey: "test-api-key",
    }),
    getPokeAppUrl: () => "http://localhost:3000/poke",
    getSendgridApiKey: () => "SG.test",
    getSupportEmailAddress: () => ({
      name: "Dust team",
      email: "test@dust.tt",
    }),
    getVizJwtSecret: () => "test-secret",
    getVizPublicUrl: () => "https://viz.dust.tt",
  });
});
