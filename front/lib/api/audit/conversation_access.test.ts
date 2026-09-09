import { createConversation } from "@app/lib/api/assistant/conversation";
import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emitConversationAccessedEvent } from "./conversation_access";

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual<typeof workosAudit>(
    "@app/lib/api/audit/workos_audit"
  );
  return {
    ...actual,
    emitAuditLogEvent: vi.fn(),
  };
});

async function setup({ auditLogs = true }: { auditLogs?: boolean } = {}) {
  const workspace = await WorkspaceFactory.basic();
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "admin" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  if (auditLogs) {
    await FeatureFlagFactory.basic(auth, "audit_logs");
  }
  const conversation = await createConversation(auth, {
    title: "Audit conversation",
    visibility: "unlisted",
    spaceId: null,
  });
  return { workspace, user, auth, conversation };
}

async function join(
  auth: Authenticator,
  conversation: Awaited<ReturnType<typeof createConversation>>
) {
  await ConversationResource.upsertParticipation(auth, {
    conversation,
    action: "posted",
    user: auth.getNonNullableUser().toJSON(),
  });
}

describe("emitConversationAccessedEvent", () => {
  beforeEach(() => {
    vi.mocked(workosAudit.emitAuditLogEvent).mockClear();
    vi.mocked(workosAudit.emitAuditLogEvent).mockResolvedValue(undefined);
  });

  it("sets access_relation=creator for the first participant", async () => {
    const { auth, user, conversation } = await setup();
    await join(auth, conversation);

    await emitConversationAccessedEvent(auth, conversation);

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "conversation.accessed",
        metadata: expect.objectContaining({
          conversation_id: conversation.sId,
          conversation_creator_id: user.sId,
          conversation_creator_email: user.email,
          access_relation: "creator",
        }),
      })
    );
  });

  it("sets access_relation=participant for a later joiner", async () => {
    const { workspace, auth, user: creator, conversation } = await setup();
    await join(auth, conversation);

    const participant = await UserFactory.basic();
    await MembershipFactory.associate(workspace, participant, { role: "user" });
    const participantAuth = await Authenticator.fromUserIdAndWorkspaceId(
      participant.sId,
      workspace.sId
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    await join(participantAuth, conversation);

    await emitConversationAccessedEvent(participantAuth, conversation);

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          conversation_creator_id: creator.sId,
          access_relation: "participant",
        }),
      })
    );
  });

  it("sets access_relation=non_participant when the actor never joined", async () => {
    const { workspace, auth, conversation } = await setup();
    await join(auth, conversation);

    const outsider = await UserFactory.basic();
    await MembershipFactory.associate(workspace, outsider, { role: "user" });
    const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
      outsider.sId,
      workspace.sId
    );

    await emitConversationAccessedEvent(outsiderAuth, conversation);

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          access_relation: "non_participant",
        }),
      })
    );
  });

  it("omits creator metadata when there is no participant", async () => {
    const { auth, conversation } = await setup();

    await emitConversationAccessedEvent(auth, conversation);

    const metadata = vi.mocked(workosAudit.emitAuditLogEvent).mock.calls[0][0]
      .metadata;
    expect(metadata).toEqual(
      expect.objectContaining({
        conversation_id: conversation.sId,
        access_relation: "no_creator",
      })
    );
    expect(metadata).not.toHaveProperty("conversation_creator_id");
    expect(metadata).not.toHaveProperty("conversation_creator_email");
  });

  it("skips participant queries and emit when audit logs are disabled", async () => {
    const { auth, conversation } = await setup({ auditLogs: false });
    const firstSpy = vi.spyOn(
      ConversationResource,
      "fetchFirstParticipantUserId"
    );
    const fetchSpy = vi.spyOn(UserResource, "fetchByModelIds");

    await emitConversationAccessedEvent(auth, conversation);

    expect(firstSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(workosAudit.emitAuditLogEvent).not.toHaveBeenCalled();

    firstSpy.mockRestore();
    fetchSpy.mockRestore();
  });
});
