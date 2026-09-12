import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { yamlScalar } from "../src/yaml.ts";

describe("yamlScalar", () => {
  it("leaves simple strings unquoted", () => {
    assert.equal(yamlScalar("ilias@dust.tt"), "ilias@dust.tt");
    assert.equal(yamlScalar("GoogleMeet"), "GoogleMeet");
  });

  it("quotes strings that would break YAML", () => {
    assert.equal(yamlScalar("Acme — Enterprise"), JSON.stringify("Acme — Enterprise"));
    assert.equal(yamlScalar("a: b"), JSON.stringify("a: b"));
    assert.equal(yamlScalar(""), JSON.stringify(""));
    assert.equal(yamlScalar("true"), JSON.stringify("true"));
  });

  it("serializes primitives", () => {
    assert.equal(yamlScalar(true), "true");
    assert.equal(yamlScalar(12), "12");
    assert.equal(yamlScalar(null), "null");
    assert.equal(yamlScalar(undefined), "null");
  });
});
