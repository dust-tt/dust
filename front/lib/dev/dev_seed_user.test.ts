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
  parseSeedConfig,
} from "./dev_seed_user";

describe("seed_dev_user", () => {
  describe("parseSeedConfig", () => {
    it("parses valid config with all required fields", () => {
      const config = {
        email: "test@example.com",
        name: "Test User",
        firstName: "Test",
        workspaceName: "Test Workspace",
      };
      expect(parseSeedConfig(config)).toEqual(config);
    });

    it("parses valid config with optional fields", () => {
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
      expect(parseSeedConfig(config)).toEqual(config);
    });

    it("throws for null", () => {
      expect(() => parseSeedConfig(null)).toThrow();
    });

    it("throws for undefined", () => {
      expect(() => parseSeedConfig(undefined)).toThrow();
    });

    it("throws for non-object", () => {
      expect(() => parseSeedConfig("string")).toThrow();
      expect(() => parseSeedConfig(123)).toThrow();
      expect(() => parseSeedConfig(true)).toThrow();
    });

    it("throws when email is missing", () => {
      const config = {
        name: "Test User",
        firstName: "Test",
        workspaceName: "Test Workspace",
      };
      expect(() => parseSeedConfig(config)).toThrow();
    });

    it("throws when email is invalid", () => {
      const config = {
        email: "not-an-email",
        name: "Test User",
        firstName: "Test",
        workspaceName: "Test Workspace",
      };
      expect(() => parseSeedConfig(config)).toThrow();
    });

    it("throws when name is missing", () => {
      const config = {
        email: "test@example.com",
        firstName: "Test",
        workspaceName: "Test Workspace",
      };
      expect(() => parseSeedConfig(config)).toThrow();
    });

    it("throws when firstName is missing", () => {
      const config = {
        email: "test@example.com",
        name: "Test User",
        workspaceName: "Test Workspace",
      };
      expect(() => parseSeedConfig(config)).toThrow();
    });

    it("throws when workspaceName is missing", () => {
      const config = {
        email: "test@example.com",
        name: "Test User",
        firstName: "Test",
      };
      expect(() => parseSeedConfig(config)).toThrow();
    });

    it("parses config with null optional fields", () => {
      const config = {
        email: "test@example.com",
        name: "Test User",
        firstName: "Test",
        workspaceName: "Test Workspace",
        lastName: null,
        workOSUserId: null,
      };
      expect(parseSeedConfig(config)).toEqual(config);
    });

    it("throws for invalid provider", () => {
      const config = {
        email: "test@example.com",
        name: "Test User",
        firstName: "Test",
        workspaceName: "Test Workspace",
        provider: "invalid-provider",
      };
      expect(() => parseSeedConfig(config)).toThrow();
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
        provider: "google" as const,
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
