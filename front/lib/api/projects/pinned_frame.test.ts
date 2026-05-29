import { SCOPED_PREFIX_POD } from "@app/lib/api/file_system";
import { validatePinnedFramePath } from "@app/lib/api/projects/pinned_frame";
import { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import assert from "assert";
import { describe, expect, it } from "vitest";

async function setupProjectSpace(): Promise<{
  auth: Authenticator;
  space: SpaceResource;
}> {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const user = auth.getNonNullableUser();
  const space = await SpaceFactory.project(workspace, user.id);
  const addRes = await space.addMembers(auth, { userIds: [user.sId] });
  assert(addRes.isOk(), "Failed to add user to project space");
  // Re-fetch auth so it picks up the new group memberships required by forPod's canRead check.
  const projectAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  return { auth: projectAuth, space };
}

describe("validatePinnedFramePath", () => {
  it("returns Ok(null) when path is null", async () => {
    const { auth, space } = await setupProjectSpace();
    const res = await validatePinnedFramePath(auth, space, null);
    assert(res.isOk());
    expect(res.value).toBeNull();
  });

  it("accepts a canonical pod-{spaceId}/... path and returns it unchanged", async () => {
    const { auth, space } = await setupProjectSpace();
    const canonicalPath = `${SCOPED_PREFIX_POD}${space.sId}/frame.md`;

    const res = await validatePinnedFramePath(auth, space, canonicalPath);

    assert(res.isOk());
    expect(res.value).toBe(canonicalPath);
  });

  it("normalizes a legacy 'project/...' path to the canonical format", async () => {
    const { auth, space } = await setupProjectSpace();

    const res = await validatePinnedFramePath(auth, space, "project/frame.md");

    assert(res.isOk());
    expect(res.value).toBe(`${SCOPED_PREFIX_POD}${space.sId}/frame.md`);
  });

  it("normalizes a legacy 'pod/...' path to the canonical format", async () => {
    const { auth, space } = await setupProjectSpace();

    const res = await validatePinnedFramePath(auth, space, "pod/frame.md");

    assert(res.isOk());
    expect(res.value).toBe(`${SCOPED_PREFIX_POD}${space.sId}/frame.md`);
  });

  it("returns Err for a path with an unrecognised prefix", async () => {
    const { auth, space } = await setupProjectSpace();

    const res = await validatePinnedFramePath(auth, space, "other/frame.md");

    expect(res.isErr()).toBe(true);
  });
});
