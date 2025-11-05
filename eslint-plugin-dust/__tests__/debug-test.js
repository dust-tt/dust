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

// Test one invalid case at a time
const testCase = {
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
};

console.log("Testing invalid case: Missing .strip() call");
ruleTester.run("require-schema-validation", rule, {
  valid: [],
  invalid: [testCase],
});

console.log("Test passed!");
