import { describe } from "vitest";

import { createPublicApiAuthenticationTests } from "@app/tests/utils/generic_public_api_tests";

import handler from "./index";

describe(
  "public api authentication tests",
  createPublicApiAuthenticationTests(handler)
);
