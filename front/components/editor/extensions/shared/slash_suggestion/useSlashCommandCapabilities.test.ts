import { useInputBarSlashCommandCapabilities } from "@app/components/editor/extensions/shared/slash_suggestion/useSlashCommandCapabilities";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useMCPServerViewsFromSpaces: vi.fn(),
  useSkills: vi.fn(),
  useSpaces: vi.fn(),
}));

vi.mock("@app/lib/swr/mcp_servers", () => ({
  useMCPServerViewsFromSpaces: mocks.useMCPServerViewsFromSpaces,
}));

vi.mock("@app/lib/swr/skill_configurations", () => ({
  useSkills: mocks.useSkills,
}));

vi.mock("@app/lib/swr/spaces", () => ({
  useSpaces: mocks.useSpaces,
}));

const OWNER: LightWorkspaceType = {
  id: 1,
  sId: "w_test",
  name: "Test Workspace",
  role: "admin",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  regionalModelsOnly: false,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

const SKILL: SkillWithoutInstructionsAndToolsType = {
  id: 1,
  sId: "skill_create_memo",
  createdAt: null,
  updatedAt: null,
  editedBy: null,
  status: "active",
  name: "Create memo",
  agentFacingDescription: "Draft a structured memo.",
  userFacingDescription: "Draft a structured memo.",
  icon: null,
  source: "web_app",
  sourceMetadata: null,
  reinforcement: "auto",
  selfImprovementLock: false,
  selfImprovementCostsCapMicroUsd: null,
  selfImprovementCostsCapAwuCredits: null,
  requestedSpaceIds: [],
  fileAttachments: [],
  canWrite: true,
  canAdministrate: true,
  isDefault: false,
};

const TOOL: MCPServerViewType = {
  id: 1,
  sId: "mcp_server_view_calendar",
  name: "Search calendar",
  description: "Search calendar events.",
  createdAt: 0,
  updatedAt: 0,
  spaceId: "space_global",
  serverType: "internal",
  server: {
    name: "calendar",
    version: "1.0.0",
    description: "Search calendar events.",
    sId: "mcp_server_calendar",
    icon: "ActionMagnifyingGlassIcon",
    authorization: null,
    tools: [],
    availability: "manual",
    allowMultipleInstances: false,
    documentationUrl: null,
  },
  oAuthUseCase: null,
  editedByUser: null,
};

describe("useInputBarSlashCommandCapabilities", () => {
  beforeEach(() => {
    mocks.useSpaces.mockReturnValue({
      spaces: [],
      isSpacesLoading: true,
      isSpacesError: undefined,
      mutate: vi.fn(),
    });
    mocks.useMCPServerViewsFromSpaces.mockReturnValue({
      serverViews: [],
      isLoading: true,
      isError: undefined,
      mutateServerViews: vi.fn(),
    });
    mocks.useSkills.mockReturnValue({
      skills: [],
      isSkillsError: false,
      isSkillsLoading: true,
      mutateSkills: vi.fn(),
    });
  });

  it("shows matching skills while tools are still loading", () => {
    const { result, rerender } = renderHook(() =>
      useInputBarSlashCommandCapabilities({
        owner: OWNER,
        query: "memo",
      })
    );

    expect(result.current.isLoading).toBe(true);

    mocks.useSkills.mockReturnValue({
      skills: [SKILL],
      isSkillsError: false,
      isSkillsLoading: false,
      mutateSkills: vi.fn(),
    });
    rerender();

    expect(result.current.capabilityItems.map((item) => item.id)).toEqual([
      SKILL.sId,
    ]);
    expect(result.current.isLoading).toBe(false);
  });

  it("does not flash an empty state before matching tools arrive", () => {
    mocks.useSkills.mockReturnValue({
      skills: [SKILL],
      isSkillsError: false,
      isSkillsLoading: false,
      mutateSkills: vi.fn(),
    });

    const { result, rerender } = renderHook(() =>
      useInputBarSlashCommandCapabilities({
        owner: OWNER,
        query: "calendar",
      })
    );

    expect(result.current.capabilityItems).toEqual([]);
    expect(result.current.isLoading).toBe(true);

    mocks.useSpaces.mockReturnValue({
      spaces: [],
      isSpacesLoading: false,
      isSpacesError: undefined,
      mutate: vi.fn(),
    });
    mocks.useMCPServerViewsFromSpaces.mockReturnValue({
      serverViews: [TOOL],
      isLoading: false,
      isError: undefined,
      mutateServerViews: vi.fn(),
    });
    rerender();

    expect(result.current.capabilityItems.map((item) => item.id)).toEqual([
      TOOL.sId,
    ]);
    expect(result.current.isLoading).toBe(false);
  });
});
