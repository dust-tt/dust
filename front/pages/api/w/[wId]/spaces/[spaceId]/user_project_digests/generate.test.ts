import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Temporal workflow to prevent actual workflow execution in tests.
vi.mock("@app/temporal/project_journal_queue/client", () => ({
  launchProjectJournalGenerationWorkflow: vi
    .fn()
    .mockResolvedValue({ isOk: () => true, isErr: () => false }),
}));

import type { Authenticator } from "@app/lib/auth";
import { UserProjectDigestResource } from "@app/lib/resources/user_project_digest_resource";
import { launchProjectJournalGenerationWorkflow } from "@app/temporal/project_journal_queue/client";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { WorkspaceType } from "@app/types/user";

import { handler } from "./generate";

describe("POST /api/w/[wId]/spaces/[spaceId]/user_project_digests/generate", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;

  beforeEach(async () => {
    vi.clearAllMocks();

    const resourceTest = await createResourceTest({});
    workspace = resourceTest.workspace;
    await FeatureFlagFactory.basic("project_butler", workspace);
    auth = resourceTest.authenticator;
  });

  it("should successfully trigger digest generation for a project space", async () => {
    const projectSpace = await SpaceFactory.project(workspace);

    const req = {
      method: "POST",
      query: { wId: workspace.sId, spaceId: projectSpace.sId },
      headers: {},
      cookies: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await handler(req, res, auth, { space: projectSpace });

    expect(launchProjectJournalGenerationWorkflow).toHaveBeenCalledWith({
      auth,
      spaceId: projectSpace.sId,
    });
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it("should reject non-project spaces", async () => {
    const regularSpace = await SpaceFactory.regular(workspace);

    const req = {
      method: "POST",
      query: { wId: workspace.sId, spaceId: regularSpace.sId },
      headers: {},
      cookies: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await handler(req, res, auth, { space: regularSpace });

    expect(launchProjectJournalGenerationWorkflow).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        type: "invalid_request_error",
        message: "User project digests are only available for project spaces.",
      },
    });
  });

  it.skip("should enforce 24-hour cooldown period", async () => {
    const projectSpace = await SpaceFactory.project(workspace);

    // Create a recent digest (less than 24 hours ago).
    await UserProjectDigestResource.create(auth, {
      spaceId: projectSpace.id,
      digest: "Recent digest",
    });

    const req = {
      method: "POST",
      query: { wId: workspace.sId, spaceId: projectSpace.sId },
      headers: {},
      cookies: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await handler(req, res, auth, { space: projectSpace });

    expect(launchProjectJournalGenerationWorkflow).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "rate_limit_error",
          message: expect.stringContaining("Please wait"),
        }),
      })
    );
  });

  it("should allow generation after cooldown period expires", async () => {
    const projectSpace = await SpaceFactory.project(workspace);

    // Create an old digest (more than 24 hours ago).
    const oldDigest = await UserProjectDigestResource.create(auth, {
      spaceId: projectSpace.id,
      digest: "Old digest",
    });

    // Manually set the createdAt to 25 hours ago.
    // @ts-expect-error -- tests ok to bypass the compiler
    await oldDigest.update({
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });

    const req = {
      method: "POST",
      query: { wId: workspace.sId, spaceId: projectSpace.sId },
      headers: {},
      cookies: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await handler(req, res, auth, { space: projectSpace });

    expect(launchProjectJournalGenerationWorkflow).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("should reject non-POST methods", async () => {
    const projectSpace = await SpaceFactory.project(workspace);

    const req = {
      method: "GET",
      query: { wId: workspace.sId, spaceId: projectSpace.sId },
      headers: {},
      cookies: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await handler(req, res, auth, { space: projectSpace });

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST expected.",
      },
    });
  });
});
