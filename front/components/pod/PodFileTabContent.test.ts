import { PodFileTabContent } from "@app/components/pod/PodFileTabContent";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { RichSpaceType } from "@app/types/api/spaces";
import type { PodFileTab } from "@app/types/pod_file_tab";
import { DEFAULT_POD_FILE_TAB_ICON } from "@app/types/pod_file_tab";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

interface Mocks {
  functionReferenceKind: "legacy" | "v2" | null;
  visualizationProps: { frameId?: string } | null;
}

const mocks = vi.hoisted<Mocks>(() => ({
  functionReferenceKind: "v2",
  visualizationProps: null,
}));

vi.mock("@app/components/pod/PodFrameVisualization", () => ({
  PodFrameVisualization: (props: { frameId?: string }) => {
    mocks.visualizationProps = props;
    return "pod-frame-visualization";
  },
}));

vi.mock("@app/hooks/usePodFrameRenderableContent", () => ({
  usePodFrameRenderableContent: () => ({
    fileContent: "frame bundle",
    fileId: "fil_frame",
    functionReferenceKind: mocks.functionReferenceKind,
    isLoading: false,
    isNotFound: false,
  }),
}));

vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({ vizUrl: "https://viz.dust.tt" }),
}));

vi.mock("@app/lib/swr/files", () => ({
  useFileMetadataFromPath: () => ({
    metadata: { contentType: "application/vnd.dust.frame.v2+json" },
    isFileMetadataLoading: false,
    isFileMetadataNotFound: false,
  }),
}));

const owner = LightWorkspaceFactory.build();
const podInfo = {
  archivedAt: null,
  canRead: true,
  canWrite: true,
  categories: {},
  createdAt: 0,
  description: null,
  frameTabs: [],
  groupIds: [],
  isAdminControlled: false,
  isEditor: true,
  isMember: true,
  isRestricted: false,
  kind: "project",
  lastTodoAnalysisAt: null,
  managementMode: "manual",
  members: [],
  name: "Project",
  pinnedFramePath: null,
  sId: "vlt_project",
  tabsOrder: [],
  todoGenerationEnabled: false,
  updatedAt: 0,
} satisfies RichSpaceType;
const tab = {
  icon: DEFAULT_POD_FILE_TAB_ICON,
  path: "pod-vlt_project/App/App.tsx",
  title: "App",
} satisfies PodFileTab;

afterEach(() => {
  cleanup();
  mocks.functionReferenceKind = "v2";
  mocks.visualizationProps = null;
});

describe("PodFileTabContent", () => {
  it("passes the stable identity only for a Frames v2 tab", () => {
    const props = { owner, podInfo, tab };
    const { rerender } = render(createElement(PodFileTabContent, props));

    expect(mocks.visualizationProps?.frameId).toBe("fil_frame");

    mocks.functionReferenceKind = "legacy";
    rerender(createElement(PodFileTabContent, props));

    expect(mocks.visualizationProps?.frameId).toBeUndefined();
  });

  it("fails closed when the path metadata is not a known Frame", () => {
    mocks.functionReferenceKind = null;

    render(createElement(PodFileTabContent, { owner, podInfo, tab }));

    expect(screen.getByText(/no longer available/i)).not.toBeNull();
    expect(mocks.visualizationProps).toBeNull();
  });
});
