SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;

/* Existing attribution rows remain null and use the legacy projection fallback. */
ALTER TABLE "public"."agent_message_consumption_items"
ADD COLUMN "attributedSkillIds" character varying(255)[];
