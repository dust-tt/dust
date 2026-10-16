-- Frame-level union of literal tools.call(server, tool) pairs for a publication.
-- Each inner array is exactly [server, tool]; Sequelize ARRAY(ARRAY(STRING(255)))
-- maps to varchar(255)[][] (pg-schema-diff emitted a 1D array — corrected here).

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_publications"
  ADD COLUMN "requiredTools" character varying(255)[][]
  COLLATE "pg_catalog"."default"
  DEFAULT ARRAY[]::character varying(255)[][]
  NOT NULL;
