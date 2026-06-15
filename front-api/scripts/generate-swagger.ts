import { readFileSync, writeFileSync } from "node:fs";

import { buildSwaggerSpec } from "@front-api/lib/swagger";

// Generates the static OpenAPI spec from `swagger.json` (which holds the API
// folder to scan and the base OpenAPI definition) into `public/swagger.json`.
// Replaces the former `next-swagger-doc-cli` invocation. Any YAML parse errors
// in `@swagger` annotations are reported to stderr by `swagger-jsdoc`, which the
// `docs` npm script greps for to fail the build.
const CONFIG_PATH = "swagger.json";
const OUTPUT_PATH = "public/swagger.json";

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
const spec = buildSwaggerSpec(config);
writeFileSync(OUTPUT_PATH, JSON.stringify(spec, null, 2));
