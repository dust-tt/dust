import { describe, expect, it } from "vitest";

import { createCallbackReader } from "./utils";

describe("Utils", () => {
  describe("createCallbackReader", () => {
    it("should create a callback reader", () => {
      const reader = createCallbackReader<number>();
      expect(reader).toBeDefined();
    });

    it("should push and pull values", async () => {
      const reader = createCallbackReader<number>();
      reader.callback(1);
      expect(await reader.next()).toBe(1);
    });

    it("should push and pull multiple values", async () => {
      const reader = createCallbackReader<number>();
      reader.callback(1);
      reader.callback(2);
      expect(await reader.next()).toBe(1);
      expect(await reader.next()).toBe(2);
    });

    it("should push and pull multiple values in order", async () => {
      const reader = createCallbackReader<number>();
      setTimeout(() => {
        reader.callback(1);
        reader.callback(2);
      }, 0);
      setTimeout(() => {
        reader.callback(3);
      }, 0);
      expect(await reader.next()).toBe(1);
      expect(await reader.next()).toBe(2);
      expect(await reader.next()).toBe(3);
    });

    it("return a promise that resolves to the same value when calling next before it is resolved", async () => {
      const reader = createCallbackReader<number>();
      const promise1 = reader.next();
      const promise2 = reader.next();

      reader.callback(1);

      expect(promise1).toBe(promise2);

      expect(await promise1).toBe(1);
      expect(await promise2).toBe(1);

      reader.callback(2);
      expect(await reader.next()).toBe(2);
    });
  });
});
