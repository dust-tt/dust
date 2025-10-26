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

const invalidCases = [
  {
    name: "Missing validation",
    code: `
      export default async function handler(req, res) {
        const userData = await fetchInternalUser();
        return res.json(userData);
      }
    `,
    errors: [{ messageId: "missingValidation", type: "Identifier" }],
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
    errors: [{ messageId: "missingValidation", type: "Identifier" }],
  },
  {
    name: "Direct return without validation",
    code: `
      export default async function handler(req, res) {
        const internalData = await fetchData();
        return res.status(200).json(internalData);
      }
    `,
    errors: [{ messageId: "missingValidation", type: "Identifier" }],
  },
  {
    name: "Using res.send without validation",
    code: `
      export default async function handler(req, res) {
        const userData = await fetchInternalUser();
        return res.send(userData);
      }
    `,
    errors: [{ messageId: "missingValidation", type: "Identifier" }],
  },
  {
    name: "Object with unvalidated property",
    code: `
      export default async function handler(req, res) {
        const internalResponse = await fetchData();
        return res.json({ data: internalResponse, status: "ok" });
      }
    `,
    errors: [{ messageId: "missingValidation", type: "Identifier" }],
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
    errors: [{ messageId: "missingValidation", type: "MemberExpression" }],
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
    errors: [{ messageId: "missingValidation", type: "Identifier" }],
  },
  {
    name: "Return statement with unvalidated data",
    code: `
      export default async function handler(req, res) {
        const apiResponse = await callInternalAPI();
        return apiResponse;
      }
    `,
    errors: [{ messageId: "unsafeDirectReturn", type: "Identifier" }],
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
    errors: [{ messageId: "missingValidation", type: "Identifier" }],
  },
];

for (const testCase of invalidCases) {
  console.log(`\\nTesting: ${testCase.name}`);
  try {
    ruleTester.run("require-schema-validation", rule, {
      valid: [],
      invalid: [
        {
          code: testCase.code,
          filename: "/pages/api/v1/test/index.ts",
          errors: testCase.errors,
        },
      ],
    });
    console.log(`✓ ${testCase.name} - PASSED`);
  } catch (error) {
    console.log(`✗ ${testCase.name} - FAILED`);
    console.log(error.message.split('\\n').slice(0, 10).join('\\n'));
  }
}
