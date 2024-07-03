-- Migration created on Jul 03, 2024
CREATE INDEX CONCURRENTLY "membership_invitations_invite_email_status" ON "membership_invitations" ("inviteEmail", "status");