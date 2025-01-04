import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SpaceWebsiteModal } from "../SpaceWebsiteModal";
import { useDataSourceViewConnectorConfiguration } from "@app/lib/swr/data_source_views";
import { useSpaceDataSourceViews } from "@app/lib/swr/spaces";
import { vi } from "vitest";

// Mock the hooks
vi.mock("@app/lib/swr/data_source_views", () => ({
  useDataSourceViewConnectorConfiguration: vi.fn(),
}));

vi.mock("@app/lib/swr/spaces", () => ({
  useSpaceDataSourceViews: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("SpaceWebsiteModal", () => {
  const mockOwner = {
    sId: "test-workspace",
    name: "Test Workspace",
  };

  const mockSpace = {
    sId: "test-space",
    name: "Test Space",
    kind: "private",
  };

  beforeEach(() => {
    (useDataSourceViewConnectorConfiguration as jest.Mock).mockReturnValue({
      configuration: null,
      mutateConfiguration: vi.fn(),
      isConfigurationLoading: false,
    });

    (useSpaceDataSourceViews as jest.Mock).mockReturnValue({
      mutateRegardlessOfQueryParams: vi.fn(),
    });
  });

  it("validates form fields correctly", async () => {
    render(
      <SpaceWebsiteModal
        dataSourceView={null}
        isOpen={true}
        onClose={() => {}}
        owner={mockOwner}
        space={mockSpace}
      />
    );

    // Try to save with empty fields
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/Please provide a valid URL/i)).toBeInTheDocument();
      expect(screen.getByText(/Please provide a name/i)).toBeInTheDocument();
    });

    // Fill in invalid URL
    fireEvent.change(screen.getByPlaceholderText(/https:\/\/example.com\/articles/i), {
      target: { value: "not-a-url" },
    });

    await waitFor(() => {
      expect(screen.getByText(/Please provide a valid URL/i)).toBeInTheDocument();
    });

    // Fill in valid URL and name
    fireEvent.change(screen.getByPlaceholderText(/https:\/\/example.com\/articles/i), {
      target: { value: "https://example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Articles/i), {
      target: { value: "Test Website" },
    });

    await waitFor(() => {
      expect(screen.queryByText(/Please provide a valid URL/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Please provide a name/i)).not.toBeInTheDocument();
    });
  });

  it("handles website creation correctly", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    );
    global.fetch = mockFetch;

    render(
      <SpaceWebsiteModal
        dataSourceView={null}
        isOpen={true}
        onClose={() => {}}
        owner={mockOwner}
        space={mockSpace}
      />
    );

    // Fill in valid data
    fireEvent.change(screen.getByPlaceholderText(/https:\/\/example.com\/articles/i), {
      target: { value: "https://example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Articles/i), {
      target: { value: "Test Website" },
    });

    // Submit form
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/w/${mockOwner.sId}/spaces/${mockSpace.sId}/data_sources`,
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        })
      );
    });
  });
});