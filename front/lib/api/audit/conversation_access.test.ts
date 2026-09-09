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

async function setupActor({
  enableAuditLogs = true,
}: {
  enableAuditLogs?: boolean;
} = {}) {
  const workspace = await WorkspaceFactory.basic();
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "admin" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  if (enableAuditLogs) {
    await FeatureFlagFactory.basic(auth, "audit_logs");
  }
  return { workspace, user, auth };
}

async function createConversationForAuth(auth: Authenticator) {
  return createConversation(auth, {
    title: "Audit conversation",
    visibility: "unlisted",
    spaceId: null,
  });
}

describe("emitConversationAccessedEvent", () => {
  beforeEach(() => {
    vi.mocked(workosAudit.emitAuditLogEvent).mockClear();
    vi.mocked(workosAudit.emitAuditLogEvent).mockResolvedValue(undefined);
  });

  it("records creator when the actor is the first participant", async () => {
    const { auth, user } = await setupActor();
    const conversation = await createConversationForAuth(auth);
    await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: auth.getNonNullableUser().toJSON(),
    });

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

  it("records participant when the actor joined after the creator", async () => {
    const { workspace, auth, user: creator } = await setupActor();
    const conversation = await createConversationForAuth(auth);
    await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: auth.getNonNullableUser().toJSON(),
    });

    const participant = await UserFactory.basic();
    await MembershipFactory.associate(workspace, participant, { role: "user" });
    const participantAuth = await Authenticator.fromUserIdAndWorkspaceId(
      participant.sId,
      workspace.sId
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    await ConversationResource.upsertParticipation(participantAuth, {
      conversation,
      action: "posted",
      user: participantAuth.getNonNullableUser().toJSON(),
    });

    await emitConversationAccessedEvent(participantAuth, conversation);

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "conversation.accessed",
        metadata: expect.objectContaining({
          conversation_id: conversation.sId,
          conversation_creator_id: creator.sId,
          conversation_creator_email: creator.email,
          access_relation: "participant",
        }),
      })
    );
  });

  it("records non_participant when the actor never joined", async () => {
    const { workspace, auth, user: creator } = await setupActor();
    const conversation = await createConversationForAuth(auth);
    await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: auth.getNonNullableUser().toJSON(),
    });

    const outsider = await UserFactory.basic();
    await MembershipFactory.associate(workspace, outsider, { role: "user" });
    const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
      outsider.sId,
      workspace.sId
    );

    await emitConversationAccessedEvent(outsiderAuth, conversation);

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "conversation.accessed",
        metadata: expect.objectContaining({
          conversation_id: conversation.sId,
          conversation_creator_id: creator.sId,
          conversation_creator_email: creator.email,
          access_relation: "non_participant",
        }),
      })
    );
  });

  it("records unowned and omits creator keys when there is no participant", async () => {
    const { auth } = await setupActor();
    const conversation = await createConversationForAuth(auth);

    await emitConversationAccessedEvent(auth, conversation);

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledTimes(1);
    const call = vi.mocked(workosAudit.emitAuditLogEvent).mock.calls[0][0];
    expect(call.action).toBe("conversation.accessed");
    expect(call.metadata).toEqual(
      expect.objectContaining({
        conversation_id: conversation.sId,
        access_relation: "unowned",
      })
    );
    expect(call.metadata).not.toHaveProperty("conversation_creator_id");
    expect(call.metadata).not.toHaveProperty("conversation_creator_email");
  });

  it("returns without querying or emitting when audit logs are disabled", async () => {
    const { auth } = await setupActor({ enableAuditLogs: false });
    const conversation = await createConversationForAuth(auth);
    const listSpy = vi.spyOn(ConversationResource, "listParticipantDetails");
    const fetchSpy = vi.spyOn(UserResource, "fetchByModelIds");

    await emitConversationAccessedEvent(auth, conversation);

    expect(listSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(workosAudit.emitAuditLogEvent).not.toHaveBeenCalled();

    listSpy.mockRestore();
    fetchSpy.mockRestore();
  });
});
