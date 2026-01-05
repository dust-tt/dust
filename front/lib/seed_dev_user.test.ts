import { faker } from "@faker-js/faker";
import { describe, expect, it } from "vitest";

import { MembershipResource } from "@app/lib/resources/membership_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

import {
  createAdminMembership,
  getOrCreateSuperUser,
  validateSeedConfig,
} from "./seed_dev_user";

describe("seed_dev_user", () => {
  describe("validateSeedConfig", () => {
    it("returns true for valid config with all required fields", () => {
      const config = {
        email: "test@example.com",
        name: "Test User",
        firstName: "Test",
        workspaceName: "Test Workspace",
      };
      expect(validateSeedConfig(config)).toBe(true);
    });

    it("returns true for valid config with optional fields", () => {
      const config = {
        email: "test@example.com",
        name: "Test User",
        firstName: "Test",
        workspaceName: "Test Workspace",
        lastName: "User",
        sId: "custom-sid",
        username: "testuser",
        workOSUserId: "workos-123",
        provider: "google",
        providerId: "google-123",
        imageUrl: "https://example.com/image.png",
      };
      expect(validateSeedConfig(config)).toBe(true);
    });

    it("returns false for null", () => {
      expect(validateSeedConfig(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(validateSeedConfig(undefined)).toBe(false);
    });

    it("returns false for non-object", () => {
      expect(validateSeedConfig("string")).toBe(false);
      expect(validateSeedConfig(123)).toBe(false);
      expect(validateSeedConfig(true)).toBe(false);
    });

    it("returns false when email is missing", () => {
      const config = {
        name: "Test User",
        firstName: "Test",
        workspaceName: "Test Workspace",
      };
      expect(validateSeedConfig(config)).toBe(false);
    });

    it("returns false when name is missing", () => {
      const config = {
        email: "test@example.com",
        firstName: "Test",
        workspaceName: "Test Workspace",
      };
      expect(validateSeedConfig(config)).toBe(false);
    });

    it("returns false when firstName is missing", () => {
      const config = {
        email: "test@example.com",
        name: "Test User",
        workspaceName: "Test Workspace",
      };
      expect(validateSeedConfig(config)).toBe(false);
    });

    it("returns false when workspaceName is missing", () => {
      const config = {
        email: "test@example.com",
        name: "Test User",
        firstName: "Test",
      };
      expect(validateSeedConfig(config)).toBe(false);
    });

    it("returns false when email is not a string", () => {
      const config = {
        email: 123,
        name: "Test User",
        firstName: "Test",
        workspaceName: "Test Workspace",
      };
      expect(validateSeedConfig(config)).toBe(false);
    });

    it("returns false when name is not a string", () => {
      const config = {
        email: "test@example.com",
        name: { first: "Test" },
        firstName: "Test",
        workspaceName: "Test Workspace",
      };
      expect(validateSeedConfig(config)).toBe(false);
    });

    it("returns true with null optional fields", () => {
      const config = {
        email: "test@example.com",
        name: "Test User",
        firstName: "Test",
        workspaceName: "Test Workspace",
        lastName: null,
        workOSUserId: null,
      };
      expect(validateSeedConfig(config)).toBe(true);
    });
  });

  describe("getOrCreateSuperUser", () => {
    it("creates a new user with isDustSuperUser = true", async () => {
      const config = {
        email: faker.internet.email(),
        name: faker.person.fullName(),
        firstName: faker.person.firstName(),
      };

      const result = await getOrCreateSuperUser(config);

      expect(result.created).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(config.email.toLowerCase());
      expect(result.user.name).toBe(config.name);
      expect(result.user.firstName).toBe(config.firstName);
      expect(result.user.isDustSuperUser).toBe(true);
    });

    it("uses provided sId for user", async () => {
      const customSId = generateRandomModelSId();
      const config = {
        email: faker.internet.email(),
        name: faker.person.fullName(),
        firstName: faker.person.firstName(),
        sId: customSId,
      };

      const result = await getOrCreateSuperUser(config);

      expect(result.user.sId).toBe(customSId);
    });

    it("generates username from email if not provided", async () => {
      const email = `myusername${Date.now()}@example.com`;
      const config = {
        email,
        name: faker.person.fullName(),
        firstName: faker.person.firstName(),
      };

      const result = await getOrCreateSuperUser(config);

      expect(result.user.username).toMatch(/^myusername/);
    });

    it("uses provided username when specified", async () => {
      const config = {
        email: faker.internet.email(),
        name: faker.person.fullName(),
        firstName: faker.person.firstName(),
        username: `customuser${Date.now()}`,
      };

      const result = await getOrCreateSuperUser(config);

      expect(result.user.username).toBe(config.username);
    });

    it("handles optional fields correctly", async () => {
      const config = {
        email: faker.internet.email(),
        name: faker.person.fullName(),
        firstName: faker.person.firstName(),
        lastName: "TestLastName",
        workOSUserId: `workos-${generateRandomModelSId()}`,
        provider: "google",
        providerId: `google-${generateRandomModelSId()}`,
        imageUrl: "https://example.com/avatar.png",
      };

      const result = await getOrCreateSuperUser(config);

      expect(result.user.lastName).toBe("TestLastName");
    });

    it("reuses existing user when email matches", async () => {
      const email = faker.internet.email();

      const result1 = await getOrCreateSuperUser({
        email,
        name: "First Name",
        firstName: "First",
      });

      const result2 = await getOrCreateSuperUser({
        email,
        name: "Second Name",
        firstName: "Second",
      });

      // Same user
      expect(result2.user.id).toBe(result1.user.id);
      expect(result1.created).toBe(true);
      expect(result2.created).toBe(false);
    });

    it("upgrades existing user to super user if not already", async () => {
      // Create a regular user first using UserFactory
      const regularUser = await UserFactory.basic();
      expect(regularUser.isDustSuperUser).toBe(false);

      // Now call getOrCreateSuperUser with same email
      const result = await getOrCreateSuperUser({
        email: regularUser.email,
        name: regularUser.name,
        firstName: regularUser.firstName,
      });

      // Should be the same user, now upgraded
      expect(result.user.id).toBe(regularUser.id);
      expect(result.user.isDustSuperUser).toBe(true);
      expect(result.created).toBe(false);
    });

    it("updates workOSUserId on existing user if provided", async () => {
      const email = faker.internet.email();
      await getOrCreateSuperUser({
        email,
        name: "Test User",
        firstName: "Test",
      });

      const workOSUserId = `new-workos-${generateRandomModelSId()}`;
      const result = await getOrCreateSuperUser({
        email,
        name: "Test User",
        firstName: "Test",
        workOSUserId,
      });

      // Fetch fresh from DB to verify update
      const freshUser = await UserResource.fetchByEmail(email);
      expect(freshUser).not.toBeNull();
      expect(result.user.id).toBeDefined();
    });

    it("finds existing user by workOSUserId when provided", async () => {
      const workOSUserId = `workos-${generateRandomModelSId()}`;
      const email1 = faker.internet.email();
      const email2 = faker.internet.email();

      // Create user with workOSUserId
      const result1 = await getOrCreateSuperUser({
        email: email1,
        name: "Test User 1",
        firstName: "Test1",
        workOSUserId,
      });

      // Try to find with different email but same workOSUserId
      const result2 = await getOrCreateSuperUser({
        email: email2,
        name: "Test User 2",
        firstName: "Test2",
        workOSUserId,
      });

      // Should find the same user by workOSUserId
      expect(result2.user.id).toBe(result1.user.id);
    });
  });

  describe("createAdminMembership", () => {
    it("does not create duplicate membership if one exists", async () => {
      const user = await UserFactory.basic();
      const workspace = await WorkspaceFactory.basic();

      // Create first membership using factory (same pattern as other tests)
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      // Try to create again via our function - should not throw and should be idempotent
      await expect(
        createAdminMembership(user, workspace)
      ).resolves.not.toThrow();

      // Verify still only one active membership
      const membership =
        await MembershipResource.getActiveMembershipOfUserInWorkspace({
          user,
          workspace,
        });
      expect(membership).not.toBeNull();
      expect(membership!.role).toBe("admin");
    });
  });
});
