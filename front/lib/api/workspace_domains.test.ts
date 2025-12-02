import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addUseCaseToDomain,
  domainSupportsUseCase,
  getWorkspaceVerifiedDomains,
  removeUseCaseFromDomain,
  updateDomainUseCases,
  upsertWorkspaceDomain,
} from "@app/lib/api/workspace_domains";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { LightWorkspaceType } from "@app/types";

// Mock the WorkOS organization functions
vi.mock("@app/lib/api/workos/organization", () => ({
  listWorkOSOrganizationsWithDomain: vi.fn().mockResolvedValue([]),
  removeWorkOSOrganizationDomain: vi.fn().mockResolvedValue({ isErr: () => false }),
}));

describe("workspace_domains", () => {
  let workspace: LightWorkspaceType;

  beforeEach(async () => {
    const ws = await WorkspaceFactory.basic();
    workspace = renderLightWorkspaceType({ workspace: ws, role: "admin" });
  });

  describe("upsertWorkspaceDomain", () => {
    it("creates a domain with default SSO use case", async () => {
      const domain = faker.internet.domainName();

      const result = await upsertWorkspaceDomain(workspace, { domain });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.domain).toBe(domain);
        expect(result.value.useCases).toEqual(["sso"]);
        expect(result.value.domainAutoJoinEnabled).toBe(false);
      }
    });

    it("creates a domain with custom initial use cases", async () => {
      const domain = faker.internet.domainName();

      const result = await upsertWorkspaceDomain(workspace, {
        domain,
        initialUseCases: ["mcp"],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.useCases).toEqual(["mcp"]);
      }
    });

    it("creates a domain with multiple initial use cases", async () => {
      const domain = faker.internet.domainName();

      const result = await upsertWorkspaceDomain(workspace, {
        domain,
        initialUseCases: ["sso", "mcp"],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.useCases).toEqual(["sso", "mcp"]);
      }
    });

    it("returns existing domain if already exists for same workspace", async () => {
      const domain = faker.internet.domainName();

      // Create first
      const result1 = await upsertWorkspaceDomain(workspace, {
        domain,
        initialUseCases: ["sso"],
      });
      expect(result1.isOk()).toBe(true);

      // Try to create again
      const result2 = await upsertWorkspaceDomain(workspace, {
        domain,
        initialUseCases: ["mcp"], // Different use case
      });

      expect(result2.isOk()).toBe(true);
      if (result2.isOk()) {
        // Should return existing, not create new with mcp
        expect(result2.value.useCases).toEqual(["sso"]);
      }
    });
  });

  describe("getWorkspaceVerifiedDomains", () => {
    it("returns all domains for a workspace", async () => {
      const domain1 = faker.internet.domainName();
      const domain2 = faker.internet.domainName();

      await WorkspaceHasDomainModel.create({
        workspaceId: workspace.id,
        domain: domain1,
        domainAutoJoinEnabled: true,
        useCases: ["sso"],
      });

      await WorkspaceHasDomainModel.create({
        workspaceId: workspace.id,
        domain: domain2,
        domainAutoJoinEnabled: false,
        useCases: ["mcp"],
      });

      const domains = await getWorkspaceVerifiedDomains(workspace);

      expect(domains).toHaveLength(2);
      expect(domains.map((d) => d.domain).sort()).toEqual(
        [domain1, domain2].sort()
      );
    });

    it("filters domains by use case", async () => {
      const domain1 = faker.internet.domainName();
      const domain2 = faker.internet.domainName();
      const domain3 = faker.internet.domainName();

      await WorkspaceHasDomainModel.create({
        workspaceId: workspace.id,
        domain: domain1,
        domainAutoJoinEnabled: true,
        useCases: ["sso"],
      });

      await WorkspaceHasDomainModel.create({
        workspaceId: workspace.id,
        domain: domain2,
        domainAutoJoinEnabled: false,
        useCases: ["mcp"],
      });

      await WorkspaceHasDomainModel.create({
        workspaceId: workspace.id,
        domain: domain3,
        domainAutoJoinEnabled: true,
        useCases: ["sso", "mcp"],
      });

      const ssoDomains = await getWorkspaceVerifiedDomains(workspace, {
        useCase: "sso",
      });
      expect(ssoDomains).toHaveLength(2);
      expect(ssoDomains.map((d) => d.domain).sort()).toEqual(
        [domain1, domain3].sort()
      );

      const mcpDomains = await getWorkspaceVerifiedDomains(workspace, {
        useCase: "mcp",
      });
      expect(mcpDomains).toHaveLength(2);
      expect(mcpDomains.map((d) => d.domain).sort()).toEqual(
        [domain2, domain3].sort()
      );
    });

    it("returns empty array for workspace with no domains", async () => {
      const domains = await getWorkspaceVerifiedDomains(workspace);
      expect(domains).toEqual([]);
    });

    it("includes useCases in returned domains", async () => {
      const domain = faker.internet.domainName();

      await WorkspaceHasDomainModel.create({
        workspaceId: workspace.id,
        domain,
        domainAutoJoinEnabled: false,
        useCases: ["sso", "mcp"],
      });

      const domains = await getWorkspaceVerifiedDomains(workspace);

      expect(domains).toHaveLength(1);
      expect(domains[0].useCases).toEqual(["sso", "mcp"]);
    });
  });

  describe("addUseCaseToDomain", () => {
    it("adds a use case to an existing domain", async () => {
      const domain = faker.internet.domainName();

      await WorkspaceHasDomainModel.create({
        workspaceId: workspace.id,
        domain,
        domainAutoJoinEnabled: false,
        useCases: ["sso"],
      });

      const result = await addUseCaseToDomain(workspace, {
        domain,
        useCase: "mcp",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.useCases).toContain("sso");
        expect(result.value.useCases).toContain("mcp");
      }
    });

    it("is idempotent - adding existing use case returns unchanged", async () => {
      const domain = faker.internet.domainName();

      await WorkspaceHasDomainModel.create({
        workspaceId: workspace.id,
        domain,
        domainAutoJoinEnabled: false,
        useCases: ["sso", "mcp"],
      });

      const result = await addUseCaseToDomain(workspace, {
        domain,
        useCase: "sso",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.useCases).toEqual(["sso", "mcp"]);
      }
    });

    it("returns error for non-existent domain", async () => {
      const result = await addUseCaseToDomain(workspace, {
        domain: "nonexistent.com",
        useCase: "mcp",
      });

      expect(result.isErr()).toBe(true);
    });
  });

  describe("removeUseCaseFromDomain", () => {
    it("removes a use case from a domain", async () => {
      const domain = faker.internet.domainName();

      await WorkspaceHasDomainModel.create({
        workspaceId: workspace.id,
        domain,
        domainAutoJoinEnabled: false,
        useCases: ["sso", "mcp"],
      });

      const result = await removeUseCaseFromDomain(workspace, {
        domain,
        useCase: "mcp",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value?.useCases).toEqual(["sso"]);
      }
    });

    it("deletes domain when removing last use case", async () => {
      const domain = faker.internet.domainName();

      await WorkspaceHasDomainModel.create({
        workspaceId: workspace.id,
        domain,
        domainAutoJoinEnabled: false,
        useCases: ["sso"],
      });

      const result = await removeUseCaseFromDomain(workspace, {
        domain,
        useCase: "sso",
      });

      expect(result.isOk()).toBe(true);
      expect(result.isOk() && result.value).toBe(null);

      // Verify domain was deleted
      const dbDomain = await WorkspaceHasDomainModel.findOne({
        where: { domain, workspaceId: workspace.id },
      });
      expect(dbDomain).toBe(null);
    });

    it("is idempotent - removing non-existent use case returns unchanged", async () => {
      const domain = faker.internet.domainName();

      await WorkspaceHasDomainModel.create({
        workspaceId: workspace.id,
        domain,
        domainAutoJoinEnabled: false,
        useCases: ["sso"],
      });

      const result = await removeUseCaseFromDomain(workspace, {
        domain,
        useCase: "mcp",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value?.useCases).toEqual(["sso"]);
      }
    });

    it("returns error for non-existent domain", async () => {
      const result = await removeUseCaseFromDomain(workspace, {
        domain: "nonexistent.com",
        useCase: "sso",
      });

      expect(result.isErr()).toBe(true);
    });
  });

  describe("updateDomainUseCases", () => {
    it("replaces all use cases", async () => {
      const domain = faker.internet.domainName();

      await WorkspaceHasDomainModel.create({
        workspaceId: workspace.id,
        domain,
        domainAutoJoinEnabled: false,
        useCases: ["sso"],
      });

      const result = await updateDomainUseCases(workspace, {
        domain,
        useCases: ["mcp"],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value?.useCases).toEqual(["mcp"]);
      }
    });

    it("deletes domain when setting empty use cases", async () => {
      const domain = faker.internet.domainName();

      await WorkspaceHasDomainModel.create({
        workspaceId: workspace.id,
        domain,
        domainAutoJoinEnabled: false,
        useCases: ["sso", "mcp"],
      });

      const result = await updateDomainUseCases(workspace, {
        domain,
        useCases: [],
      });

      expect(result.isOk()).toBe(true);
      expect(result.isOk() && result.value).toBe(null);

      // Verify domain was deleted
      const dbDomain = await WorkspaceHasDomainModel.findOne({
        where: { domain, workspaceId: workspace.id },
      });
      expect(dbDomain).toBe(null);
    });

    it("returns error for non-existent domain", async () => {
      const result = await updateDomainUseCases(workspace, {
        domain: "nonexistent.com",
        useCases: ["mcp"],
      });

      expect(result.isErr()).toBe(true);
    });
  });

  describe("domainSupportsUseCase", () => {
    it("returns true when domain has the use case", async () => {
      const domain = faker.internet.domainName();

      await WorkspaceHasDomainModel.create({
        workspaceId: workspace.id,
        domain,
        domainAutoJoinEnabled: false,
        useCases: ["sso", "mcp"],
      });

      expect(
        await domainSupportsUseCase(workspace, { domain, useCase: "sso" })
      ).toBe(true);
      expect(
        await domainSupportsUseCase(workspace, { domain, useCase: "mcp" })
      ).toBe(true);
    });

    it("returns false when domain does not have the use case", async () => {
      const domain = faker.internet.domainName();

      await WorkspaceHasDomainModel.create({
        workspaceId: workspace.id,
        domain,
        domainAutoJoinEnabled: false,
        useCases: ["sso"],
      });

      expect(
        await domainSupportsUseCase(workspace, { domain, useCase: "mcp" })
      ).toBe(false);
    });

    it("returns false for non-existent domain", async () => {
      expect(
        await domainSupportsUseCase(workspace, {
          domain: "nonexistent.com",
          useCase: "sso",
        })
      ).toBe(false);
    });
  });
});
