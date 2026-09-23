import { describe, expect, it } from "bun:test"
import { parseAgentSpec } from "./model-selection"

describe("parseAgentSpec", () => {
  it("parses a bare agent sId with no override", () => {
    const res = parseAgentSpec("dust")
    expect(res.isOk).toBe(true)
    if (!res.isOk) return
    expect(res.value).toEqual({
      label: "dust",
      agentId: "dust",
      modelSelection: undefined,
    })
  })

  it("parses a model override without an effort", () => {
    const res = parseAgentSpec("dust#xai/grok-4.6")
    expect(res.isOk).toBe(true)
    if (!res.isOk) return
    expect(res.value.agentId).toBe("dust")
    expect(res.value.modelSelection).toEqual({
      providerId: "xai",
      modelId: "grok-4.6",
    })
  })

  it("parses a model override with an effort", () => {
    const res = parseAgentSpec("dust#anthropic/claude-sonnet-4-6@high")
    expect(res.isOk).toBe(true)
    if (!res.isOk) return
    expect(res.value.label).toBe("dust#anthropic/claude-sonnet-4-6@high")
    expect(res.value.modelSelection).toEqual({
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
      reasoningEffort: "high",
    })
  })

  it("keeps slashes in the model id", () => {
    const res = parseAgentSpec(
      "dust#fireworks/accounts/fireworks/models/glm-5p3-flash@light"
    )
    expect(res.isOk).toBe(true)
    if (!res.isOk) return
    expect(res.value.modelSelection).toEqual({
      providerId: "fireworks",
      modelId: "accounts/fireworks/models/glm-5p3-flash",
      reasoningEffort: "light",
    })
  })

  it("rejects an unknown reasoning effort", () => {
    const res = parseAgentSpec("dust#openai/gpt-5.6-luna@max")
    expect(res.isOk).toBe(false)
    if (res.isOk) return
    expect(res.error.message).toContain("invalid reasoning effort 'max'")
  })

  it("rejects a model without a provider", () => {
    const res = parseAgentSpec("dust#grok-4.6")
    expect(res.isOk).toBe(false)
  })

  it("rejects a spec without an agent sId", () => {
    const res = parseAgentSpec("#xai/grok-4.6")
    expect(res.isOk).toBe(false)
  })
})
