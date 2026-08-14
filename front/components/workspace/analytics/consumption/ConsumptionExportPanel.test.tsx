import { ConsumptionExportPanel } from "@app/components/workspace/analytics/consumption/ConsumptionExportPanel";
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
    await new Promise((resolve) => setTimeout(resolve, 0));
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

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(startConsumptionExport).not.toHaveBeenCalled();
    expect(screen.getByText("Could not load exports.")).toBeInTheDocument();
    expect(
      screen.queryByText("Generating your export…")
    ).not.toBeInTheDocument();
  });
});
