import { internalFetch } from "@app/lib/api/internal_fetch";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

const FOLDER_ID = "folder-1";

const CORE_FOLDER_FAKE_RESPONSE = {
  response: {
    folder: {
      data_source_id:
        "21ab3a9994350d8bbd3f76e4c5d233696d6793b271f19407d60d7db825a16381",
      folder_id: FOLDER_ID,
      timestamp: 1738254966701,
      title: "Wonderful folder",
      parent_id: null,
      parents: [FOLDER_ID],
    },
  },
};

const FOLDER_BODY = {
  timestamp: 1738254966701,
  title: "Wonderful folder",
  mime_type: "application/vnd.dust.folder",
};

async function setup() {
  const { workspace, key } = await createPublicApiMockRequest({
    systemKey: true,
    method: "POST",
  });
  const space = await SpaceFactory.global(workspace);
  const dataSourceView = await DataSourceViewFactory.folder(workspace, space);
  return { workspace, key, space, dataSourceView };
}

function postFolder(
  workspace: { sId: string },
  key: { secret: string },
  spaceId: string,
  dsId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/spaces/${spaceId}/data_sources/${dsId}/folders/${FOLDER_ID}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${key.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/v1/w/:wId/spaces/:spaceId/data_sources/:dsId/folders/:fId", () => {
  it("rejects a source_url that is not an http(s) URL", async () => {
    const { workspace, key, space, dataSourceView } = await setup();

    const res = await postFolder(
      workspace,
      key,
      space.sId,
      dataSourceView.dataSource.sId,
      { ...FOLDER_BODY, source_url: "javascript:alert(1)" }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.message).toContain("source_url");
    expect(internalFetch).not.toHaveBeenCalled();
  });

  it("forwards a standardized http(s) source_url", async () => {
    const { workspace, key, space, dataSourceView } = await setup();

    vi.mocked(internalFetch).mockImplementation(async (_url, init) => {
      const req = JSON.parse(String(init?.body));
      expect(req.source_url).toBe("https://example.com/foo");
      return new Response(JSON.stringify(CORE_FOLDER_FAKE_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const res = await postFolder(
      workspace,
      key,
      space.sId,
      dataSourceView.dataSource.sId,
      { ...FOLDER_BODY, source_url: "HTTPS://Example.com/foo" }
    );

    expect(res.status).toBe(200);
    expect(internalFetch).toHaveBeenCalledTimes(1);
  });
});
