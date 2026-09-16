import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { SharingGrantResource } from "@app/lib/resources/sharing_grant_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { makeSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SharingGrantFactory } from "@app/tests/utils/SharingGrantFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { frameContentType } from "@app/types/files";
import { assert, describe, expect, it, vi } from "vitest";

const { mockEmitAuditLogEvent } = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn(),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();
  return { ...actual, emitAuditLogEvent: mockEmitAuditLogEvent };
});

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
      value: " @EXAMPLE.COM ",
    });

    expect(
      (await SharingGrantResource.findForEmail(file, " ALICE@EXAMPLE.COM "))
        ?.sId
    ).toBe(domain.sId);
    expect(
      (await SharingGrantResource.findForEmail(file, "bob@example.com"))?.sId
    ).toBe(domain.sId);
    expect(
      await SharingGrantResource.findForEmail(file, "alice@sub.example.com")
    ).toBeNull();
    expect(
      await SharingGrantResource.findForEmail(file, "alice@evil-example.com")
    ).toBeNull();
    expect(
      await SharingGrantResource.findForEmail(
        file,
        "alice@example.com.evil.com"
      )
    ).toBeNull();
    expect(
      await SharingGrantResource.findForEmail(file, "example.com")
    ).toBeNull();
    expect(await SharingGrantResource.listForFile(file)).toHaveLength(1);
  });

  it("requires Frame invite permission before updating or auditing revocation", async () => {
    const { authenticator, workspace, file } = await setup();
    const member = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member, { role: "user" });
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      member.sId,
      workspace.sId
    );
    expect(await memberAuth.hasWorkspacePermission("invite", "frame")).toBe(
      false
    );
    const grant = await SharingGrantFactory.create(authenticator, file, {
      kind: "domain",
      value: "example.com",
    });
    mockEmitAuditLogEvent.mockClear();

    const denied = await grant.revoke(memberAuth);
    assert(denied.isErr());
    expect(denied.error.code).toBe("unauthorized");
    expect(grant.revokedAt).toBeNull();
    const unchanged = await SharingGrantResource.fetchById(file, grant.sId);
    expect(unchanged?.revokedAt).toBeNull();
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();

    await GroupPermissionResource.setForEverybody(authenticator, {
      grantType: "invite",
      resourceType: "frame",
    });
    const permittedAuth = await Authenticator.fromUserIdAndWorkspaceId(
      member.sId,
      workspace.sId
    );
    expect((await grant.revoke(permittedAuth)).isOk()).toBe(true);
    expect(grant.revokedAt).not.toBeNull();
    expect(mockEmitAuditLogEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: "frame.domain_grant_revoked",
        auth: permittedAuth,
      })
    );
  });

  it("revokes overlapping grants independently and preserves viewer history", async () => {
    const { authenticator, file } = await setup();
    const domain = await SharingGrantFactory.create(authenticator, file, {
      kind: "domain",
      value: "example.com",
    });
    const email = await SharingGrantFactory.create(authenticator, file, {
      kind: "email",
      value: "alice@example.com",
    });
    await file.recordView({
      verifiedEmail: "alice@example.com",
      viewedAt: new Date("2026-09-14T10:00:00Z"),
    });
    const viewers = await file.getViewerSummaries();
    expect(viewers).toHaveLength(1);
    expect(
      (await SharingGrantResource.findForEmail(file, "alice@example.com"))?.sId
    ).toBe(email.sId);

    const revokedEmail = await email.revoke(authenticator);
    assert(revokedEmail.isOk());
    expect(email.revokedAt).not.toBeNull();
    expect(
      (await SharingGrantResource.findForEmail(file, "alice@example.com"))?.sId
    ).toBe(domain.sId);
    expect((await domain.revoke(authenticator)).isOk()).toBe(true);
    expect(
      await SharingGrantResource.findForEmail(file, "alice@example.com")
    ).toBeNull();
    expect(await SharingGrantResource.listForFile(file)).toHaveLength(0);
    expect(
      await SharingGrantResource.listForFile(file, { includeRevoked: true })
    ).toHaveLength(2);
    expect(await file.getViewerSummaries()).toEqual(viewers);

    const replacement = await SharingGrantFactory.create(authenticator, file, {
      kind: "domain",
      value: "example.com",
    });
    expect(replacement.sId).not.toBe(domain.sId);
    expect((await domain.revoke(authenticator)).isErr()).toBe(true);
    expect(
      (await SharingGrantResource.findForEmail(file, "bob@example.com"))?.sId
    ).toBe(replacement.sId);
  });

  it("returns normalized Resources with consistent granting-user serialization", async () => {
    const { authenticator, user, file } = await setup();
    mockEmitAuditLogEvent.mockClear();
    const result = await SharingGrantResource.add(authenticator, file, {
      emails: [" ALICE@EXAMPLE.COM ", "alice@example.com"],
      domains: ["@EXAMPLE.COM", "example.com"],
    });
    assert(result.isOk());
    const created = result.value;
    expect(created).toHaveLength(2);
    expect(
      created.every((grant) => grant instanceof SharingGrantResource)
    ).toBe(true);
    expect(created.map((grant) => grant.target)).toEqual([
      { kind: "email", value: "alice@example.com" },
      { kind: "domain", value: "example.com" },
    ]);
    expect(mockEmitAuditLogEvent).toHaveBeenCalledTimes(2);
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: authenticator,
        action: "frame.email_grant_added",
        targets: [
          expect.objectContaining({
            type: "workspace",
            id: authenticator.getNonNullableWorkspace().sId,
          }),
          expect.objectContaining({ type: "frame", id: file.sId }),
        ],
        metadata: { frame_name: file.fileName, emails: "alice@example.com" },
      })
    );
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "frame.domain_grant_added",
        metadata: { frame_name: file.fileName, domains: "example.com" },
      })
    );
    mockEmitAuditLogEvent.mockClear();
    const duplicate = await SharingGrantResource.add(authenticator, file, {
      emails: ["alice@example.com"],
      domains: ["EXAMPLE.COM"],
    });
    assert(duplicate.isOk());
    expect(duplicate.value).toEqual([]);
    const empty = await SharingGrantResource.add(authenticator, file, {});
    assert(empty.isOk());
    expect(empty.value).toEqual([]);
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();

    const listed = await SharingGrantResource.listForFile(file);
    const found = await SharingGrantResource.findForEmail(
      file,
      "alice@example.com"
    );
    assert(found);
    const revoked = await found.revoke(authenticator);
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
      value: "example.com",
    });
    expect(await SharingGrantResource.listForFile(otherFile)).toEqual([]);
    expect(await SharingGrantResource.listForFile(otherWorkspace.file)).toEqual(
      []
    );
    expect(
      await SharingGrantResource.findForEmail(otherFile, "alice@example.com")
    ).toBeNull();
    expect(
      await SharingGrantResource.findForEmail(
        otherWorkspace.file,
        "alice@example.com"
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

    await expect(grant.revoke(otherWorkspace.authenticator)).rejects.toThrow(
      "workspace mismatch"
    );

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
      (await SharingGrantResource.findForEmail(file, "alice@example.com"))?.sId
    ).toBe(grant.sId);
  });

  it("returns only actual inserts when concurrent batches partially overlap", async () => {
    const { authenticator, file } = await setup();
    const [first, second] = await Promise.all([
      SharingGrantResource.add(authenticator, file, {
        domains: ["example.com", "alpha.co"],
      }),
      SharingGrantResource.add(authenticator, file, {
        domains: ["example.com", "beta.co"],
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
      "example.com",
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
      value: "example.com",
    });
    const otherInstance = await SharingGrantResource.fetchById(file, grant.sId);
    assert(otherInstance);
    mockEmitAuditLogEvent.mockClear();
    const results = await Promise.all([
      grant.revoke(authenticator),
      otherInstance.revoke(authenticator),
    ]);
    expect(results.filter((result) => result.isOk())).toHaveLength(1);
    expect(results.filter((result) => result.isErr())).toHaveLength(1);
    expect(mockEmitAuditLogEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        auth: authenticator,
        action: "frame.domain_grant_revoked",
        metadata: { frame_name: file.fileName, domain: "example.com" },
      })
    );
  });

  it("emits after commit and omits rolled-back creations and revocations", async () => {
    const { authenticator, file } = await setup();
    mockEmitAuditLogEvent.mockClear();
    await withTransaction(async (parent) => {
      const transaction = await frontSequelize.transaction({
        transaction: parent,
      });
      const added = await SharingGrantResource.add(
        authenticator,
        file,
        {
          domains: ["example.com"],
        },
        { transaction }
      );
      assert(added.isOk());
      expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
      await transaction.commit();
      expect(mockEmitAuditLogEvent).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          action: "frame.domain_grant_added",
        })
      );
      const [grant] = added.value;
      assert(grant);
      mockEmitAuditLogEvent.mockClear();
      const rollback = await frontSequelize.transaction({
        transaction: parent,
      });
      const extra = await SharingGrantResource.add(
        authenticator,
        file,
        {
          emails: ["alice@example.com"],
        },
        { transaction: rollback }
      );
      assert(extra.isOk());
      expect(
        (await grant.revoke(authenticator, { transaction: rollback })).isOk()
      ).toBe(true);
      expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
      await rollback.rollback();
      expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
      const remaining = await SharingGrantResource.listForFile(file, {
        transaction: parent,
      });
      expect(remaining.map((g) => g.target)).toEqual([
        { kind: "domain", value: "example.com" },
      ]);
      const revoke = await frontSequelize.transaction({ transaction: parent });
      expect(
        (
          await remaining[0].revoke(authenticator, { transaction: revoke })
        ).isOk()
      ).toBe(true);
      expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
      await revoke.commit();
      expect(mockEmitAuditLogEvent).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          action: "frame.domain_grant_revoked",
        })
      );
    });
  });

  it("preserves the legacy email interface while domain grants exist", async () => {
    const { authenticator, file } = await setup();
    const domain = await SharingGrantFactory.create(authenticator, file, {
      kind: "domain",
      value: "example.com",
    });
    expect(domain.toLegacyJSON()).toBeNull();
    expect(
      (
        await file.revokeSharingGrant(authenticator, { grantId: domain.id })
      ).isErr()
    ).toBe(true);
    expect(
      (await file.revokeSharingGrant(authenticator, { grantId: -1 })).isErr()
    ).toBe(true);

    const email = await SharingGrantFactory.create(authenticator, file, {
      kind: "email",
      value: "alice@example.com",
    });
    expect(email.lastViewedAt).toBeNull();
    const emailResource = await SharingGrantResource.findForEmail(
      file,
      "ALICE@EXAMPLE.COM"
    );
    assert(emailResource);
    await emailResource.recordLegacyView();
    expect(emailResource.lastViewedAt).toEqual(expect.any(Date));
    expect(emailResource.toLegacyJSON()?.lastViewedAt).toBe(
      emailResource.lastViewedAt?.getTime()
    );
    const recorded = await SharingGrantResource.fetchById(file, email.sId);
    const viewed = recorded?.toLegacyJSON();
    expect(viewed?.id).toBe(email.id);
    expect(viewed?.lastViewedAt).toEqual(expect.any(Number));
    expect(
      (
        await file.revokeSharingGrant(authenticator, { grantId: email.id })
      ).isOk()
    ).toBe(true);
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
    const activeGrants = await SharingGrantResource.listForFile(file);
    expect(activeGrants.map((grant) => grant.sId)).toEqual([domain.sId]);
    expect(await file.listAllSharingGrants()).toHaveLength(1);
    expect(
      (await SharingGrantResource.findForEmail(file, "alice@example.com"))?.sId
    ).toBe(domain.sId);
  });

  it("deletes grants with their file", async () => {
    const { authenticator, file } = await setup();
    const grant = await SharingGrantFactory.create(authenticator, file, {
      kind: "domain",
      value: "example.com",
    });
    const result = await file.delete(authenticator);
    assert(result.isOk());
    expect(await SharingGrantResource.fetchById(file, grant.sId)).toBeNull();
  });

  it.each([
    "*.example.com",
    "https://example.com",
    "alice@example.com",
    `${"a".repeat(64)}.co`,
  ])("returns an Err for invalid domain %s without writing grants", async (domain) => {
    const { authenticator, file } = await setup();
    const result = await SharingGrantResource.add(authenticator, file, {
      emails: ["alice@example.com"],
      domains: ["valid.co", domain],
    });
    assert(result.isErr());
    expect(result.error.code).toBe("invalid_request_error");
    expect(await SharingGrantResource.listForFile(file)).toEqual([]);
  });

  it("returns an Err for an invalid email without writing grants", async () => {
    const { authenticator, file } = await setup();
    const result = await SharingGrantResource.add(authenticator, file, {
      emails: ["alice@example.com", "invalid"],
      domains: ["example.com"],
    });
    assert(result.isErr());
    expect(result.error.code).toBe("invalid_request_error");
    expect(await SharingGrantResource.listForFile(file)).toEqual([]);
  });
});
