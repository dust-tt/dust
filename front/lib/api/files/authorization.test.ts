import { upsertTableFromCsv } from "@app/lib/api/tables";
import { Authenticator } from "@app/lib/auth";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import assert from "assert";
import { describe, expect, it } from "vitest";
import { resolveScopedFilePath } from "../mcp_server/tools/files/resolve";
import { canReadSourceFile } from "./authorization";

describe("canReadSourceFile", () => {
  it("denies an upsert_table file in a space the caller cannot read and allows a member", async () => {
    const { authenticator, workspace, user, globalSpace } =
      await createResourceTest({ role: "user" });
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const file = await FileFactory.csv(authenticator, user, {
      useCase: "upsert_table",
      useCaseMetadata: { spaceId: restrictedSpace.sId },
      status: "ready",
    });

    const outsider = await UserFactory.basic();
    await MembershipFactory.associate(workspace, outsider, { role: "user" });
    const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
      outsider.sId,
      workspace.sId
    );

    expect(await canReadSourceFile(outsiderAuth, file)).toBe(false);
    expect(await canReadSourceFile(authenticator, file)).toBe(false);

    const memberGroup =
      await restrictedSpace.fetchManualMemberGroup(authenticator);
    await GroupFactory.withMembers(authenticator, memberGroup, [user]);
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    expect(await canReadSourceFile(memberAuth, file)).toBe(true);

    const globalFile = await FileFactory.csv(authenticator, user, {
      useCase: "upsert_table",
      useCaseMetadata: { spaceId: globalSpace.sId },
      status: "ready",
    });
    expect(await canReadSourceFile(outsiderAuth, globalFile)).toBe(true);
  });

  it("grants a system key a user-less upsert_table upload and denies a regular key", async () => {
    const { auth: systemAuth, workspace } = await createPublicApiMockRequest({
      systemKey: true,
    });
    const file = await FileFactory.csv(systemAuth, null, {
      useCase: "upsert_table",
      status: "ready",
    });

    expect(await canReadSourceFile(systemAuth, file)).toBe(true);

    const regularKey = await KeyFactory.regular(
      (await GroupFactory.defaults(workspace)).globalGroup
    );
    const regularAuth = await Authenticator.fromKey(regularKey, workspace.sId);
    expect(await canReadSourceFile(regularAuth, file)).toBe(false);
  });

  it("limits unattached uploads to the file owner", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "user",
    });
    const other = await UserFactory.basic();
    await MembershipFactory.associate(workspace, other, { role: "user" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      other.sId,
      workspace.sId
    );

    const conversationFile = await FileFactory.create(authenticator, user, {
      contentType: "application/pdf",
      fileName: "pending.pdf",
      fileSize: 12,
      status: "ready",
      useCase: "conversation",
    });
    const documentFile = await FileFactory.create(authenticator, user, {
      contentType: "text/plain",
      fileName: "notes.txt",
      fileSize: 12,
      status: "ready",
      useCase: "upsert_document",
    });
    const avatar = await FileFactory.create(authenticator, user, {
      contentType: "image/png",
      fileName: "avatar.png",
      fileSize: 12,
      status: "ready",
      useCase: "avatar",
    });

    expect(await canReadSourceFile(authenticator, conversationFile)).toBe(true);
    expect(await canReadSourceFile(otherAuth, conversationFile)).toBe(false);
    expect(await canReadSourceFile(authenticator, documentFile)).toBe(true);
    expect(await canReadSourceFile(otherAuth, documentFile)).toBe(false);
    expect(await canReadSourceFile(authenticator, avatar)).toBe(true);
    expect(await canReadSourceFile(otherAuth, avatar)).toBe(false);
  });

  it("lets a workspace admin read branding uploaded by another member", async () => {
    const {
      authenticator: adminAuth,
      workspace,
      user: admin,
    } = await createResourceTest({ role: "admin" });
    const owner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, owner, { role: "user" });
    const ownerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      owner.sId,
      workspace.sId
    );
    const member = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member, { role: "user" });
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      member.sId,
      workspace.sId
    );
    const file = await FileFactory.create(ownerAuth, owner, {
      contentType: "image/png",
      fileName: "logo.png",
      fileSize: 12,
      status: "ready",
      useCase: "workspace_branding",
      useCaseMetadata: { asset: "logo" },
    });

    expect(await canReadSourceFile(ownerAuth, file)).toBe(true);
    expect(await canReadSourceFile(adminAuth, file)).toBe(true);
    expect(await canReadSourceFile(memberAuth, file)).toBe(false);
    expect(admin.sId).not.toBe(owner.sId);
  });
});

describe("upsertTableFromCsv", () => {
  it("does not ingest a CSV the caller cannot read", async () => {
    const { authenticator, workspace, user, globalSpace } =
      await createResourceTest({ role: "user" });
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const file = await FileFactory.csv(authenticator, user, {
      useCase: "project_context",
      useCaseMetadata: { spaceId: restrictedSpace.sId },
      status: "ready",
    });
    const other = await UserFactory.basic();
    await MembershipFactory.associate(workspace, other, { role: "user" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      other.sId,
      workspace.sId
    );
    const view = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      other
    );

    const result = await upsertTableFromCsv({
      auth: otherAuth,
      dataSource: view.dataSource,
      tableName: "imported",
      tableDescription: "from a file the caller cannot read",
      tableId: "table-id",
      tableTimestamp: null,
      tableTags: [],
      tableParentId: null,
      tableParents: ["table-id"],
      fileId: file.sId,
      truncate: true,
      title: "imported",
      mimeType: "text/csv",
      sourceUrl: null,
    });

    assert(result.isErr());
    expect(result.error).toEqual({
      type: "not_found_error",
      notFoundError: {
        type: "file_not_found",
        message:
          "The file associated with the fileId you provided was not found",
      },
    });
  });
});

describe("resolveScopedFilePath", () => {
  it("does not reveal another conversation's mount path", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "user",
    });
    const victimConversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });
    const other = await UserFactory.basic();
    await MembershipFactory.associate(workspace, other, { role: "user" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      other.sId,
      workspace.sId
    );
    const file = await FileFactory.create(authenticator, user, {
      contentType: "application/pdf",
      fileName: "secret.pdf",
      fileSize: 12,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: victimConversation.sId },
      mountFilePath: `w/${workspace.sId}/conversations/${victimConversation.sId}/files/secret.pdf`,
    });

    const result = await resolveScopedFilePath(otherAuth, {
      scope: { type: "conversation", conversation_id: "attacker-conversation" },
      fileId: file.sId,
    });

    assert(result.isErr());
    expect(result.error).not.toContain(victimConversation.sId);
    expect(result.error).not.toContain("secret.pdf");
    expect(result.error).not.toContain("Resolved path");
  });
});
