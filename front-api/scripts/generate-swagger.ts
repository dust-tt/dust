import { readFileSync, writeFileSync } from "node:fs";

import { buildSwaggerSpec } from "@front-api/lib/swagger";

// Generates two static OpenAPI specs from `swagger.json`:
//   - public/swagger.json         — v1 endpoints only (consumed by Mintlify)
//   - public/swagger-private.json — all endpoints (v1 + internal /w/ routes)
//
// Any YAML parse errors in `@swagger` annotations are reported to stderr by
// `swagger-jsdoc`, which the `docs` npm script greps for to fail the build.
const CONFIG_PATH = "swagger.json";
const PUBLIC_OUTPUT_PATH = "public/swagger.json";
const PRIVATE_OUTPUT_PATH = "public/swagger-private.json";

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));

const publicSpec = buildSwaggerSpec({
  ...config,
  apiFolder: "routes/v1",
});
writeFileSync(PUBLIC_OUTPUT_PATH, JSON.stringify(publicSpec, null, 2));

const privateSpec = buildSwaggerSpec(config);
writeFileSync(PRIVATE_OUTPUT_PATH, JSON.stringify(privateSpec, null, 2));
