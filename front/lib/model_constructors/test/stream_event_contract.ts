import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { expect } from "vitest";

export function expectStreamEventContract(
  events: ModelResponseEvent[],
  {
    terminalType,
    usageExpected,
  }: { terminalType: "error" | "success"; usageExpected: boolean }
): void {
  const terminalEvents = events.filter(
    (event) => event.type === "error" || event.type === "success"
  );

  expect(terminalEvents).toHaveLength(1);
  expect(events.at(-1)?.type).toBe(terminalType);

  const usageEvents = events.filter((event) => event.type === "token_usage");
  const usageIndex = events.findIndex((event) => event.type === "token_usage");
  if (usageExpected) {
    expect(usageEvents).toHaveLength(1);
    expect(usageIndex).toBeGreaterThanOrEqual(0);
    expect(usageIndex).toBeLessThan(events.length - 1);
  } else {
    expect(usageEvents).toHaveLength(0);
  }
}
