import { describe, expect, it } from "vitest";

import { generateSecureSecret } from "@app/lib/resources/string_ids";

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
