import { ConsumptionExportPanel } from "@app/components/workspace/analytics/consumption/ConsumptionExportPanel";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { mockUseConsumptionExports, mockUseStartConsumptionExport } = vi.hoisted(
  () => ({
    mockUseConsumptionExports: vi.fn(),
    mockUseStartConsumptionExport: vi.fn(),
  })
);

vi.mock("@app/hooks/useConsumptionExports", () => ({
  useConsumptionExports: mockUseConsumptionExports,
  useStartConsumptionExport: mockUseStartConsumptionExport,
}));

const exportBody = { period: "days", days: 30 } as const;

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: "Download raw data" }));
}

describe("ConsumptionExportPanel", () => {
  it("automatically starts an export exactly once when opened with nothing generated", async () => {
    const startConsumptionExport = vi.fn().mockResolvedValue(undefined);
    mockUseConsumptionExports.mockReturnValue({
      exports: [],
      isGenerating: false,
      isReady: false,
      isConsumptionExportsLoading: false,
      isConsumptionExportsError: undefined,
    });
    mockUseStartConsumptionExport.mockReturnValue({
      isStarting: false,
      startConsumptionExport,
    });

    render(
      <ConsumptionExportPanel
        workspaceId="workspace-id"
        exportBody={exportBody}
      />
    );

    openPanel();

    await waitFor(() => {
      expect(startConsumptionExport).toHaveBeenCalledTimes(1);
    });

    // Even though the export never appears (a failed/timed-out workflow also leaves
    // exports empty with isGenerating false), the effect must not fire again.
    await setTimeoutAsync(0);
    expect(startConsumptionExport).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("The export failed to generate.")
    ).toBeInTheDocument();
  });

  it("does not auto-start or show a stale generating spinner when the export list fails to load", async () => {
    const startConsumptionExport = vi.fn().mockResolvedValue(undefined);
    mockUseConsumptionExports.mockReturnValue({
      exports: [],
      isGenerating: false,
      isReady: false,
      isConsumptionExportsLoading: false,
      isConsumptionExportsError: new Error("boom"),
    });
    mockUseStartConsumptionExport.mockReturnValue({
      isStarting: false,
      startConsumptionExport,
    });

    render(
      <ConsumptionExportPanel
        workspaceId="workspace-id"
        exportBody={exportBody}
      />
    );

    openPanel();

    await setTimeoutAsync(0);

    expect(startConsumptionExport).not.toHaveBeenCalled();
    expect(screen.getByText("Could not load exports.")).toBeInTheDocument();
    expect(
      screen.queryByText("Generating your export…")
    ).not.toBeInTheDocument();
  });

  it("uses a scoped signed URL when the server provides one", () => {
    mockUseConsumptionExports.mockReturnValue({
      exports: [
        {
          name: "personal.csv",
          createdAt: "2026-08-21T10:00:00.000Z",
          sizeBytes: 123,
          downloadUrl: "https://signed-url.test/personal",
        },
      ],
      isGenerating: false,
      isReady: true,
      isConsumptionExportsLoading: false,
      isConsumptionExportsError: undefined,
    });
    mockUseStartConsumptionExport.mockReturnValue({
      isStarting: false,
      startConsumptionExport: vi.fn(),
    });

    render(
      <ConsumptionExportPanel
        workspaceId="workspace-id"
        exportBody={exportBody}
      />
    );
    openPanel();

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://signed-url.test/personal"
    );
  });
});
