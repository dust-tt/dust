-- Migration created on Sep 23, 2025
CREATE INDEX CONCURRENTLY "users_last_login_at" ON "users" ("lastLoginAt") WHERE "lastLoginAt" IS NOT NULL;
