import {
  getAssociatedMeetings,
  getFilePublicUrl,
  getMeeting,
  searchCrmObjects,
} from "@app/lib/api/actions/servers/hubspot/client";
import { ApiException } from "@hubspot/api-client/lib/codegen/crm/objects/apis/exception";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@hubspot/api-client", () => ({
  Client: class {
    crm = {
      objects: {
        basicApi: { getById: mocks.request },
        searchApi: { doSearch: mocks.request },
      },
      associations: { v4: { basicApi: { getPage: mocks.request } } },
      properties: {
        coreApi: { getAll: async () => ({ results: [] }) },
      },
    };
    files = { filesApi: { getById: mocks.request } };
  },
}));

describe.each([
  {
    name: "getMeeting",
    run: () => getMeeting("test-token", "meeting-id"),
    fallback: null,
  },
  {
    name: "getFilePublicUrl",
    run: () => getFilePublicUrl("test-token", "file-id"),
    fallback: null,
  },
  {
    name: "getAssociatedMeetings",
    run: () => getAssociatedMeetings("test-token", "contacts", "contact-id"),
    fallback: [],
  },
  {
    name: "searchCrmObjects",
    run: () =>
      searchCrmObjects({
        accessToken: "test-token",
        objectType: "custom-object",
      }),
    fallback: { results: [], paging: undefined },
  },
])("$name error handling", ({ run, fallback }) => {
  beforeEach(() => {
    mocks.request.mockReset();
  });

  it.each([
    new ApiException(404, "Not found", undefined, {}),
    { code: 404 },
  ])("keeps the not-found fallback for numeric 404 errors: %j", async (error) => {
    mocks.request.mockRejectedValue(error);

    await expect(run()).resolves.toEqual(fallback);
    expect(mocks.request).toHaveBeenCalledOnce();
  });

  it.each([
    { error: null, message: "null" },
    { error: undefined, message: "" },
    { error: "Network unavailable", message: "Network unavailable" },
    { error: { code: "404" }, message: '{"code":"404"}' },
  ])("normalizes other thrown values: $error", async ({ error, message }) => {
    mocks.request.mockRejectedValue(error);

    await expect(run()).rejects.toEqual(new Error(message));
    expect(mocks.request).toHaveBeenCalledOnce();
  });

  it("preserves non-404 Error instances", async () => {
    const error = new ApiException(500, "Internal server error", undefined, {});
    mocks.request.mockRejectedValue(error);

    await expect(run()).rejects.toBe(error);
  });
});
