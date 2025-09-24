-- Migration created on Sep 24, 2025
DROP INDEX CONCURRENTLY "users_last_login_at";
CREATE INDEX CONCURRENTLY "users_id_last_login_at_null" ON "users" ("id") WHERE "lastLoginAt" IS NOT NULL;
