import { ExternalViewer } from "@app/lib/api/share/external_viewer";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import assert from "assert";
import { describe, expect, expectTypeOf, it } from "vitest";

describe("ExternalViewer", () => {
  it("carries the workspace with the none role, its active plan and the verified email", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const workspaceResource = await WorkspaceResource.fetchByModelId(
      workspace.id
    );
    assert(workspaceResource);

    const viewer = await ExternalViewer.fromVerifiedEmail(workspaceResource, {
      email: "viewer@example.com",
    });

    expect(viewer.workspace()).toMatchObject({
      id: workspace.id,
      sId: workspace.sId,
      role: "none",
    });
    expect(viewer.plan()).toEqual(authenticator.plan());
    expect(viewer.viewerEmail()).toBe("viewer@example.com");
  });

  it("is not interchangeable with an Authenticator and has no public constructor", () => {
    expectTypeOf<ExternalViewer>().not.toExtend<Authenticator>();
    expectTypeOf<Authenticator>().not.toExtend<ExternalViewer>();
    expectTypeOf<typeof ExternalViewer>().not.toExtend<
      new (...args: never[]) => ExternalViewer
    >();
  });

  it("is what anonymous Frame function calls take", () => {
    expectTypeOf<typeof SandboxFunctionResource.fetchActiveForAnonymous>()
      .parameter(0)
      .toEqualTypeOf<ExternalViewer>();
    expectTypeOf<SandboxFunctionResource["invokeAnonymously"]>()
      .parameter(0)
      .toEqualTypeOf<ExternalViewer>();
  });
});
