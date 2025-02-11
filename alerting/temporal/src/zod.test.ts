import { z } from "zod";

describe("Zod", () => {
  it("should validate basic types", () => {
    const schema = z.string();
    expect(schema.parse("test")).toBe("test");
    expect(() => schema.parse(123)).toThrow();
  });
});
