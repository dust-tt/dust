import type { Authenticator } from "@app/lib/auth";
import { WorkspaceVerificationAttemptResource } from "@app/lib/resources/workspace_verification_attempt_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { WorkspaceVerificationAttemptFactory } from "@app/tests/utils/WorkspaceVerificationAttemptFactory";
import type { WorkspaceType } from "@app/types/user";
import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";

describe("WorkspaceVerificationAttemptResource", () => {
  let workspace1: WorkspaceType;

  let authW1: Authenticator;
  let authW2: Authenticator;

  beforeEach(async () => {
    const testSetup1 = await createResourceTest({ role: "admin" });
    workspace1 = testSetup1.workspace;
    authW1 = testSetup1.authenticator;

    const testSetup2 = await createResourceTest({ role: "admin" });
    authW2 = testSetup2.authenticator;
  });

  describe("hashPhoneNumber", () => {
    it("should return a consistent hash for the same phone number", () => {
      const phone = "+33612345678";
      const hash1 = WorkspaceVerificationAttemptResource.hashPhoneNumber(phone);
      const hash2 = WorkspaceVerificationAttemptResource.hashPhoneNumber(phone);
      expect(hash1).toBe(hash2);
    });

    it("should return different hashes for different phone numbers", () => {
      const hash1 =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33612345678");
      const hash2 =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33687654321");
      expect(hash1).not.toBe(hash2);
    });

    it("should return a 64-character hex string (SHA-256)", () => {
      const hash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33612345678");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("makeNew", () => {
    it("should create a new verification attempt", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33612345678");
      const twilioVerificationSid = `VA${faker.string.alphanumeric(32)}`;

      const attempt = await WorkspaceVerificationAttemptResource.makeNew(
        authW1,
        {
          phoneNumberHash,
          twilioVerificationSid,
        }
      );

      expect(attempt).toBeDefined();
      expect(attempt.sId).toMatch(/^wva_/);
      expect(attempt.workspaceId).toBe(workspace1.id);
      expect(attempt.phoneNumberHash).toBe(phoneNumberHash);
      expect(attempt.twilioVerificationSid).toBe(twilioVerificationSid);
      expect(attempt.attemptNumber).toBe(1);
      expect(attempt.verifiedAt).toBeNull();
    });
  });

  describe("makeVerified", () => {
    it("should create a new verified attempt", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33612345678");

      const attempt = await WorkspaceVerificationAttemptResource.makeVerified(
        authW1,
        {
          phoneNumberHash,
        }
      );

      expect(attempt).toBeDefined();
      expect(attempt.workspaceId).toBe(workspace1.id);
      expect(attempt.phoneNumberHash).toBe(phoneNumberHash);
      expect(attempt.twilioVerificationSid).toBeNull();
      expect(attempt.attemptNumber).toBe(1);
      expect(attempt.verifiedAt).toBeInstanceOf(Date);
    });
  });

  describe("status", () => {
    it("should return 'pending' for unverified attempts", async () => {
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1);
      expect(attempt.status).toBe("pending");
    });

    it("should return 'verified' for verified attempts", async () => {
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1);
      await attempt.markVerified();
      expect(attempt.status).toBe("verified");
    });
  });

  describe("isPhoneAlreadyUsed", () => {
    it("should return false when phone hash does not exist", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33699999999");
      const isUsed =
        await WorkspaceVerificationAttemptResource.isPhoneAlreadyUsed(
          phoneNumberHash
        );
      expect(isUsed).toBe(false);
    });

    it("should return false when phone hash exists but is not verified", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33612345678");
      await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash,
      });

      const isUsed =
        await WorkspaceVerificationAttemptResource.isPhoneAlreadyUsed(
          phoneNumberHash
        );
      expect(isUsed).toBe(false);
    });

    it("should return true when phone hash is verified", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33612345678");
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash,
      });
      await attempt.markVerified();

      const isUsed =
        await WorkspaceVerificationAttemptResource.isPhoneAlreadyUsed(
          phoneNumberHash
        );
      expect(isUsed).toBe(true);
    });

    it("should detect verified phone usage across different workspaces", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33612345678");
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash,
      });
      await attempt.markVerified();

      const isUsed =
        await WorkspaceVerificationAttemptResource.isPhoneAlreadyUsed(
          phoneNumberHash
        );
      expect(isUsed).toBe(true);
    });
  });

  describe("fetchByPhoneHash", () => {
    it("should fetch attempt by phone hash", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33612345678");
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash,
      });

      const fetched =
        await WorkspaceVerificationAttemptResource.fetchByPhoneHash(
          authW1,
          phoneNumberHash
        );
      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(attempt.id);
    });

    it("should return null for non-existent phone hash", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33699999999");
      const fetched =
        await WorkspaceVerificationAttemptResource.fetchByPhoneHash(
          authW1,
          phoneNumberHash
        );
      expect(fetched).toBeNull();
    });

    it("should not fetch attempt from different workspace", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33612345678");
      await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash,
      });

      const fetched =
        await WorkspaceVerificationAttemptResource.fetchByPhoneHash(
          authW2,
          phoneNumberHash
        );
      expect(fetched).toBeNull();
    });
  });

  describe("hasVerifiedPhone", () => {
    it("should return false when workspace has no verified phone", async () => {
      await WorkspaceVerificationAttemptFactory.create(authW1);
      const hasVerified =
        await WorkspaceVerificationAttemptResource.hasVerifiedPhone(authW1);
      expect(hasVerified).toBe(false);
    });

    it("should return true when workspace has a verified phone", async () => {
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1);
      await attempt.markVerified();

      const hasVerified =
        await WorkspaceVerificationAttemptResource.hasVerifiedPhone(authW1);
      expect(hasVerified).toBe(true);
    });

    it("should not see verified phones from other workspaces", async () => {
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1);
      await attempt.markVerified();

      const hasVerified =
        await WorkspaceVerificationAttemptResource.hasVerifiedPhone(authW2);
      expect(hasVerified).toBe(false);
    });
  });

  describe("recordNewAttempt", () => {
    it("should increment attempt number and update twilio SID", async () => {
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1);
      expect(attempt.attemptNumber).toBe(1);

      const newSid = `VA${faker.string.alphanumeric(32)}`;
      await attempt.recordNewAttempt(newSid);

      expect(attempt.attemptNumber).toBe(2);
      expect(attempt.twilioVerificationSid).toBe(newSid);
    });

    it("should increment multiple times", async () => {
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1);

      await attempt.recordNewAttempt(`VA${faker.string.alphanumeric(32)}`);
      await attempt.recordNewAttempt(`VA${faker.string.alphanumeric(32)}`);
      await attempt.recordNewAttempt(`VA${faker.string.alphanumeric(32)}`);

      expect(attempt.attemptNumber).toBe(4);
    });
  });

  describe("markVerified", () => {
    it("should set verifiedAt timestamp", async () => {
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1);
      expect(attempt.verifiedAt).toBeNull();

      await attempt.markVerified();

      expect(attempt.verifiedAt).toBeInstanceOf(Date);
    });

    it("should throw error if already verified", async () => {
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1);
      await attempt.markVerified();

      await expect(attempt.markVerified()).rejects.toThrow(
        "Verification attempt already marked as verified"
      );
    });
  });

  describe("toLogJSON", () => {
    it("should serialize to JSON with correct structure", async () => {
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1);
      const json = attempt.toLogJSON();

      expect(json).toEqual({
        id: attempt.id,
        workspaceId: attempt.workspaceId,
        phoneNumberHash: attempt.phoneNumberHash,
        attemptNumber: attempt.attemptNumber,
        status: "pending",
        verifiedAt: null,
      });
    });

    it("should include verifiedAt when verified", async () => {
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1);
      await attempt.markVerified();
      const json = attempt.toLogJSON();

      expect(json.status).toBe("verified");
      expect(json.verifiedAt).toBeDefined();
      expect(typeof json.verifiedAt).toBe("string");
    });
  });

  describe("delete", () => {
    it("should delete an attempt", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33612345678");
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash,
      });

      const result = await attempt.delete(authW1, {});
      expect(result.isOk()).toBe(true);

      const fetched =
        await WorkspaceVerificationAttemptResource.fetchByPhoneHash(
          authW1,
          phoneNumberHash
        );
      expect(fetched).toBeNull();
    });

    it("should not delete attempt from different workspace", async () => {
      const phoneNumberHash =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33612345678");
      const attempt = await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash,
      });

      const result = await attempt.delete(authW2, {});
      expect(result.isOk()).toBe(true);

      const fetched =
        await WorkspaceVerificationAttemptResource.fetchByPhoneHash(
          authW1,
          phoneNumberHash
        );
      expect(fetched).toBeDefined();
    });
  });

  describe("deleteAllForWorkspace", () => {
    it("should delete all attempts for a workspace", async () => {
      const hash1 =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33612345678");
      const hash2 =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33687654321");
      const hashOtherWorkspace =
        WorkspaceVerificationAttemptResource.hashPhoneNumber("+33699999999");

      await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash: hash1,
      });
      await WorkspaceVerificationAttemptFactory.create(authW1, {
        phoneNumberHash: hash2,
      });
      await WorkspaceVerificationAttemptFactory.create(authW2, {
        phoneNumberHash: hashOtherWorkspace,
      });

      await WorkspaceVerificationAttemptResource.deleteAllForWorkspace(authW1);

      const fetched1 =
        await WorkspaceVerificationAttemptResource.fetchByPhoneHash(
          authW1,
          hash1
        );
      const fetched2 =
        await WorkspaceVerificationAttemptResource.fetchByPhoneHash(
          authW1,
          hash2
        );
      const fetchedOther =
        await WorkspaceVerificationAttemptResource.fetchByPhoneHash(
          authW2,
          hashOtherWorkspace
        );

      expect(fetched1).toBeNull();
      expect(fetched2).toBeNull();
      expect(fetchedOther).toBeDefined();
    });
  });
});
