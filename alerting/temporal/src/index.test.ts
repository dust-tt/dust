import axios from "axios";

describe("axios tests", () => {
  it("should import axios correctly", () => {
    expect(axios).toBeDefined();
    expect(typeof axios.get).toBe("function");
  });
});
