ALTER TABLE "vaults"
ADD COLUMN "managementMode" VARCHAR(255) NOT NULL DEFAULT 'manual' 
CHECK ("managementMode" IN ('manual', 'group'));