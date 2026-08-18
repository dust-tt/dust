-- Retire legacy candidate/confirmed statuses: normalise all existing rows to
-- suggested so the application can drop those values from the status type.
UPDATE "public"."activation_work_areas"
  SET "status" = 'suggested'
  WHERE "status" IN ('candidate', 'confirmed');
