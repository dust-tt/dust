import { PodFrameVisualization } from "@app/components/pod/PodFrameVisualization";
import type { LightWorkspaceType } from "@app/types/user";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  iframe: vi.fn((_props: unknown) => null),
}));

vi.mock(
  "@app/components/assistant/conversation/actions/AuthenticatedVisualizationActionIframe",
  async () => {
    const { forwardRef } =
      await vi.importActual<typeof import("react")>("react");
    return {
      AuthenticatedVisualizationActionIframe: forwardRef((props, _ref) => {
        mocks.iframe(props);
        return null;
      }),
    };
  }
);

afterEach(() => {
  vi.clearAllMocks();
});

describe("PodFrameVisualization", () => {
  it.each([
    ["pod-spc_pod/Admin/Admin.frame.json", "pod-spc_pod/Admin"],
    ["manifest.json", null],
    [undefined, null],
  ])("passes the Frame identity and package directory for %s", (framePath, framePackageRoot) => {
    render(
      <PodFrameVisualization
        owner={{ sId: "w_current" } as LightWorkspaceType}
        spaceId="spc_pod"
        fileContent="export default function Frame() {}"
        vizUrl="https://viz.dust.tt"
        identifier="viz-frame"
        frameId="fil_frame"
        framePath={framePath}
      />
    );

    expect(mocks.iframe).toHaveBeenCalledWith(
      expect.objectContaining({
        frameId: "fil_frame",
        framePackageRoot,
      })
    );
  });
});
