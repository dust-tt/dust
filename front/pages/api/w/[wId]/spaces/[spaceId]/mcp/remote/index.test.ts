import { faker } from "@faker-js/faker";
import { describe, expect } from "vitest";

import { WorkspaceHasDomain } from "@app/lib/models/workspace_has_domain";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

describe("GET /api/mcp/servers", () => {
  itInTransaction("should return a list of servers", async (db) => {
    
  });
});
