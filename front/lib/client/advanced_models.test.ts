import {
  CLAUDE_OPUS_4_6_MODEL_ID,
  CLAUDE_OPUS_4_7_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import { describe, expect, it } from "vitest";

import { resolveAdvancedModelsForUser } from "./advanced_models";

const opus = {
  providerId: "anthropic" as const,
  modelId: CLAUDE_OPUS_4_6_MODEL_ID,
};

const sonnet = {
  providerId: "anthropic" as const,
  modelId: CLAUDE_SONNET_4_6_MODEL_ID,
};

describe("resolveAdvancedModelsForUser", () => {
  it("returns the union of workspace, group, and user models", () => {
    const result = resolveAdvancedModelsForUser({
      userId: "user1",
      groupNames: ["Engineering"],
      groupNameToId: new Map([["Engineering", "group1"]]),
      userAllowedAdvancedModelsByUserId: {
        user1: [sonnet],
      },
      groupAdvancedModelsByGroupId: {
        group1: [opus],
      },
      workspaceAllowedAdvancedModels: [
        {
          providerId: "anthropic",
          modelId: CLAUDE_OPUS_4_7_MODEL_ID,
        },
      ],
    });

    expect(result.models).toHaveLength(3);
    expect(result.hasUserLevelOverride).toBe(true);
  });

  it("deduplicates models present in multiple scopes", () => {
    const result = resolveAdvancedModelsForUser({
      userId: "user1",
      groupNames: ["Engineering"],
      groupNameToId: new Map([["Engineering", "group1"]]),
      userAllowedAdvancedModelsByUserId: {
        user1: [opus],
      },
      groupAdvancedModelsByGroupId: {
        group1: [opus],
      },
      workspaceAllowedAdvancedModels: [opus],
    });

    expect(result.models).toEqual([opus]);
    expect(result.hasUserLevelOverride).toBe(true);
  });

  it("marks hasUserLevelOverride when the user has direct grants", () => {
    const withOverride = resolveAdvancedModelsForUser({
      userId: "user1",
      groupNames: [],
      groupNameToId: new Map(),
      userAllowedAdvancedModelsByUserId: {
        user1: [opus],
      },
      groupAdvancedModelsByGroupId: {},
      workspaceAllowedAdvancedModels: [],
    });

    const withoutOverride = resolveAdvancedModelsForUser({
      userId: "user1",
      groupNames: [],
      groupNameToId: new Map(),
      userAllowedAdvancedModelsByUserId: {},
      groupAdvancedModelsByGroupId: {},
      workspaceAllowedAdvancedModels: [opus],
    });

    expect(withOverride.hasUserLevelOverride).toBe(true);
    expect(withoutOverride.hasUserLevelOverride).toBe(false);
  });

  it("ignores group models when the group name cannot be resolved", () => {
    const result = resolveAdvancedModelsForUser({
      userId: "user1",
      groupNames: ["Unknown group"],
      groupNameToId: new Map(),
      userAllowedAdvancedModelsByUserId: {},
      groupAdvancedModelsByGroupId: {
        group1: [opus],
      },
      workspaceAllowedAdvancedModels: [],
    });

    expect(result.models).toEqual([]);
    expect(result.hasUserLevelOverride).toBe(false);
  });
});
