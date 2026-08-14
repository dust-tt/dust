import { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { ActivationRecommendationResource } from "@app/lib/resources/activation_recommendation_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { ModelId } from "@app/types/shared/model_id";
import { describe, expect, it } from "vitest";

const makeRec = (
  auth: Authenticator,
  { activationPodId }: { activationPodId?: ModelId } = {}
) =>
  ActivationRecommendationResource.makeNew(auth, {
    title: "Try the Slack integration",
    content: "Connect your workspace Slack to get started.",
    conversationId: null,
    activationPodId,
  });

async function makeActivationPod(
  auth: Authenticator,
  pod: SpaceResource
): Promise<ActivationPodResource> {
  return ActivationPodResource.makeNew(auth, {
    pod,
    user: auth.getNonNullableUser(),
  });
}

describe("ActivationRecommendationResource", () => {
  describe("makeNew", () => {
    it("creates a recommendation with status 'suggested'", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      const rec = await makeRec(authenticator);

      expect(rec.status).toBe("suggested");
      expect(rec.title).toBe("Try the Slack integration");
      expect(rec.content).toBe("Connect your workspace Slack to get started.");
      expect(rec.sId).toBeTruthy();
    });
  });

  describe("fetchById", () => {
    it("returns the recommendation by sId", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const rec = await makeRec(authenticator);

      const fetched = await ActivationRecommendationResource.fetchById(
        authenticator,
        rec.sId
      );

      expect(fetched).not.toBeNull();
      expect(fetched!.sId).toBe(rec.sId);
    });

    it("returns null for a non-existent sId", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      const fetched = await ActivationRecommendationResource.fetchById(
        authenticator,
        "arc_nonexistent"
      );

      expect(fetched).toBeNull();
    });

    it("does not return a recommendation from another workspace", async () => {
      const { authenticator: auth1 } = await createResourceTest({
        role: "user",
      });
      const { authenticator: auth2 } = await createResourceTest({
        role: "user",
      });
      const rec = await makeRec(auth1);

      const fetched = await ActivationRecommendationResource.fetchById(
        auth2,
        rec.sId
      );

      expect(fetched).toBeNull();
    });
  });

  describe("fetchByUser", () => {
    it("returns all recommendations for the calling user", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      await makeRec(authenticator);
      await makeRec(authenticator);

      const recs =
        await ActivationRecommendationResource.fetchByUser(authenticator);

      expect(recs.length).toBeGreaterThanOrEqual(2);
    });

    it("does not return recommendations from another user in the same workspace", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "user",
      });
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, {
        role: "user",
      });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      await makeRec(otherAuth);

      const recs =
        await ActivationRecommendationResource.fetchByUser(authenticator);

      expect(recs).toHaveLength(0);
    });
  });

  describe("updateFields", () => {
    it("updates the status of a recommendation", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const rec = await makeRec(authenticator);

      await rec.updateFields({ status: "executed" });

      const updated = await ActivationRecommendationResource.fetchById(
        authenticator,
        rec.sId
      );
      expect(updated!.status).toBe("executed");
    });

    it("does not update when called with no fields", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const rec = await makeRec(authenticator);

      await rec.updateFields({});

      const fetched = await ActivationRecommendationResource.fetchById(
        authenticator,
        rec.sId
      );
      expect(fetched!.status).toBe("suggested");
    });
  });

  describe("ownership check in update_recommendation handler", () => {
    it("userId on the record matches the creating user", async () => {
      const { authenticator, user } = await createResourceTest({
        role: "user",
      });
      const rec = await makeRec(authenticator);

      expect(rec.userId).toBe(user.id);
    });

    it("a different user in the same workspace has a different userId", async () => {
      const { workspace, authenticator, user } = await createResourceTest({
        role: "user",
      });
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, {
        role: "user",
      });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      const rec = await makeRec(authenticator);

      expect(rec.userId).toBe(user.id);
      expect(rec.userId).not.toBe(otherAuth.getNonNullableUser().id);
    });
  });

  describe("deleteAllForActivationPod", () => {
    it("deletes recommendations linked to the activation pod", async () => {
      const { authenticator, globalSpace } = await createResourceTest({
        role: "admin",
      });
      const activationPod = await makeActivationPod(authenticator, globalSpace);
      const rec = await makeRec(authenticator, {
        activationPodId: activationPod.id,
      });

      await ActivationRecommendationResource.deleteAllForActivationPod(
        authenticator,
        activationPod
      );

      const fetched = await ActivationRecommendationResource.fetchById(
        authenticator,
        rec.sId
      );
      expect(fetched).toBeNull();
    });

    it("does not delete recommendations linked to a different activation pod", async () => {
      const { authenticator, globalSpace, systemSpace } =
        await createResourceTest({ role: "admin" });
      const activationPod = await makeActivationPod(authenticator, globalSpace);
      const otherActivationPod = await makeActivationPod(
        authenticator,
        systemSpace
      );
      const otherRec = await makeRec(authenticator, {
        activationPodId: otherActivationPod.id,
      });

      await ActivationRecommendationResource.deleteAllForActivationPod(
        authenticator,
        activationPod
      );

      const fetched = await ActivationRecommendationResource.fetchById(
        authenticator,
        otherRec.sId
      );
      expect(fetched).not.toBeNull();
    });

    it("does not delete recommendations that aren't linked to any activation pod", async () => {
      const { authenticator, globalSpace } = await createResourceTest({
        role: "admin",
      });
      const activationPod = await makeActivationPod(authenticator, globalSpace);
      const unlinkedRec = await makeRec(authenticator);

      await ActivationRecommendationResource.deleteAllForActivationPod(
        authenticator,
        activationPod
      );

      const fetched = await ActivationRecommendationResource.fetchById(
        authenticator,
        unlinkedRec.sId
      );
      expect(fetched).not.toBeNull();
    });
  });
});
