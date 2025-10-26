"use strict";

const { RuleTester } = require("eslint");
const rule = require("../rules/require-schema-validation");

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
});

ruleTester.run("require-schema-validation", rule, {
  valid: [
    // Valid: Properly validated with .strip().parse()
    {
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

    // Valid: Inline validation
    {
      code: `
        import { UserSchema } from './schemas';

        export default async function handler(req, res) {
          const userData = await fetchInternalUser();
          return res.json(UserSchema.strip().parse(userData));
        }
      `,
      filename: "/pages/api/v1/users/index.ts",
    },

    // Valid: safeParse pattern
    {
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

    // Valid: Using res.status().json() with validation
    {
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

    // Valid: Not an API file (should be ignored)
    {
      code: `
        export function processUser(userData) {
          return userData;
        }
      `,
      filename: "/lib/utils/user.ts",
    },

    // Valid: Internal API (not v1)
    {
      code: `
        export default async function handler(req, res) {
          const userData = await fetchUser();
          return res.json(userData);
        }
      `,
      filename: "/pages/api/internal/users.ts",
    },

    // Valid: Test file (should be ignored)
    {
      code: `
        export default async function handler(req, res) {
          return res.json({ test: "data" });
        }
      `,
      filename: "/pages/api/v1/users/index.test.ts",
    },

    // Valid: Variable assigned from validated expression
    {
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

    // Valid: Arrow function handler
    {
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

    // Valid: Object with validated properties
    {
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
  ],

  invalid: [
    // Invalid: Missing validation
    {
      code: `
        export default async function handler(req, res) {
          const userData = await fetchInternalUser();
          return res.json(userData);
        }
      `,
      filename: "/pages/api/v1/users/index.ts",
      errors: [
        {
          messageId: "missingValidation",
          type: "Identifier",
        },
      ],
    },

    // Invalid: Missing .strip() call
    {
      code: `
        import { UserSchema } from './schemas';

        export default async function handler(req, res) {
          const userData = await fetchInternalUser();
          const sanitized = UserSchema.parse(userData);
          return res.json(sanitized);
        }
      `,
      filename: "/pages/api/v1/users/index.ts",
      errors: [
        {
          messageId: "missingValidation",
          type: "Identifier",
        },
      ],
    },

    // Invalid: Direct return without validation
    {
      code: `
        export default async function handler(req, res) {
          const internalData = await fetchData();
          return res.status(200).json(internalData);
        }
      `,
      filename: "/pages/api/v1/data/index.ts",
      errors: [
        {
          messageId: "missingValidation",
          type: "Identifier",
        },
      ],
    },

    // Invalid: Using res.send without validation
    {
      code: `
        export default async function handler(req, res) {
          const userData = await fetchInternalUser();
          return res.send(userData);
        }
      `,
      filename: "/pages/api/v1/users/index.ts",
      errors: [
        {
          messageId: "missingValidation",
          type: "Identifier",
        },
      ],
    },

    // Invalid: Object with unvalidated property
    {
      code: `
        export default async function handler(req, res) {
          const internalResponse = await fetchData();
          return res.json({ data: internalResponse, status: "ok" });
        }
      `,
      filename: "/pages/api/v1/data/index.ts",
      errors: [
        {
          messageId: "missingValidation",
          type: "Identifier",
        },
      ],
    },

    // Invalid: safeParse without .strip()
    {
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
      errors: [
        {
          messageId: "missingValidation",
          type: "MemberExpression",
        },
      ],
    },

    // Invalid: Variable assigned from unvalidated expression
    {
      code: `
        export default async function handler(req, res) {
          const internalData = await fetchData();
          const responseData = internalData;
          return res.json(responseData);
        }
      `,
      filename: "/pages/api/v1/data/index.ts",
      errors: [
        {
          messageId: "missingValidation",
          type: "Identifier",
        },
      ],
    },

    // Invalid: Return statement with unvalidated data
    {
      code: `
        export default async function handler(req, res) {
          const apiResponse = await callInternalAPI();
          return apiResponse;
        }
      `,
      filename: "/pages/api/v1/proxy/index.ts",
      errors: [
        {
          messageId: "unsafeDirectReturn",
          type: "Identifier",
        },
      ],
    },

    // Invalid: Arrow function without validation
    {
      code: `
        const handler = async (req, res) => {
          const internalData = await fetchData();
          return res.json(internalData);
        };

        export default handler;
      `,
      filename: "/pages/api/v1/data/index.ts",
      errors: [
        {
          messageId: "missingValidation",
          type: "Identifier",
        },
      ],
    },
  ],
});

console.log("All tests passed!");
