import "@testing-library/jest-dom/vitest";
import "vitest-canvas-mock";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll } from "vitest";

beforeAll(() => {});

// runs a clean after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup();
});
