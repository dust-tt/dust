-- Migration created on Jul 14, 2025
ALTER TABLE "plugin_runs" ALTER COLUMN "args" DROP NOT NULL;ALTER TABLE "plugin_runs" ALTER COLUMN "args" DROP DEFAULT;ALTER TABLE "plugin_runs" ALTER COLUMN "args" TYPE VARCHAR(1024);
