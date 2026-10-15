import { PodFrameVisualization } from "@app/components/pod/PodFrameVisualization";
import type { LightWorkspaceType } from "@app/types/user";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  iframe: vi.fn((_props: unknown) => null),
  isFrameAuthor: false,
  permissionsCalls: [] as { disabled?: boolean; frameId: string }[],
}));

vi.mock("@app/lib/swr/frames", () => ({
  useFramePermissions: (args: { disabled?: boolean; frameId: string }) => {
    mocks.permissionsCalls.push(args);
    return { isFrameAuthor: mocks.isFrameAuthor };
  },
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
  mocks.isFrameAuthor = false;
  mocks.permissionsCalls.length = 0;
});

describe("PodFrameVisualization", () => {
  it.each([
    ["pod-spc_pod/Admin/Admin.frame.json", "pod-spc_pod/Admin"],
    ["manifest.json", null],
    [undefined, null],
  ])(
    "passes the Frame identity and package directory for %s",
    (framePath, framePackageRoot) => {
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
    }
  );

  it.each([
    [true, "latest"],
    [false, "live"],
  ])(
    "targets functions at the draft only for Frame authors (isFrameAuthor=%s -> %s)",
    (isFrameAuthor, functionTarget) => {
      mocks.isFrameAuthor = isFrameAuthor;

      render(
        <PodFrameVisualization
          owner={{ sId: "w_current" } as LightWorkspaceType}
          fileContent="export default function Frame() {}"
          vizUrl="https://viz.dust.tt"
          identifier="viz-frame"
          frameId="fil_frame"
        />
      );

      expect(mocks.permissionsCalls.at(-1)).toMatchObject({
        disabled: false,
        frameId: "fil_frame",
      });
      expect(mocks.iframe).toHaveBeenCalledWith(
        expect.objectContaining({ functionTarget })
      );
    }
  );

  it("does not look up Frame permissions for a legacy Frame", () => {
    render(
      <PodFrameVisualization
        owner={{ sId: "w_current" } as LightWorkspaceType}
        fileContent="export default function Frame() {}"
        vizUrl="https://viz.dust.tt"
        identifier="viz-frame"
      />
    );

    expect(mocks.permissionsCalls.at(-1)).toMatchObject({ disabled: true });
    expect(mocks.iframe).toHaveBeenCalledWith(
      expect.objectContaining({ functionTarget: "live" })
    );
  });
});
