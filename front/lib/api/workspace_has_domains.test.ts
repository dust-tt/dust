import {
  isHostUnderVerifiedDomain,
  shouldUseStaticIpProxy,
} from "@app/lib/api/workspace_has_domains";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

function uniqueDomain(): string {
  return `${generateRandomModelSId().replaceAll("_", "-").toLowerCase()}.example.com`;
}

describe("shouldUseStaticIpProxy", () => {
  it("returns true only for HTTPS token endpoints under a verified domain", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const domain = uniqueDomain();
    await WorkspaceHasDomainModel.create({
      domain,
      workspaceId: workspace.id,
    });

    await expect(
      shouldUseStaticIpProxy(authenticator, `https://oauth.${domain}/token`)
    ).resolves.toBe(true);

    await expect(
      shouldUseStaticIpProxy(authenticator, `http://oauth.${domain}/token`)
    ).resolves.toBe(false);

    await expect(
      shouldUseStaticIpProxy(
        authenticator,
        "https://unverified.example.com/token"
      )
    ).resolves.toBe(false);

    await expect(
      shouldUseStaticIpProxy(authenticator, "https://127.0.0.1/token")
    ).resolves.toBe(false);
  });
});

describe("isHostUnderVerifiedDomain", () => {
  it("matches subdomains and rejects IP literals", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const domain = uniqueDomain();
    await WorkspaceHasDomainModel.create({
      domain,
      workspaceId: workspace.id,
    });

    await expect(
      isHostUnderVerifiedDomain(authenticator, `api.${domain}`)
    ).resolves.toBe(true);
    await expect(
      isHostUnderVerifiedDomain(authenticator, "127.0.0.1")
    ).resolves.toBe(false);
  });
});
