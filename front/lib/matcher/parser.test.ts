import { describe, expect, it } from "vitest";

import { parseMatcherExpression } from "./parser";
import type { LogicalExpression, OperationExpression } from "./types";
import { isLogicalExpression, isOperationExpression } from "./types";

describe("parseMatcherExpression", () => {
  describe("logical operators", () => {
    it("should parse AND expression", () => {
      const result = parseMatcherExpression(
        '(and (eq "field1" "value1") (eq "field2" "value2"))'
      );
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isLogicalExpression(result.value)).toBe(true);
      const logical = result.value as LogicalExpression;
      expect(logical.op).toBe("and");
      expect(logical.expressions).toHaveLength(2);
    });

    it("should parse OR expression", () => {
      const result = parseMatcherExpression(
        '(or (eq "field1" "value1") (eq "field2" "value2"))'
      );
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isLogicalExpression(result.value)).toBe(true);
      const logical = result.value as LogicalExpression;
      expect(logical.op).toBe("or");
      expect(logical.expressions).toHaveLength(2);
    });

    it("should parse NOT expression", () => {
      const result = parseMatcherExpression('(not (eq "field" "value"))');
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isLogicalExpression(result.value)).toBe(true);
      const logical = result.value as LogicalExpression;
      expect(logical.op).toBe("not");
      expect(logical.expressions).toHaveLength(1);
    });

    it("should parse nested logical expressions", () => {
      const result = parseMatcherExpression(
        '(and (or (eq "a" "1") (eq "b" "2")) (eq "c" "3"))'
      );
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isLogicalExpression(result.value)).toBe(true);
      const logical = result.value as LogicalExpression;
      expect(logical.op).toBe("and");
      expect(logical.expressions).toHaveLength(2);
      expect(isLogicalExpression(logical.expressions[0])).toBe(true);
    });
  });

  describe("equality operators", () => {
    it("should parse eq with string value", () => {
      const result = parseMatcherExpression('(eq "user.name" "Alice")');
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isOperationExpression(result.value)).toBe(true);
      const op = result.value as OperationExpression;
      expect(op.op).toBe("eq");
      expect(op.field).toBe("user.name");
      expect(op.value).toBe("Alice");
    });

    it("should parse eq with number value", () => {
      const result = parseMatcherExpression('(eq "count" 42)');
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isOperationExpression(result.value)).toBe(true);
      const op = result.value as OperationExpression;
      expect(op.op).toBe("eq");
      expect(op.field).toBe("count");
      expect(op.value).toBe(42);
    });

    it("should parse eq with boolean value", () => {
      const result = parseMatcherExpression('(eq "active" true)');
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isOperationExpression(result.value)).toBe(true);
      const op = result.value as OperationExpression;
      expect(op.op).toBe("eq");
      expect(op.field).toBe("active");
      expect(op.value).toBe(true);
    });
  });

  describe("string operators", () => {
    it("should parse starts-with", () => {
      const result = parseMatcherExpression('(starts-with "email" "admin@")');
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isOperationExpression(result.value)).toBe(true);
      const op = result.value as OperationExpression;
      expect(op.op).toBe("starts-with");
      expect(op.field).toBe("email");
      expect(op.value).toBe("admin@");
    });
  });

  describe("array operators", () => {
    it("should parse has", () => {
      const result = parseMatcherExpression('(has "tags" "urgent")');
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isOperationExpression(result.value)).toBe(true);
      const op = result.value as OperationExpression;
      expect(op.op).toBe("has");
      expect(op.field).toBe("tags");
      expect(op.value).toBe("urgent");
    });

    it("should parse has-all with array", () => {
      const result = parseMatcherExpression(
        '(has-all "tags" ("bug" "urgent"))'
      );
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isOperationExpression(result.value)).toBe(true);
      const op = result.value as OperationExpression;
      expect(op.op).toBe("has-all");
      expect(op.field).toBe("tags");
      expect(op.values).toEqual(["bug", "urgent"]);
    });

    it("should parse has-any with array", () => {
      const result = parseMatcherExpression('(has-any "labels" ("p0" "p1"))');
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isOperationExpression(result.value)).toBe(true);
      const op = result.value as OperationExpression;
      expect(op.op).toBe("has-any");
      expect(op.field).toBe("labels");
      expect(op.values).toEqual(["p0", "p1"]);
    });
  });

  describe("numeric operators", () => {
    it("should parse gt", () => {
      const result = parseMatcherExpression('(gt "age" 18)');
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isOperationExpression(result.value)).toBe(true);
      const op = result.value as OperationExpression;
      expect(op.op).toBe("gt");
      expect(op.field).toBe("age");
      expect(op.value).toBe(18);
    });

    it("should parse gte", () => {
      const result = parseMatcherExpression('(gte "score" 90)');
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isOperationExpression(result.value)).toBe(true);
      const op = result.value as OperationExpression;
      expect(op.op).toBe("gte");
      expect(op.value).toBe(90);
    });

    it("should parse lt", () => {
      const result = parseMatcherExpression('(lt "temperature" 100)');
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isOperationExpression(result.value)).toBe(true);
      const op = result.value as OperationExpression;
      expect(op.op).toBe("lt");
      expect(op.value).toBe(100);
    });

    it("should parse lte", () => {
      const result = parseMatcherExpression('(lte "price" 50.99)');
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isOperationExpression(result.value)).toBe(true);
      const op = result.value as OperationExpression;
      expect(op.op).toBe("lte");
      expect(op.value).toBe(50.99);
    });
  });

  describe("existence operator", () => {
    it("should parse exists", () => {
      const result = parseMatcherExpression('(exists "optional_field")');
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isOperationExpression(result.value)).toBe(true);
      const op = result.value as OperationExpression;
      expect(op.op).toBe("exists");
      expect(op.field).toBe("optional_field");
      expect(op.value).toBeUndefined();
    });
  });

  describe("special characters and escaping", () => {
    it("should parse escaped quotes in strings", () => {
      const result = parseMatcherExpression(
        '(eq "message" "He said \\"hello\\"")'
      );
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isOperationExpression(result.value)).toBe(true);
      const op = result.value as OperationExpression;
      expect(op.value).toBe('He said "hello"');
    });

    it("should parse field paths with dots", () => {
      const result = parseMatcherExpression(
        '(eq "user.profile.email" "test@example.com")'
      );
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isOperationExpression(result.value)).toBe(true);
      const op = result.value as OperationExpression;
      expect(op.field).toBe("user.profile.email");
    });

    it("should parse wildcard paths", () => {
      const result = parseMatcherExpression('(has "tags.*.name" "urgent")');
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isOperationExpression(result.value)).toBe(true);
      const op = result.value as OperationExpression;
      expect(op.field).toBe("tags.*.name");
    });
  });

  describe("error handling", () => {
    it("should return error on empty expression", () => {
      const result = parseMatcherExpression("()");
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error.message).toBe("Empty expression");
    });

    it("should return error on unbalanced parentheses", () => {
      const result = parseMatcherExpression('(eq "field" "value"');
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error.message).toBe("Unbalanced parentheses");
    });

    it("should return error on missing opening paren", () => {
      const result = parseMatcherExpression('e(q "field" "value")');
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error.message).toBe("Expression must start with '('");
    });

    it("should return error on unknown operator", () => {
      const result = parseMatcherExpression('(unknown "field" "value")');
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error.message).toBe("Unknown operator: unknown");
    });

    it("should return error on not with wrong arity", () => {
      const result = parseMatcherExpression('(not (eq "a" "1") (eq "b" "2"))');
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error.message).toBe("not requires exactly one expression");
    });

    it("should return error on missing field for eq", () => {
      const result = parseMatcherExpression("(eq)");
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error.message).toBe("eq requires field and value(s)");
    });

    it("should return error on non-string field", () => {
      const result = parseMatcherExpression("(eq 123 456)");
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error.message).toBe("Field must be a string for eq");
    });

    it("should return error on has-all without array", () => {
      const result = parseMatcherExpression('(has-all "field" "single")');
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error.message).toBe("has-all requires a list of values");
    });

    it("should return error on unclosed string", () => {
      const result = parseMatcherExpression('(eq "field" "unclosed)');
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error.message).toContain("Expected closing '\"'");
    });

    it("should return error on exists with wrong arity", () => {
      const result = parseMatcherExpression('(exists "field" "extra")');
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error.message).toBe(
        "exists requires exactly one expression"
      );
    });
  });

  describe("whitespace handling", () => {
    it("should handle extra whitespace", () => {
      const result = parseMatcherExpression('  (  eq   "field"   "value"  )  ');
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isOperationExpression(result.value)).toBe(true);
      const op = result.value as OperationExpression;
      expect(op.op).toBe("eq");
      expect(op.field).toBe("field");
      expect(op.value).toBe("value");
    });

    it("should handle newlines and tabs", () => {
      const result = parseMatcherExpression(
        '(\n\tand\n\t\t(eq "a" "1")\n\t\t(eq "b" "2")\n)'
      );
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(isLogicalExpression(result.value)).toBe(true);
      const logical = result.value as LogicalExpression;
      expect(logical.op).toBe("and");
      expect(logical.expressions).toHaveLength(2);
    });
  });
});
