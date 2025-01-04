import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DataSourceType, LightWorkspaceType } from "@dust-tt/types";
import { useDataSourceUsage } from "@app/lib/swr/data_source_usage";

// Mock the hook
jest.mock("@app/lib/swr/data_source_usage", () => ({
  useDataSourceUsage: jest.fn(),
}));

import { DeleteStaticDataSourceDialog } from "../DeleteStaticDataSourceDialog";

describe("DeleteStaticDataSourceDialog", () => {
  const mockOwner: LightWorkspaceType = {
    sId: "test-workspace",
    name: "Test Workspace",
    role: "admin",
  };

  const mockDataSource: DataSourceType = {
    sId: "test-ds",
    name: "Test Data Source",
    workspace_id: "test-workspace",
    provider_id: "test-provider",
    provider: "static",
    config: {},
    created: new Date(),
    updated: new Date(),
  };

  const mockHandleDelete = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useDataSourceUsage as jest.Mock).mockReturnValue({
      usage: null,
      isUsageLoading: false,
      isUsageError: false,
    });
  });

  it("renders with no usage data", () => {
    render(
      <DeleteStaticDataSourceDialog
        owner={mockOwner}
        dataSource={mockDataSource}
        handleDelete={mockHandleDelete}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText("No usage data available.")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    (useDataSourceUsage as jest.Mock).mockReturnValue({
      usage: null,
      isUsageLoading: true,
      isUsageError: false,
    });

    render(
      <DeleteStaticDataSourceDialog
        owner={mockOwner}
        dataSource={mockDataSource}
        handleDelete={mockHandleDelete}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText("Checking usage...")).toBeInTheDocument();
  });

  it("shows error state", () => {
    (useDataSourceUsage as jest.Mock).mockReturnValue({
      usage: null,
      isUsageLoading: false,
      isUsageError: true,
    });

    render(
      <DeleteStaticDataSourceDialog
        owner={mockOwner}
        dataSource={mockDataSource}
        handleDelete={mockHandleDelete}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText("Failed to check usage.")).toBeInTheDocument();
  });

  it("shows usage data when available", () => {
    (useDataSourceUsage as jest.Mock).mockReturnValue({
      usage: {
        count: 2,
        agentNames: ["Agent1", "Agent2"],
      },
      isUsageLoading: false,
      isUsageError: false,
    });

    render(
      <DeleteStaticDataSourceDialog
        owner={mockOwner}
        dataSource={mockDataSource}
        handleDelete={mockHandleDelete}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText(/2 assistants currently use/)).toBeInTheDocument();
    expect(screen.getByText(/Agent1, Agent2/)).toBeInTheDocument();
  });

  it("calls handleDelete when confirmed", async () => {
    render(
      <DeleteStaticDataSourceDialog
        owner={mockOwner}
        dataSource={mockDataSource}
        handleDelete={mockHandleDelete}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    const confirmButton = screen.getByRole("button", { name: /Remove/i });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockHandleDelete).toHaveBeenCalled();
    });
  });
});