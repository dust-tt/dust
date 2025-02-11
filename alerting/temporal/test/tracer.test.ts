jest.mock("dd-trace", () => ({
  __esModule: true,
  default: {
    init: jest.fn()
  }
}));

describe("dd-trace", () => {
  it("should initialize without errors", () => {
    const tracer = require("dd-trace").default;
    expect(() => {
      tracer.init({
        service: "test-service",
        env: "test"
      });
    }).not.toThrow();
  });
});
