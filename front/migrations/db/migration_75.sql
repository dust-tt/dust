-- Migration created on Sep 06, 2024
ALTER TABLE "public"."apps" ADD COLUMN "vaultId" INTEGER REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
