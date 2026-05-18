import { createMetronomeCredit } from "@app/lib/metronome/client";
import type { Result } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

function unwrapOk<T>(result: Result<T, Error>): T {
  expect(result.isOk()).toBe(true);
  if (!result.isOk()) {
    throw new Error("Expected Ok");
  }
  return result.value;
}

function unwrapErr<T>(result: Result<T, Error>): Error {
  expect(result.isErr()).toBe(true);
  if (!result.isErr()) {
    throw new Error("Expected Err");
  }
  return result.error;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockCreate, mockList, MockConflictError } = vi.hoisted(() => {
  class MockConflictError extends Error {
    status = 409;
  }
  return {
    mockCreate: vi.fn(),
    mockList: vi.fn(),
    MockConflictError,
  };
});

vi.mock("@metronome/sdk", () => {
  // Must use a regular function (not an arrow) so it can be called with `new`.
  function MockMetronome() {
    return {
      v1: {
        customers: {
          credits: { create: mockCreate, list: mockList },
        },
      },
    };
  }
  return { default: MockMetronome, ConflictError: MockConflictError };
});

vi.mock("@app/lib/api/config", () => ({
  default: { getMetronomeApiKey: () => "test-api-key" },
}));

vi.mock("@app/logger/logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_PARAMS = {
  metronomeCustomerId: "cust-1",
  productId: "prod-1",
  creditTypeId: "credit-type-usd",
  amount: 10_000,
  startingAt: "2026-04-01T00:00:00.000Z",
  endingBefore: "2027-04-01T00:00:00.000Z",
  name: "Test credit",
  idempotencyKey: "key-1",
  priority: 1,
};

beforeEach(() => {
  mockCreate.mockReset();
  mockList.mockReset();
  mockCreate.mockResolvedValue({ data: { id: "credit-id-1" } });
});

// ---------------------------------------------------------------------------
// createMetronomeCredit
// ---------------------------------------------------------------------------

describe("createMetronomeCredit", () => {
  it("forwards priority to the API call", async () => {
    await createMetronomeCredit({ ...BASE_PARAMS, priority: 0 });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 0 })
    );
  });

  it("spreads applicableProductTags when provided", async () => {
    await createMetronomeCredit({
      ...BASE_PARAMS,
      applicableProductTags: ["usage"],
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ applicable_product_tags: ["usage"] })
    );
  });

  it("spreads applicableProductIds when provided", async () => {
    await createMetronomeCredit({
      ...BASE_PARAMS,
      applicableProductIds: ["prod-seat"],
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ applicable_product_ids: ["prod-seat"] })
    );
  });

  it("omits both applicable fields when neither is provided", async () => {
    await createMetronomeCredit(BASE_PARAMS);

    const call = mockCreate.mock.calls[0][0];
    expect(call).not.toHaveProperty("applicable_product_tags");
    expect(call).not.toHaveProperty("applicable_product_ids");
  });

  it("returns Ok with the credit id on success", async () => {
    const result = await createMetronomeCredit(BASE_PARAMS);

    expect(unwrapOk(result)).toEqual({ id: "credit-id-1" });
  });

  it("on ConflictError, looks up the existing credit and returns its id", async () => {
    mockCreate.mockRejectedValueOnce(new MockConflictError("conflict"));
    mockList.mockResolvedValue({
      data: [{ id: "existing-id", uniqueness_key: BASE_PARAMS.idempotencyKey }],
    });

    const result = await createMetronomeCredit(BASE_PARAMS);

    expect(unwrapOk(result)).toEqual({ id: "existing-id" });
  });

  it("on ConflictError with no matching credit in list, returns Ok(null)", async () => {
    mockCreate.mockRejectedValueOnce(new MockConflictError("conflict"));
    mockList.mockResolvedValue({ data: [] });

    const result = await createMetronomeCredit(BASE_PARAMS);

    expect(unwrapOk(result)).toBeNull();
  });

  it("returns Err on non-conflict API failure", async () => {
    mockCreate.mockRejectedValueOnce(new Error("network error"));

    const result = await createMetronomeCredit(BASE_PARAMS);

    expect(unwrapErr(result).message).toMatch(/network error/);
  });
});
