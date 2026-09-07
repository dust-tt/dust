import { fireAndForgetNotification } from "@app/lib/notifications/fire_and_forget";
import logger from "@app/logger/logger";
import { describe, expect, it, vi } from "vitest";

describe("fireAndForgetNotification", () => {
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it("logs a thrown error instead of leaving an unhandled rejection", async () => {
    const onUnhandled = vi.fn();
    process.once("unhandledRejection", onUnhandled);
    const loggerSpy = vi
      .spyOn(logger, "error")
      .mockImplementation(() => logger);

    fireAndForgetNotification(
      Promise.reject(new Error("SequelizeConnectionAcquireTimeoutError")),
      { message: "Failed to notify", context: { conversationId: "abc" } }
    );
    await flush();

    expect(onUnhandled).not.toHaveBeenCalled();
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "abc" }),
      "Failed to notify"
    );
    process.off("unhandledRejection", onUnhandled);
    loggerSpy.mockRestore();
  });
});
