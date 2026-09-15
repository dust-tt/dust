import { FileResource } from "@app/lib/resources/file_resource";
import { SharingGrantResource } from "@app/lib/resources/sharing_grant_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SharingGrantFactory } from "@app/tests/utils/SharingGrantFactory";
import { frameContentType } from "@app/types/files";
import { assert, describe, expect, it } from "vitest";

async function setup() {
  const context = await createResourceTest({ role: "admin" });
  const file = await FileFactory.create(context.authenticator, context.user, {
    contentType: frameContentType,
    fileName: "frame.html",
    fileSize: 100,
    status: "ready",
    useCase: "conversation",
  });
  await file.ensureShareableFrame(context.authenticator);
  return { ...context, file };
}

describe("SharingGrantResource", () => {
  it("matches the exact verified domain without creating per-viewer grants", async () => {
    const { authenticator, file } = await setup();
    const domain = await SharingGrantFactory.create(authenticator, file, {
      kind: "domain",
      value: " @DAVID.CO ",
    });

    expect(
      (await SharingGrantResource.findForEmail(file, " ALICE@DAVID.CO "))?.sId
    ).toBe(domain.sId);
    expect(
      (await SharingGrantResource.findForEmail(file, "bob@david.co"))?.sId
    ).toBe(domain.sId);
    expect(
      await SharingGrantResource.findForEmail(file, "alice@sub.david.co")
    ).toBeNull();
    expect(
      await SharingGrantResource.findForEmail(file, "alice@evil-david.co")
    ).toBeNull();
    expect(
      await SharingGrantResource.findForEmail(file, "alice@david.co.evil.com")
    ).toBeNull();
    expect(
      await SharingGrantResource.findForEmail(file, "david.co")
    ).toBeNull();
    expect(await SharingGrantResource.listForFile(file)).toHaveLength(1);
  });

  it("revokes overlapping grants independently and preserves viewer history", async () => {
    const { authenticator, file } = await setup();
    const domain = await SharingGrantFactory.create(authenticator, file, {
      kind: "domain",
      value: "david.co",
    });
    const email = await SharingGrantFactory.create(authenticator, file, {
      kind: "email",
      value: "alice@david.co",
    });
    await file.recordView({
      verifiedEmail: "alice@david.co",
      viewedAt: new Date("2026-09-14T10:00:00Z"),
    });
    const viewers = await file.getViewerSummaries();
    expect(viewers).toHaveLength(1);
    expect(
      (await SharingGrantResource.findForEmail(file, "alice@david.co"))?.sId
    ).toBe(email.sId);

    const revokedEmail = await email.revoke();
    assert(revokedEmail.isOk());
    expect(email.revokedAt).not.toBeNull();
    expect(
      (await SharingGrantResource.findForEmail(file, "alice@david.co"))?.sId
    ).toBe(domain.sId);
    expect((await domain.revoke()).isOk()).toBe(true);
    expect(
      await SharingGrantResource.findForEmail(file, "alice@david.co")
    ).toBeNull();
    expect(await SharingGrantResource.listForFile(file)).toHaveLength(0);
    expect(
      await SharingGrantResource.listForFile(file, { includeRevoked: true })
    ).toHaveLength(2);
    expect(await file.getViewerSummaries()).toEqual(viewers);

    const replacement = await SharingGrantFactory.create(authenticator, file, {
      kind: "domain",
      value: "david.co",
    });
    expect(replacement.sId).not.toBe(domain.sId);
    expect((await domain.revoke()).isErr()).toBe(true);
    expect(
      (await SharingGrantResource.findForEmail(file, "bob@david.co"))?.sId
    ).toBe(replacement.sId);
  });

  it("returns normalized Resources with consistent granting-user serialization", async () => {
    const { authenticator, user, file } = await setup();
    const result = await SharingGrantResource.add(authenticator, file, {
      emails: [" ALICE@DAVID.CO ", "alice@david.co"],
      domains: ["@DAVID.CO", "david.co"],
    });
    assert(result.isOk());
    const created = result.value;
    expect(created).toHaveLength(2);
    expect(
      created.every((grant) => grant instanceof SharingGrantResource)
    ).toBe(true);
    expect(created.map((grant) => grant.target)).toEqual([
      { kind: "email", value: "alice@david.co" },
      { kind: "domain", value: "david.co" },
    ]);
    const duplicate = await SharingGrantResource.add(authenticator, file, {
      emails: ["alice@david.co"],
      domains: ["DAVID.CO"],
    });
    assert(duplicate.isOk());
    expect(duplicate.value).toEqual([]);
    const empty = await SharingGrantResource.add(authenticator, file, {});
    assert(empty.isOk());
    expect(empty.value).toEqual([]);

    const listed = await SharingGrantResource.listForFile(file);
    const found = await SharingGrantResource.findForEmail(
      file,
      "alice@david.co"
    );
    assert(found);
    const revoked = await found.revoke();
    assert(revoked.isOk());
    const fetched = await SharingGrantResource.fetchById(file, found.sId);
    assert(fetched);
    for (const grant of [...created, ...listed, found, fetched]) {
      expect(grant.grantingUser?.sId).toBe(user.sId);
      expect(grant.toJSON()).toEqual({
        sId: grant.sId,
        target: grant.target,
        grantedAt: grant.grantedAt.getTime(),
        grantedBy: user.toJSON(),
        expiresAt: null,
        revokedAt: grant.revokedAt?.getTime() ?? null,
      });
    }
  });

  it("scopes reads, creation and revocation to the file and workspace", async () => {
    const { authenticator, user, file } = await setup();
    const otherFile = await FileFactory.create(authenticator, user, {
      contentType: frameContentType,
      fileName: "other.html",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
    });
    const otherWorkspace = await setup();
    const grant = await SharingGrantFactory.create(authenticator, file, {
      kind: "domain",
      value: "david.co",
    });
    expect(await SharingGrantResource.listForFile(otherFile)).toEqual([]);
    expect(await SharingGrantResource.listForFile(otherWorkspace.file)).toEqual(
      []
    );
    expect(
      await SharingGrantResource.findForEmail(otherFile, "alice@david.co")
    ).toBeNull();
    expect(
      await SharingGrantResource.findForEmail(
        otherWorkspace.file,
        "alice@david.co"
      )
    ).toBeNull();
    expect(
      await SharingGrantResource.fetchById(otherFile, grant.sId)
    ).toBeNull();
    expect(
      await SharingGrantResource.fetchById(otherWorkspace.file, grant.sId)
    ).toBeNull();
    await expect(
      SharingGrantResource.add(otherWorkspace.authenticator, file, {
        domains: ["other.co"],
      })
    ).rejects.toThrow("workspace mismatch");

    const forgedId = makeSId("sharing_grant", {
      id: grant.id,
      workspaceId: otherWorkspace.file.workspaceId,
    });
    expect(
      await SharingGrantResource.fetchById(otherWorkspace.file, forgedId)
    ).toBeNull();
    expect(await SharingGrantResource.fetchById(file, file.sId)).toBeNull();
    expect(
      await SharingGrantResource.fetchById(file, String(grant.id))
    ).toBeNull();
    await grant.delete(otherWorkspace.authenticator);
    expect(
      (await SharingGrantResource.findForEmail(file, "alice@david.co"))?.sId
    ).toBe(grant.sId);
  });

  it("returns only actual inserts when concurrent batches partially overlap", async () => {
    const { authenticator, file } = await setup();
    const [first, second] = await Promise.all([
      SharingGrantResource.add(authenticator, file, {
        domains: ["david.co", "alpha.co"],
      }),
      SharingGrantResource.add(authenticator, file, {
        domains: ["david.co", "beta.co"],
      }),
    ]);
    assert(first.isOk());
    assert(second.isOk());
    const created = [...first.value, ...second.value];
    expect(created).toHaveLength(3);
    expect(new Set(created.map((grant) => grant.sId)).size).toBe(3);
    expect(created.map((grant) => grant.target.value).sort()).toEqual([
      "alpha.co",
      "beta.co",
      "david.co",
    ]);
    const listed = await SharingGrantResource.listForFile(file);
    expect(
      created
        .map((grant) => grant.toJSON())
        .sort((a, b) => a.sId.localeCompare(b.sId))
    ).toEqual(
      listed
        .map((grant) => grant.toJSON())
        .sort((a, b) => a.sId.localeCompare(b.sId))
    );
  });

  it("reports a single successful revocation for concurrent requests", async () => {
    const { authenticator, file } = await setup();
    const grant = await SharingGrantFactory.create(authenticator, file, {
      kind: "domain",
      value: "david.co",
    });
    const otherInstance = await SharingGrantResource.fetchById(file, grant.sId);
    assert(otherInstance);
    const results = await Promise.all([grant.revoke(), otherInstance.revoke()]);
    expect(results.filter((result) => result.isOk())).toHaveLength(1);
    expect(results.filter((result) => result.isErr())).toHaveLength(1);
  });

  it("preserves the legacy email interface while domain grants exist", async () => {
    const { authenticator, file } = await setup();
    const workspace = await WorkspaceResource.fetchById(
      authenticator.getNonNullableWorkspace().sId
    );
    assert(workspace);
    const domain = await SharingGrantFactory.create(authenticator, file, {
      kind: "domain",
      value: "david.co",
    });
    expect(domain.toLegacyJSON()).toBeNull();
    expect(await file.listActiveSharingGrants()).toEqual([]);
    expect(
      (await file.revokeSharingGrant({ grantId: domain.id })).isErr()
    ).toBe(true);
    expect((await file.revokeSharingGrant({ grantId: -1 })).isErr()).toBe(true);
    expect(
      await FileResource.getActiveGrantForEmail(workspace, {
        email: "alice@david.co",
        shareableFileId: domain.shareableFileId,
      })
    ).toBeNull();

    const added = await file.addSharingGrants(authenticator, {
      emails: ["alice@david.co"],
    });
    assert(added.isOk());
    const [email] = added.value;
    assert(email);
    expect(email.lastViewedAt).toBeNull();
    const emailResource = await SharingGrantResource.findLegacyEmailGrant(
      workspace,
      { email: email.email, shareableFileId: domain.shareableFileId }
    );
    assert(emailResource);
    await emailResource.recordLegacyView();
    expect(emailResource.lastViewedAt).toEqual(expect.any(Date));
    expect(emailResource.toLegacyJSON()?.lastViewedAt).toBe(
      emailResource.lastViewedAt?.getTime()
    );
    await FileResource.recordGrantView(workspace, {
      email: "ALICE@DAVID.CO",
      shareableFileId: domain.shareableFileId,
    });
    const viewed = await FileResource.getActiveGrantForEmail(workspace, {
      email: "alice@david.co",
      shareableFileId: domain.shareableFileId,
    });
    expect(viewed?.id).toBe(email.id);
    expect(viewed?.lastViewedAt).toEqual(expect.any(Number));
    expect((await file.revokeSharingGrant({ grantId: email.id })).isOk()).toBe(
      true
    );
    await emailResource.recordLegacyView();
    await domain.recordLegacyView();
    expect(
      (
        await SharingGrantResource.fetchById(file, emailResource.sId)
      )?.lastViewedAt?.getTime()
    ).toBe(viewed?.lastViewedAt);
    expect(
      (await SharingGrantResource.fetchById(file, domain.sId))?.lastViewedAt
    ).toBeNull();
    expect(await file.listActiveSharingGrants()).toEqual([]);
    expect(await file.listAllSharingGrants()).toHaveLength(1);
    expect(
      (await SharingGrantResource.findForEmail(file, "alice@david.co"))?.sId
    ).toBe(domain.sId);
  });

  it("deletes grants with their file", async () => {
    const { authenticator, file } = await setup();
    const grant = await SharingGrantFactory.create(authenticator, file, {
      kind: "domain",
      value: "david.co",
    });
    const result = await file.delete(authenticator);
    assert(result.isOk());
    expect(await SharingGrantResource.fetchById(file, grant.sId)).toBeNull();
  });

  it.each([
    "*.david.co",
    "https://david.co",
    "alice@david.co",
    `${"a".repeat(64)}.co`,
  ])("returns an Err for invalid domain %s without writing grants", async (domain) => {
    const { authenticator, file } = await setup();
    const result = await SharingGrantResource.add(authenticator, file, {
      emails: ["alice@david.co"],
      domains: ["valid.co", domain],
    });
    assert(result.isErr());
    expect(result.error.code).toBe("invalid_request_error");
    expect(await SharingGrantResource.listForFile(file)).toEqual([]);
  });

  it("returns an Err for an invalid email without writing grants", async () => {
    const { authenticator, file } = await setup();
    const result = await SharingGrantResource.add(authenticator, file, {
      emails: ["alice@david.co", "invalid"],
      domains: ["david.co"],
    });
    assert(result.isErr());
    expect(result.error.code).toBe("invalid_request_error");
    expect(await SharingGrantResource.listForFile(file)).toEqual([]);
  });
});
