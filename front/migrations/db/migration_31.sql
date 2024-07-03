-- Migration created on Jul 03, 2024
CREATE INDEX CONCURRENTLY "membership_invitations_email_status" ON "membership_invitations" ("email", "status");
