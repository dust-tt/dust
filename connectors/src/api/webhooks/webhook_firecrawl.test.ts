import type { Server } from "node:http";

import { Ok } from "@dust-tt/client";
import express from "express";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { webhookFirecrawlAPIHandler } from "./webhook_firecrawl";

const mocks = vi.hoisted(() => ({
  fetchById: vi.fn(),
  fetchByConnectorId: vi.fn(),
  launchStarted: vi.fn(),
  launchPage: vi.fn(),
  launchCompleted: vi.fn(),
  launchFailed: vi.fn(),
}));

vi.mock("@connectors/resources/connector_resource", () => ({
  ConnectorResource: { fetchById: mocks.fetchById },
}));

vi.mock("@connectors/resources/webcrawler_resource", () => ({
  WebCrawlerConfigurationResource: {
    fetchByConnectorId: mocks.fetchByConnectorId,
  },
}));

vi.mock("@connectors/connectors/webcrawler/temporal/client", () => ({
  launchFirecrawlCrawlStartedWorkflow: mocks.launchStarted,
  launchFirecrawlCrawlPageWorkflow: mocks.launchPage,
  launchFirecrawlCrawlCompletedWorkflow: mocks.launchCompleted,
  launchFirecrawlCrawlFailedWorkflow: mocks.launchFailed,
}));

describe("POST /webhooks/:secret/firecrawl", () => {
  let server: Server;
  let baseUrl = "";

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.post("/firecrawl", webhookFirecrawlAPIHandler);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected the test server to listen on a TCP port");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.fetchById.mockResolvedValue({ id: 42, isPaused: () => false });
    for (const launch of [
      mocks.launchStarted,
      mocks.launchPage,
      mocks.launchCompleted,
      mocks.launchFailed,
    ]) {
      launch.mockResolvedValue(new Ok(undefined));
    }
  });

  function postWebhook(body: Record<string, unknown>) {
    return fetch(`${baseUrl}/firecrawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        metadata: { connectorId: "42" },
        error: null,
        data: [],
        ...body,
      }),
    });
  }

  it("launches workflows for events of the connector's current crawl", async () => {
    mocks.fetchByConnectorId.mockResolvedValue({ crawlId: "crawl-1" });

    const completed = await postWebhook({
      type: "crawl.completed",
      id: "crawl-1",
    });
    const page = await postWebhook({
      type: "crawl.page",
      id: "crawl-1",
      data: [{ markdown: "", metadata: { scrapeId: "scrape-1" } }],
    });

    expect(completed.status).toBe(200);
    expect(page.status).toBe(200);
    expect(mocks.launchCompleted).toHaveBeenCalledWith(42, "crawl-1");
    expect(mocks.launchPage).toHaveBeenCalledWith(42, "crawl-1", "scrape-1");
  });

  it.each([
    { name: "a different crawl", crawlId: "crawl-1", id: "crawl-forged" },
    { name: "no running crawl", crawlId: null, id: "crawl-forged" },
    { name: "a missing id", crawlId: null, id: null },
  ])("ignores events for $name", async ({ crawlId, id }) => {
    mocks.fetchByConnectorId.mockResolvedValue({ crawlId });

    for (const type of [
      "crawl.started",
      "crawl.page",
      "crawl.completed",
      "crawl.failed",
    ]) {
      const response = await postWebhook({
        type,
        id,
        data: [{ markdown: "", metadata: { scrapeId: "scrape-1" } }],
      });
      expect(response.status).toBe(200);
    }

    expect(mocks.launchStarted).not.toHaveBeenCalled();
    expect(mocks.launchPage).not.toHaveBeenCalled();
    expect(mocks.launchCompleted).not.toHaveBeenCalled();
    expect(mocks.launchFailed).not.toHaveBeenCalled();
  });

  it("ignores events for connectors without a webcrawler configuration", async () => {
    mocks.fetchByConnectorId.mockResolvedValue(null);

    const response = await postWebhook({
      type: "crawl.completed",
      id: "crawl-1",
    });

    expect(response.status).toBe(200);
    expect(mocks.launchCompleted).not.toHaveBeenCalled();
  });
});
