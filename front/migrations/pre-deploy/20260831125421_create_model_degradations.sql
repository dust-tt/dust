CREATE TABLE "model_degradations" (
  "id" BIGSERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "modelId" VARCHAR(255) NOT NULL,
  "providerId" VARCHAR(255) NOT NULL,
  "host" VARCHAR(255) NOT NULL
);

CREATE UNIQUE INDEX "model_degradations_model_id_provider_id_host" ON "model_degradations"
  ("modelId", "providerId", "host");
