-- Migration created on May 28, 2025
CREATE UNIQUE INDEX CONCURRENTLY "users_work_o_s_id" ON "users" ("workOSId");
