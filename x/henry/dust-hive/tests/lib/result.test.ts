import { describe, expect, it } from "bun:test";
import { CommandError, Err, Ok, envNotFoundError } from "../../src/lib/result";

describe("result", () => {
  describe("Ok", () => {
    it("creates a successful result with value", () => {
      const result = Ok(42);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it("works with string values", () => {
      const result = Ok("hello");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("hello");
      }
    });

    it("works with object values", () => {
      const obj = { name: "test", count: 5 };
      const result = Ok(obj);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(obj);
      }
    });

    it("works with undefined", () => {
      const result = Ok(undefined);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeUndefined();
      }
    });
  });

  describe("Err", () => {
    it("creates a failed result with error", () => {
      const error = new CommandError("Something went wrong");
      const result = Err(error);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
        expect(result.error.message).toBe("Something went wrong");
      }
    });

    it("works with string errors", () => {
      const result = Err("simple error");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("simple error");
      }
    });
  });

  describe("CommandError", () => {
    it("extends Error", () => {
      const error = new CommandError("test error");
      expect(error).toBeInstanceOf(Error);
    });

    it("has correct name property", () => {
      const error = new CommandError("test error");
      expect(error.name).toBe("CommandError");
    });

    it("preserves error message", () => {
      const error = new CommandError("specific message");
      expect(error.message).toBe("specific message");
    });
  });

  describe("envNotFoundError", () => {
    it("creates CommandError with correct format", () => {
      const error = envNotFoundError("my-env");
      expect(error).toBeInstanceOf(CommandError);
      expect(error.message).toBe("Environment 'my-env' not found");
    });

    it("works with different environment names", () => {
      expect(envNotFoundError("test").message).toBe("Environment 'test' not found");
      expect(envNotFoundError("feature-a").message).toBe("Environment 'feature-a' not found");
    });
  });

  describe("Result type usage patterns", () => {
    it("supports conditional checking pattern", () => {
      const success = Ok(100);
      const failure = Err(new CommandError("failed"));

      // Pattern used throughout codebase
      if (success.ok) {
        expect(success.value).toBe(100);
      } else {
        // TypeScript narrows type here
        expect.unreachable("Should not reach");
      }

      if (!failure.ok) {
        expect(failure.error.message).toBe("failed");
      } else {
        expect.unreachable("Should not reach");
      }
    });

    it("supports early return pattern", () => {
      function process(
        input: number
      ): { ok: true; value: string } | { ok: false; error: CommandError } {
        if (input < 0) {
          return Err(new CommandError("negative not allowed"));
        }
        return Ok(`processed: ${input}`);
      }

      const good = process(5);
      expect(good.ok).toBe(true);
      if (good.ok) expect(good.value).toBe("processed: 5");

      const bad = process(-1);
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(bad.error.message).toBe("negative not allowed");
    });
  });
});
