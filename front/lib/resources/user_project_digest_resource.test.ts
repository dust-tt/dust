import { describe, expect, it } from "vitest";

import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserProjectDigestResource } from "@app/lib/resources/user_project_digest_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserProjectDigestFactory } from "@app/tests/utils/UserProjectDigestFactory";

describe("UserProjectDigestResource", () => {
  describe("fetchBySpace", () => {
    it("should fetch digests for a specific space", async () => {
      const { workspace, authenticator: auth } = await createResourceTest({});

      // Create a project space.
      const projectSpace = await SpaceFactory.project(workspace);

      // Create digests without conversations.
      await UserProjectDigestFactory.createWithoutConversation({
        auth,
        space: projectSpace,
        digest: "First digest",
      });
      await UserProjectDigestFactory.createWithoutConversation({
        auth,
        space: projectSpace,
        digest: "Second digest",
      });

      // Fetch digests.
      const digests = await UserProjectDigestResource.fetchBySpace(
        auth,
        projectSpace.id
      );

      expect(digests).toHaveLength(2);
      expect(digests[0].workspaceId).toBe(workspace.id);
      expect(digests[0].spaceId).toBe(projectSpace.id);
      expect(digests[1].workspaceId).toBe(workspace.id);
      expect(digests[1].spaceId).toBe(projectSpace.id);
    });

    it("should respect limit option", async () => {
      const { workspace, authenticator: auth } = await createResourceTest({});

      const projectSpace = await SpaceFactory.project(workspace);

      // Create multiple digests.
      await UserProjectDigestFactory.createWithoutConversation({
        auth,
        space: projectSpace,
      });
      await UserProjectDigestFactory.createWithoutConversation({
        auth,
        space: projectSpace,
      });
      await UserProjectDigestFactory.createWithoutConversation({
        auth,
        space: projectSpace,
      });

      // Fetch with limit.
      const digests = await UserProjectDigestResource.fetchBySpace(
        auth,
        projectSpace.id,
        { limit: 2 }
      );

      expect(digests).toHaveLength(2);
    });

    it("should return digests ordered by createdAt DESC", async () => {
      const { workspace, authenticator: auth } = await createResourceTest({});

      const projectSpace = await SpaceFactory.project(workspace);

      // Create digests with specific text.
      await UserProjectDigestFactory.createWithoutConversation({
        auth,
        space: projectSpace,
        digest: "First created",
      });
      await UserProjectDigestFactory.createWithoutConversation({
        auth,
        space: projectSpace,
        digest: "Second created",
      });
      await UserProjectDigestFactory.createWithoutConversation({
        auth,
        space: projectSpace,
        digest: "Third created",
      });

      // Fetch digests.
      const digests = await UserProjectDigestResource.fetchBySpace(
        auth,
        projectSpace.id
      );

      expect(digests).toHaveLength(3);
      // Verify all three digests are returned.
      const digestTexts = digests.map((d) => d.digest);
      expect(digestTexts).toContain("First created");
      expect(digestTexts).toContain("Second created");
      expect(digestTexts).toContain("Third created");
      // Verify ordering by checking created timestamps.
      expect(digests[0].createdAt.getTime()).toBeGreaterThanOrEqual(
        digests[1].createdAt.getTime()
      );
      expect(digests[1].createdAt.getTime()).toBeGreaterThanOrEqual(
        digests[2].createdAt.getTime()
      );
    });
  });

  describe("toJSON", () => {
    it("should correctly convert resource to JSON", async () => {
      const { workspace, authenticator: auth } = await createResourceTest({});

      const projectSpace = await SpaceFactory.project(workspace);

      // Create a digest.
      const digestModel =
        await UserProjectDigestFactory.createWithoutConversation({
          auth,
          space: projectSpace,
          digest: "Test digest",
        });

      // Wrap it in a resource.
      const digestResource = new UserProjectDigestResource(
        UserProjectDigestResource.model,
        digestModel.get(),
        { user: auth.getNonNullableUser() }
      );

      const json = digestResource.toJSON();

      expect(json.sId).toBeDefined();
      expect(json.id).toBe(digestResource.id);
      expect(json.createdAt).toBeTypeOf("number");
      expect(json.updatedAt).toBeTypeOf("number");
      expect(json.spaceId).toBe(
        SpaceResource.modelIdToSId({
          id: projectSpace.id,
          workspaceId: workspace.id,
        })
      );
      expect(json.digest).toBe("Test digest");
    });
  });
});
