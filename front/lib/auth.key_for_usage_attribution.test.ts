import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

describe("Authenticator.keyForUsageAttribution", () => {
  it("returns the request's own key when no attribution key is set", async () => {
    const workspace = await WorkspaceFactory.basic();
    const { globalGroup } =
      await GroupResource.makeDefaultsForWorkspace(workspace);
    const key = await KeyFactory.regular(globalGroup);

    const auth = await Authenticator.fromKey(key, workspace.sId);

    expect(auth.keyForUsageAttribution()).toEqual({
      id: key.id,
      name: key.name,
    });
  });

  it("returns the attribution key over the request's own key", async () => {
    const workspace = await WorkspaceFactory.basic();
    const { globalGroup } =
      await GroupResource.makeDefaultsForWorkspace(workspace);
    const systemKey = await KeyFactory.system(globalGroup);
    const originatingKey = await KeyFactory.regular(globalGroup);

    const auth = (
      await Authenticator.fromKey(systemKey, workspace.sId)
    ).withAttributionKey({ id: originatingKey.id, name: originatingKey.name });

    expect(auth.keyForUsageAttribution()).toEqual({
      id: originatingKey.id,
      name: originatingKey.name,
    });
    // Authorization still runs on the system key: only usage moved.
    expect(auth.key()?.id).toBe(systemKey.id);
    expect(auth.key()?.isSystem).toBe(true);
  });

  it("returns null when the request carries no key", async () => {
    const workspace = await WorkspaceFactory.basic();
    await GroupResource.makeDefaultsForWorkspace(workspace);

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    expect(auth.key()).toBeNull();
    expect(auth.keyForUsageAttribution()).toBeNull();
  });
});
