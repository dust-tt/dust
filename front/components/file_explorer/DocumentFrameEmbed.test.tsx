import { DocumentFrameEmbed } from "@app/components/file_explorer/DocumentFrameEmbed";
import { PodFrameVisualization } from "@app/components/pod/PodFrameVisualization";
import { usePodFrameRenderableContent } from "@app/hooks/usePodFrameRenderableContent";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { frameV2ContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/components/pod/PodFrameVisualization", () => ({
  PodFrameVisualization: vi.fn(() => null),
}));
vi.mock("@app/hooks/usePodFrameRenderableContent", () => ({
  usePodFrameRenderableContent: vi.fn(),
}));
vi.mock("@app/lib/swr/spaces", () => ({
  useSpaceInfo: vi.fn(),
}));

const owner = { sId: "w_1" } as LightWorkspaceType;
const AUTH = { vizUrl: "https://viz.dust.tt" } as AuthContextValue;

const renderEmbed = (path: string) =>
  render(
    <AuthContext.Provider value={AUTH}>
      <DocumentFrameEmbed
        owner={owner}
        path={path}
        height={600}
        frameProps={{ region: "EU" }}
      />
    </AuthContext.Provider>
  );

describe("DocumentFrameEmbed", () => {
  beforeEach(() => {
    vi.mocked(usePodFrameRenderableContent).mockReturnValue({
      fileId: "fil_frame",
      fileContent: "export default function Frame() {}",
      fileContentType: frameV2ContentType,
      isLoading: false,
      isNotFound: false,
      error: null,
    });
    vi.mocked(useSpaceInfo).mockReturnValue({
      spaceInfo: null,
      isSpaceInfoLoading: false,
    } as unknown as ReturnType<typeof useSpaceInfo>);
  });

  it("renders a pod's Frame with the reader's roles in that pod", () => {
    vi.mocked(useSpaceInfo).mockReturnValue({
      spaceInfo: { isEditor: true, isMember: true },
      isSpaceInfoLoading: false,
    } as unknown as ReturnType<typeof useSpaceInfo>);

    renderEmbed("pod-spc_pod/dashboards/revenue.frame.json");

    expect(useSpaceInfo).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w_1", spaceId: "spc_pod" })
    );
    expect(PodFrameVisualization).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: "spc_pod",
        conversationId: null,
        isPodEditor: true,
        isPodMember: true,
        frameId: "fil_frame",
        framePath: "pod-spc_pod/dashboards/revenue.frame.json",
        frameProps: { region: "EU" },
      }),
      expect.anything()
    );
  });

  it("renders a conversation's Frame without looking up a pod", () => {
    renderEmbed("conversation-c1/chart.frame.json");

    expect(useSpaceInfo).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: null, disabled: true })
    );
    expect(PodFrameVisualization).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: undefined,
        conversationId: "c1",
        isPodEditor: undefined,
        isPodMember: undefined,
      }),
      expect.anything()
    );
  });

  it("waits for the reader's pod roles before rendering the Frame", () => {
    vi.mocked(useSpaceInfo).mockReturnValue({
      spaceInfo: null,
      isSpaceInfoLoading: true,
    } as unknown as ReturnType<typeof useSpaceInfo>);

    renderEmbed("pod-spc_pod/dashboards/revenue.frame.json");

    expect(PodFrameVisualization).not.toHaveBeenCalled();
  });

  it("shows the path of a file that is not a Frame", () => {
    vi.mocked(usePodFrameRenderableContent).mockReturnValue({
      fileId: "fil_doc",
      fileContent: "# Doc",
      fileContentType: "text/markdown",
      isLoading: false,
      isNotFound: false,
      error: null,
    });

    renderEmbed("pod-spc_pod/notes.md");

    expect(screen.getByText("pod-spc_pod/notes.md")).toBeDefined();
    expect(PodFrameVisualization).not.toHaveBeenCalled();
  });
});
