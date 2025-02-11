import { labelsResponseDataSchema, queryResponseDataSchema } from "../index";

describe("Schema validation", () => {
  test("labelsResponseDataSchema validates successful response", () => {
    const validData = {
      status: "success",
      data: ["metric1", "metric2"]
    };
    expect(() => labelsResponseDataSchema.parse(validData)).not.toThrow();
  });

  test("queryResponseDataSchema validates successful response", () => {
    const validData = {
      status: "success",
      data: {
        resultType: "matrix",
        result: [{
          metric: { label: "value" },
          values: [[1234567890, "1.23"]]
        }]
      }
    };
    expect(() => queryResponseDataSchema.parse(validData)).not.toThrow();
  });
});
