-- Migration created on Aug 21, 2024
CREATE TABLE IF NOT EXISTS "group_vaults" (
    "id" SERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "vaultId" INTEGER REFERENCES "vaults" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "groupId" INTEGER REFERENCES "groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE ("vaultId", "groupId"),
    PRIMARY KEY ("id")
);

INSERT INTO
    "group_vaults" (
        "createdAt",
        "updatedAt",
        "vaultId",
        "groupId"
    )
select now(), now(), "id", "groupId"
from "vaults";

CREATE INDEX "group_vaults_vault_id_group_id" ON "group_vaults" ("vaultId", "groupId");

CREATE INDEX "group_vaults_group_id" ON "group_vaults" ("groupId");