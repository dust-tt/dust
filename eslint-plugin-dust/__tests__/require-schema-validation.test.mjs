import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const rule = require("../rules/require-schema-validation");

describe("require-schema-validation", () => {
  const linter = new Linter();
  linter.defineRule("require-schema-validation", rule);

  const runTest = (code, filename, expectedErrors = []) => {
    const messages = linter.verify(code, {
      rules: {
        "require-schema-validation": "error",
      },
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    }, { filename });

    return messages;
  };

  it("should pass valid cases", () => {
    const validCases = [
      {
        name: "Properly validated with .strip().parse()",
        code: `
        import { UserSchema } from './schemas';

        export default async function handler(req, res) {
          const userData = await fetchInternalUser();
          const sanitized = UserSchema.strip().parse(userData);
          return res.json(sanitized);
        }
      `,
        filename: "/pages/api/v1/users/index.ts",
      },
      {
        name: "Inline validation",
        code: `
        import { UserSchema } from './schemas';

        export default async function handler(req, res) {
          const userData = await fetchInternalUser();
          return res.json(UserSchema.strip().parse(userData));
        }
      `,
        filename: "/pages/api/v1/users/index.ts",
      },
      {
        name: "safeParse pattern",
        code: `
        import { UserSchema } from './schemas';

        export default async function handler(req, res) {
          const userData = await fetchInternalUser();
          const result = UserSchema.strip().safeParse(userData);
          if (!result.success) {
            return res.status(400).json({ error: "Invalid data" });
          }
          return res.json(result.data);
        }
      `,
        filename: "/pages/api/v1/users/index.ts",
      },
      {
        name: "Using res.status().json() with validation",
        code: `
        import { UserSchema } from './schemas';

        export default async function handler(req, res) {
          const userData = await fetchInternalUser();
          const sanitized = UserSchema.strip().parse(userData);
          return res.status(200).json(sanitized);
        }
      `,
        filename: "/pages/api/v1/users/index.ts",
      },
      {
        name: "Not an API file (should be ignored)",
        code: `
        export function processUser(userData) {
          return userData;
        }
      `,
        filename: "/lib/utils/user.ts",
      },
      {
        name: "Internal API (not v1)",
        code: `
        export default async function handler(req, res) {
          const userData = await fetchUser();
          return res.json(userData);
        }
      `,
        filename: "/pages/api/internal/users.ts",
      },
      {
        name: "Test file (should be ignored)",
        code: `
        export default async function handler(req, res) {
          return res.json({ test: "data" });
        }
      `,
        filename: "/pages/api/v1/users/index.test.ts",
      },
      {
        name: "Variable assigned from validated expression",
        code: `
        import { UserSchema } from './schemas';

        export default async function handler(req, res) {
          const userData = await fetchInternalUser();
          const validated = UserSchema.strip().parse(userData);
          const response = validated;
          return res.json(response);
        }
      `,
        filename: "/pages/api/v1/users/index.ts",
      },
      {
        name: "Arrow function handler",
        code: `
        import { UserSchema } from './schemas';

        const handler = async (req, res) => {
          const userData = await fetchInternalUser();
          const sanitized = UserSchema.strip().parse(userData);
          return res.json(sanitized);
        };

        export default handler;
      `,
        filename: "/pages/api/v1/users/index.ts",
      },
      {
        name: "Object with validated properties",
        code: `
        import { UserSchema } from './schemas';

        export default async function handler(req, res) {
          const userData = await fetchInternalUser();
          const sanitized = UserSchema.strip().parse(userData);
          return res.json({ user: sanitized, status: "success" });
        }
      `,
        filename: "/pages/api/v1/users/index.ts",
      },
    ];

    validCases.forEach((testCase, index) => {
      console.log(`  ✓ Valid: ${testCase.name}`);
      const messages = runTest(testCase.code, testCase.filename);
      expect(messages, `Valid case: ${testCase.name} should have no errors`).toHaveLength(0);
    });
  });

  it("should fail invalid cases", () => {
    const invalidCases = [
      {
        name: "Missing validation",
        code: `
        export default async function handler(req, res) {
          const userData = await fetchInternalUser();
          return res.json(userData);
        }
      `,
        filename: "/pages/api/v1/users/index.ts",
        expectedMessageIds: ["missingValidation"],
      },
      {
        name: "Missing .strip() call",
        code: `
        import { UserSchema } from './schemas';

        export default async function handler(req, res) {
          const userData = await fetchInternalUser();
          const sanitized = UserSchema.parse(userData);
          return res.json(sanitized);
        }
      `,
        filename: "/pages/api/v1/users/index.ts",
        expectedMessageIds: ["missingValidation"],
      },
      {
        name: "Direct return without validation",
        code: `
        export default async function handler(req, res) {
          const internalData = await fetchData();
          return res.status(200).json(internalData);
        }
      `,
        filename: "/pages/api/v1/data/index.ts",
        expectedMessageIds: ["missingValidation"],
      },
      {
        name: "Using res.send without validation",
        code: `
        export default async function handler(req, res) {
          const userData = await fetchInternalUser();
          return res.send(userData);
        }
      `,
        filename: "/pages/api/v1/users/index.ts",
        expectedMessageIds: ["missingValidation"],
      },
      {
        name: "Object with unvalidated property",
        code: `
        export default async function handler(req, res) {
          const internalResponse = await fetchData();
          return res.json({ data: internalResponse, status: "ok" });
        }
      `,
        filename: "/pages/api/v1/data/index.ts",
        expectedMessageIds: ["missingValidation"],
      },
      {
        name: "safeParse without .strip()",
        code: `
        import { UserSchema } from './schemas';

        export default async function handler(req, res) {
          const userData = await fetchInternalUser();
          const result = UserSchema.safeParse(userData);
          if (!result.success) {
            return res.status(400).json({ error: "Invalid" });
          }
          return res.json(result.data);
        }
      `,
        filename: "/pages/api/v1/users/index.ts",
        expectedMessageIds: ["missingValidation"],
      },
      {
        name: "Variable assigned from unvalidated expression",
        code: `
        export default async function handler(req, res) {
          const internalData = await fetchData();
          const responseData = internalData;
          return res.json(responseData);
        }
      `,
        filename: "/pages/api/v1/data/index.ts",
        expectedMessageIds: ["missingValidation"],
      },
      {
        name: "Return statement with unvalidated data (no autofix)",
        code: `
        export default async function handler(req, res) {
          const apiResponse = await callInternalAPI();
          return apiResponse;
        }
      `,
        filename: "/pages/api/v1/proxy/index.ts",
        expectedMessageIds: ["unsafeDirectReturn"],
      },
      {
        name: "Arrow function without validation",
        code: `
        const handler = async (req, res) => {
          const internalData = await fetchData();
          return res.json(internalData);
        };

        export default handler;
      `,
        filename: "/pages/api/v1/data/index.ts",
        expectedMessageIds: ["missingValidation"],
      },
    ];

    invalidCases.forEach((testCase) => {
      console.log(`  ✓ Invalid: ${testCase.name}`);
      const messages = runTest(testCase.code, testCase.filename);
      expect(messages.length, `Invalid case: ${testCase.name} should have errors`).toBeGreaterThan(0);

      // Check that all expected message IDs are present
      const actualMessageIds = messages.map(m => m.messageId);
      testCase.expectedMessageIds.forEach(expectedId => {
        expect(actualMessageIds, `Invalid case: ${testCase.name} should have messageId: ${expectedId}`).toContain(expectedId);
      });
      console.log(`    Found ${messages.length} error(s): ${actualMessageIds.join(', ')}`);
    });
  });
});
