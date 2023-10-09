import { checkDatasetData, getDatasetTypes } from "@app/lib/datasets";

describe("checkDatasetData", function () {
  test("returns dataset keys if there are no key mismatch", function () {
    const dataset = [{ hello: "world" }, { hello: "dust" }];
    const keys = checkDatasetData({ data: dataset });
    expect(keys).toEqual(["hello"]);
  });

  test("throws an error if data is not an array", function () {
    const dataset = { hello: "world" };
    expect(() => checkDatasetData({ data: dataset as any })).toThrow(
      "data must be an array"
    );
  });

  test("throws an error if data is an empty array", function () {
    const dataset: object[] = [];
    expect(() => checkDatasetData({ data: dataset })).toThrow(
      "Data must be a non-empty array"
    );
  });

  test("throws an error if there is a key mismatch", function () {
    const dataset = [{ hello: "world" }, { hello: "dust", foo: "bar" }];
    expect(() => checkDatasetData({ data: dataset })).toThrow(
      "Keys mismatch between data entries: hello != hello,foo"
    );
  });
});

describe("getDatasetTypes", function () {
  test("returns the types of the dataset keys", function () {
    const datasetKeys = ["hello", "world", "dust", "foo", "bar"];
    const entry = {
      hello: "world",
      world: 1,
      dust: true,
      foo: null,
      bar: { whats: "up" },
    };
    const types = getDatasetTypes(datasetKeys, entry);
    expect(types).toEqual(["string", "number", "boolean", "object", "object"]);
  });
});
