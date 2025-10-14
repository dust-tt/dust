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
      expect(isLogicalExpression(result)).toBe(true);
      const logical = result as LogicalExpression;
      expect(logical.op).toBe("and");
      expect(logical.expressions).toHaveLength(2);
    });

    it("should parse OR expression", () => {
      const result = parseMatcherExpression(
        '(or (eq "field1" "value1") (eq "field2" "value2"))'
      );
      expect(isLogicalExpression(result)).toBe(true);
      const logical = result as LogicalExpression;
      expect(logical.op).toBe("or");
      expect(logical.expressions).toHaveLength(2);
    });

    it("should parse NOT expression", () => {
      const result = parseMatcherExpression('(not (eq "field" "value"))');
      expect(isLogicalExpression(result)).toBe(true);
      const logical = result as LogicalExpression;
      expect(logical.op).toBe("not");
      expect(logical.expressions).toHaveLength(1);
    });

    it("should parse nested logical expressions", () => {
      const result = parseMatcherExpression(
        '(and (or (eq "a" "1") (eq "b" "2")) (eq "c" "3"))'
      );
      expect(isLogicalExpression(result)).toBe(true);
      const logical = result as LogicalExpression;
      expect(logical.op).toBe("and");
      expect(logical.expressions).toHaveLength(2);
      expect(isLogicalExpression(logical.expressions[0])).toBe(true);
    });
  });

  describe("equality operators", () => {
    it("should parse eq with string value", () => {
      const result = parseMatcherExpression('(eq "user.name" "Alice")');
      expect(isOperationExpression(result)).toBe(true);
      const op = result as OperationExpression;
      expect(op.op).toBe("eq");
      expect(op.field).toBe("user.name");
      expect(op.value).toBe("Alice");
    });

    it("should parse eq with number value", () => {
      const result = parseMatcherExpression('(eq "count" 42)');
      expect(isOperationExpression(result)).toBe(true);
      const op = result as OperationExpression;
      expect(op.op).toBe("eq");
      expect(op.field).toBe("count");
      expect(op.value).toBe(42);
    });

    it("should parse eq with boolean value", () => {
      const result = parseMatcherExpression('(eq "active" true)');
      expect(isOperationExpression(result)).toBe(true);
      const op = result as OperationExpression;
      expect(op.op).toBe("eq");
      expect(op.field).toBe("active");
      expect(op.value).toBe(true);
    });
  });

  describe("string operators", () => {
    it("should parse starts-with", () => {
      const result = parseMatcherExpression('(starts-with "email" "admin@")');
      expect(isOperationExpression(result)).toBe(true);
      const op = result as OperationExpression;
      expect(op.op).toBe("starts-with");
      expect(op.field).toBe("email");
      expect(op.value).toBe("admin@");
    });
  });

  describe("array operators", () => {
    it("should parse has", () => {
      const result = parseMatcherExpression('(has "tags" "urgent")');
      expect(isOperationExpression(result)).toBe(true);
      const op = result as OperationExpression;
      expect(op.op).toBe("has");
      expect(op.field).toBe("tags");
      expect(op.value).toBe("urgent");
    });

    it("should parse has-all with array", () => {
      const result = parseMatcherExpression(
        '(has-all "tags" ("bug" "urgent"))'
      );
      expect(isOperationExpression(result)).toBe(true);
      const op = result as OperationExpression;
      expect(op.op).toBe("has-all");
      expect(op.field).toBe("tags");
      expect(op.values).toEqual(["bug", "urgent"]);
    });

    it("should parse has-any with array", () => {
      const result = parseMatcherExpression('(has-any "labels" ("p0" "p1"))');
      expect(isOperationExpression(result)).toBe(true);
      const op = result as OperationExpression;
      expect(op.op).toBe("has-any");
      expect(op.field).toBe("labels");
      expect(op.values).toEqual(["p0", "p1"]);
    });
  });

  describe("numeric operators", () => {
    it("should parse gt", () => {
      const result = parseMatcherExpression('(gt "age" 18)');
      expect(isOperationExpression(result)).toBe(true);
      const op = result as OperationExpression;
      expect(op.op).toBe("gt");
      expect(op.field).toBe("age");
      expect(op.value).toBe(18);
    });

    it("should parse gte", () => {
      const result = parseMatcherExpression('(gte "score" 90)');
      expect(isOperationExpression(result)).toBe(true);
      const op = result as OperationExpression;
      expect(op.op).toBe("gte");
      expect(op.value).toBe(90);
    });

    it("should parse lt", () => {
      const result = parseMatcherExpression('(lt "temperature" 100)');
      expect(isOperationExpression(result)).toBe(true);
      const op = result as OperationExpression;
      expect(op.op).toBe("lt");
      expect(op.value).toBe(100);
    });

    it("should parse lte", () => {
      const result = parseMatcherExpression('(lte "price" 50.99)');
      expect(isOperationExpression(result)).toBe(true);
      const op = result as OperationExpression;
      expect(op.op).toBe("lte");
      expect(op.value).toBe(50.99);
    });
  });

  describe("existence operator", () => {
    it("should parse exists", () => {
      const result = parseMatcherExpression('(exists "optional_field")');
      expect(isOperationExpression(result)).toBe(true);
      const op = result as OperationExpression;
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
      expect(isOperationExpression(result)).toBe(true);
      const op = result as OperationExpression;
      expect(op.value).toBe('He said "hello"');
    });

    it("should parse field paths with dots", () => {
      const result = parseMatcherExpression(
        '(eq "user.profile.email" "test@example.com")'
      );
      expect(isOperationExpression(result)).toBe(true);
      const op = result as OperationExpression;
      expect(op.field).toBe("user.profile.email");
    });

    it("should parse wildcard paths", () => {
      const result = parseMatcherExpression('(has "tags.*.name" "urgent")');
      expect(isOperationExpression(result)).toBe(true);
      const op = result as OperationExpression;
      expect(op.field).toBe("tags.*.name");
    });
  });

  describe("error handling", () => {
    it("should throw on empty expression", () => {
      expect(() => parseMatcherExpression("()")).toThrow("Empty expression");
    });

    it("should throw on missing opening paren", () => {
      expect(() => parseMatcherExpression('eq "field" "value")')).toThrow(
        "Expression must start with '('"
      );
    });

    it("should throw on unknown operator", () => {
      expect(() => parseMatcherExpression('(unknown "field" "value")')).toThrow(
        "Unknown operator: unknown"
      );
    });

    it("should throw on not with wrong arity", () => {
      expect(() =>
        parseMatcherExpression('(not (eq "a" "1") (eq "b" "2"))')
      ).toThrow("not requires exactly one expression");
    });

    it("should throw on missing field for eq", () => {
      expect(() => parseMatcherExpression("(eq)")).toThrow(
        "eq requires field and value(s)"
      );
    });

    it("should throw on non-string field", () => {
      expect(() => parseMatcherExpression("(eq 123 456)")).toThrow(
        "Field must be a string"
      );
    });

    it("should throw on has-all without array", () => {
      expect(() =>
        parseMatcherExpression('(has-all "field" "single")')
      ).toThrow("has-all requires a list of values");
    });

    it("should throw on unclosed string", () => {
      expect(() => parseMatcherExpression('(eq "field" "unclosed)')).toThrow(
        "Expected closing '\"'"
      );
    });

    it("should throw on exists with wrong arity", () => {
      expect(() => parseMatcherExpression('(exists "field" "extra")')).toThrow(
        "exists requires exactly one expression"
      );
    });
  });

  describe("whitespace handling", () => {
    it("should handle extra whitespace", () => {
      const result = parseMatcherExpression('  (  eq   "field"   "value"  )  ');
      expect(isOperationExpression(result)).toBe(true);
      const op = result as OperationExpression;
      expect(op.op).toBe("eq");
      expect(op.field).toBe("field");
      expect(op.value).toBe("value");
    });

    it("should handle newlines and tabs", () => {
      const result = parseMatcherExpression(
        '(\n\tand\n\t\t(eq "a" "1")\n\t\t(eq "b" "2")\n)'
      );
      expect(isLogicalExpression(result)).toBe(true);
      const logical = result as LogicalExpression;
      expect(logical.op).toBe("and");
      expect(logical.expressions).toHaveLength(2);
    });
  });
});
