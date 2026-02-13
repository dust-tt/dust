import { createPublicApiAuthenticationTests } from "@app/tests/utils/generic_public_api_tests";
import { describe } from "vitest";

import handler from "./index";

describe(
  "public api authentication tests",
  createPublicApiAuthenticationTests(handler)
);
