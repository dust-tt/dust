import {
  INVITATION_EXPIRATION_TIME_MS,
  INVITATION_EXPIRATION_TIME_SEC,
} from "@app/lib/constants/invitation";
import { MembershipInvitationModel } from "@app/lib/models/membership_invitation";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import {
  getInvitationTokenStartMs,
  getMembershipInvitationToken,
} from "@app/lib/utils/invitation_token";
import { verify } from "jsonwebtoken";
import { beforeAll, describe, expect, it, vi } from "vitest";

const TEST_SECRET = "test-invite-secret";

beforeAll(() => {
  vi.stubEnv("DUST_INVITE_TOKEN_SECRET", TEST_SECRET);
});

// Minimal MembershipInvitationType shape needed for token tests.
function makeInvitation(
  createdAt: number,
  reminderSentAt: number | null = null
) {
  return {
    id: 1,
    sId: "test-sid",
    status: "pending" as const,
    inviteEmail: "user@example.com",
    initialRole: "user" as const,
    createdAt,
    reminderSentAt,
    expiresAt:
      getInvitationTokenStartMs({
        createdAt,
        reminderSentAt,
      }) + INVITATION_EXPIRATION_TIME_MS,
    isExpired: false,
  };
}

describe("getInvitationTokenStartMs", () => {
  it("returns createdAt when reminderSentAt is null", () => {
    const createdAt = Date.now() - 1000;
    expect(
      getInvitationTokenStartMs({
        createdAt,
        reminderSentAt: null,
      })
    ).toBe(createdAt);
  });

  it("returns reminderSentAt when set", () => {
    const createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const reminderSentAt = Date.now() - 1000;
    expect(getInvitationTokenStartMs({ createdAt, reminderSentAt })).toBe(
      reminderSentAt
    );
  });
});

describe("getMembershipInvitationToken", () => {
  const secret = TEST_SECRET;

  it("anchors token on createdAt when no reminder has been sent", () => {
    const createdAt = Date.now() - 1000;
    const invitation = makeInvitation(createdAt);
    const token = getMembershipInvitationToken(invitation);
    const decoded = verify(token, secret) as { iat: number; exp: number };

    expect(decoded.iat).toBe(Math.floor(createdAt / 1000));
    expect(decoded.exp).toBe(
      Math.floor(createdAt / 1000) + INVITATION_EXPIRATION_TIME_SEC
    );
  });

  it("anchors token on reminderSentAt after reminder is sent", () => {
    const createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const reminderSentAt = Date.now() - 1000;
    const invitation = makeInvitation(createdAt, reminderSentAt);
    const token = getMembershipInvitationToken(invitation);
    const decoded = verify(token, secret) as { iat: number; exp: number };

    expect(decoded.iat).toBe(Math.floor(reminderSentAt / 1000));
    expect(decoded.exp).toBe(
      Math.floor(reminderSentAt / 1000) + INVITATION_EXPIRATION_TIME_SEC
    );
  });

  it("old token generated before reminder remains expired after reminderSentAt is set", () => {
    const createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const invitationBeforeReminder = makeInvitation(createdAt, null);
    const oldToken = getMembershipInvitationToken(invitationBeforeReminder);

    const reminderSentAt = Date.now() - 1000;
    const invitationAfterReminder = makeInvitation(createdAt, reminderSentAt);
    const newToken = getMembershipInvitationToken(invitationAfterReminder);

    expect(() => verify(oldToken, secret)).toThrow();
    expect(() => verify(newToken, secret)).not.toThrow();
  });

  it("new token expires 7 days after reminderSentAt", () => {
    const createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const reminderSentAt = Date.now() - 1000;
    const invitation = makeInvitation(createdAt, reminderSentAt);
    const token = getMembershipInvitationToken(invitation);
    const decoded = verify(token, secret) as { exp: number };

    expect(decoded.exp).toBe(
      Math.floor(reminderSentAt / 1000) + INVITATION_EXPIRATION_TIME_SEC
    );
  });
});

describe("claimReminderSlot", () => {
  it("updates the in-memory resource so toJSON() and token generation use the new reminderSentAt", async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const createdAt = now - 8 * 24 * 60 * 60 * 1000;

    const resource = new MembershipInvitationResource(
      MembershipInvitationModel,
      {
        id: 1,
        sId: "test-sid",
        workspaceId: 1,
        inviteEmail: "user@example.com",
        status: "pending",
        initialRole: "user",
        createdAt: new Date(createdAt),
        updatedAt: new Date(createdAt),
        reminderSentAt: null,
        invitedUserId: null,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { workspace: {} as any }
    );

    vi.spyOn(MembershipInvitationModel, "update").mockResolvedValueOnce([
      1,
    ] as unknown as [number]);

    const claimed = await resource.claimReminderSlot();

    expect(claimed).toBe(true);
    expect(resource.reminderSentAt).toEqual(new Date(now));
    expect(resource.toJSON().reminderSentAt).toBe(now);
    const token = getMembershipInvitationToken(resource.toJSON());
    const decoded = verify(token, TEST_SECRET) as { iat: number };
    expect(decoded.iat).toBe(Math.floor(now / 1000));

    vi.useRealTimers();
  });

  it("returns false and leaves the resource unchanged when already claimed", async () => {
    const createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000;

    const resource = new MembershipInvitationResource(
      MembershipInvitationModel,
      {
        id: 1,
        sId: "test-sid",
        workspaceId: 1,
        inviteEmail: "user@example.com",
        status: "pending",
        initialRole: "user",
        createdAt: new Date(createdAt),
        updatedAt: new Date(createdAt),
        reminderSentAt: null,
        invitedUserId: null,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { workspace: {} as any }
    );

    vi.spyOn(MembershipInvitationModel, "update").mockResolvedValueOnce([
      0,
      [],
    ] as unknown as [number]);

    const claimed = await resource.claimReminderSlot();

    expect(claimed).toBe(false);
    expect(resource.reminderSentAt).toBeNull();
  });
});

describe("expiresAt on serialized invitation", () => {
  it("equals createdAt + 7 days when no reminder", () => {
    const createdAt = Date.now() - 1000;
    const invitation = makeInvitation(createdAt, null);
    expect(invitation.expiresAt).toBe(
      createdAt + INVITATION_EXPIRATION_TIME_MS
    );
  });

  it("equals reminderSentAt + 7 days after reminder", () => {
    const createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const reminderSentAt = Date.now() - 1000;
    const invitation = makeInvitation(createdAt, reminderSentAt);
    expect(invitation.expiresAt).toBe(
      reminderSentAt + INVITATION_EXPIRATION_TIME_MS
    );
  });
});
