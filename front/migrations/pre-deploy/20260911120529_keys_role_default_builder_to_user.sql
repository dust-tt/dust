/*
Pre-deploy: change the default of keys."role" from the now-deprecated 'builder'
to 'user'.

Keys are always created with an explicit role ('user' / 'admin'), so this
default is a fallback only and nothing relies on it. Flipping it before the
builder -> user backfill (migrations/20260911_migrate_key_builder_role_to_user.ts)
ensures no new row can be born 'builder' while the backfill runs.
 */
ALTER TABLE "public"."keys"
    ALTER COLUMN "role" SET DEFAULT 'user';
