import {
  generateRandomModelSId,
  generateSecureSecret,
} from "@app/lib/resources/string_ids";
import { describe, expect, it } from "vitest";

describe("generateSecureSecret", () => {
  it("default call generates 64-char alphanumeric string", () => {
    const secret = generateSecureSecret();
    expect(secret).toHaveLength(64);
    expect(/^[A-Za-z0-9]+$/.test(secret)).toBe(true);
  });

  it("custom length generates 100-char alphanumeric string", () => {
    const secret = generateSecureSecret(100);
    expect(secret).toHaveLength(100);
    expect(/^[A-Za-z0-9]+$/.test(secret)).toBe(true);
  });
});

describe("generateRandomModelSId", () => {
  it("generates a 10-char alphanumeric string without prefix", () => {
    const sId = generateRandomModelSId();
    expect(sId).toHaveLength(10);
    expect(/^[A-Za-z0-9]+$/.test(sId)).toBe(true);
  });

  it("generates a string with the correct prefix when provided", () => {
    const sId = generateRandomModelSId("conv");
    expect(sId.startsWith("conv_")).toBe(true);
    const suffix = sId.slice("conv_".length);
    expect(suffix).toHaveLength(10);
    expect(/^[A-Za-z0-9]+$/.test(suffix)).toBe(true);
  });

  it("generates different values on each call", () => {
    const sId1 = generateRandomModelSId();
    const sId2 = generateRandomModelSId();
    expect(sId1).not.toBe(sId2);
  });
});
