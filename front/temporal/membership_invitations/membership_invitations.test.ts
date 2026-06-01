import { getMembershipInvitationToken } from "@app/lib/api/invitation";
import {
  INVITATION_EXPIRATION_TIME_SEC,
  invitationTokenValidityStartMs,
} from "@app/lib/constants/invitation";
import { MembershipInvitationModel } from "@app/lib/models/membership_invitation";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { verify } from "jsonwebtoken";
import { beforeAll, describe, expect, it, vi } from "vitest";

const TEST_SECRET = "test-invite-secret";

beforeAll(() => {
  vi.stubEnv("DUST_INVITE_TOKEN_SECRET", TEST_SECRET);
});

const EXPIRATION_MS = INVITATION_EXPIRATION_TIME_SEC * 1000;

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
      invitationTokenValidityStartMs(createdAt, reminderSentAt) + EXPIRATION_MS,
    isExpired: false,
  };
}

describe("invitationTokenValidityStartMs", () => {
  it("returns createdAt when reminderSentAt is null", () => {
    const createdAt = Date.now() - 1000;
    expect(invitationTokenValidityStartMs(createdAt, null)).toBe(createdAt);
  });

  it("returns reminderSentAt when set", () => {
    const createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const reminderSentAt = Date.now() - 1000;
    expect(invitationTokenValidityStartMs(createdAt, reminderSentAt)).toBe(
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
    const createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago
    const reminderSentAt = Date.now() - 1000; // just now
    const invitation = makeInvitation(createdAt, reminderSentAt);
    const token = getMembershipInvitationToken(invitation);
    const decoded = verify(token, secret) as { iat: number; exp: number };

    expect(decoded.iat).toBe(Math.floor(reminderSentAt / 1000));
    expect(decoded.exp).toBe(
      Math.floor(reminderSentAt / 1000) + INVITATION_EXPIRATION_TIME_SEC
    );
  });

  it("old token generated before reminder remains expired after reminderSentAt is set", () => {
    const createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago — expired
    const invitationBeforeReminder = makeInvitation(createdAt, null);
    const oldToken = getMembershipInvitationToken(invitationBeforeReminder);

    // Simulating reminderSentAt being set.
    const reminderSentAt = Date.now() - 1000;
    const invitationAfterReminder = makeInvitation(createdAt, reminderSentAt);
    const newToken = getMembershipInvitationToken(invitationAfterReminder);

    // Old token should be rejected by jsonwebtoken (exp in the past).
    expect(() => verify(oldToken, secret)).toThrow();
    // New token should be valid.
    expect(() => verify(newToken, secret)).not.toThrow();
  });

  it("new token expires 7 days after reminderSentAt", () => {
    const createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const reminderSentAt = Date.now() - 1000;
    const invitation = makeInvitation(createdAt, reminderSentAt);
    const token = getMembershipInvitationToken(invitation);
    const decoded = verify(token, secret) as { exp: number };

    const expectedExp =
      Math.floor(reminderSentAt / 1000) + INVITATION_EXPIRATION_TIME_SEC;
    expect(decoded.exp).toBe(expectedExp);
  });
});

describe("claimReminderSlot", () => {
  it("updates the in-memory resource so toJSON() and token generation use the new reminderSentAt", async () => {
    const createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const reminderSentAt = new Date();

    // Construct a resource with reminderSentAt = null.
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

    // Mock the model update to simulate a successful claim.
    // Cast needed: WorkspaceAwareModel types update() as returning [number] but Sequelize's actual
    // implementation returns [number, Model[]] when returning: true is set.
    vi.spyOn(MembershipInvitationModel, "update").mockResolvedValueOnce([
      1,
      [
        {
          get: () => ({ reminderSentAt }),
        } as unknown as MembershipInvitationModel,
      ],
    ] as unknown as [number]);

    const claimed = await resource.claimReminderSlot();

    expect(claimed).toBe(true);
    // In-memory resource must reflect the new reminderSentAt.
    expect(resource.reminderSentAt).toEqual(reminderSentAt);
    // toJSON() must expose the updated value.
    expect(resource.toJSON().reminderSentAt).toBe(reminderSentAt.getTime());
    // Token must be anchored on reminderSentAt, not the old createdAt.
    const token = getMembershipInvitationToken(resource.toJSON());
    const decoded = verify(token, TEST_SECRET) as { iat: number };
    expect(decoded.iat).toBe(Math.floor(reminderSentAt.getTime() / 1000));
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

    // Mock the model update to simulate another worker already claimed it (0 rows affected).
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
    expect(invitation.expiresAt).toBe(createdAt + EXPIRATION_MS);
  });

  it("equals reminderSentAt + 7 days after reminder", () => {
    const createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const reminderSentAt = Date.now() - 1000;
    const invitation = makeInvitation(createdAt, reminderSentAt);
    expect(invitation.expiresAt).toBe(reminderSentAt + EXPIRATION_MS);
  });
});
