import { render, screen, fireEvent } from "@testing-library/react";
import { FoldersHeaderMenu } from "../FoldersHeaderMenu";
import { vi } from "vitest";

describe("FoldersHeaderMenu", () => {
  const mockContentActionsRef = {
    current: {
      callAction: vi.fn(),
    },
  };

  const mockOwner = {
    sId: "test-workspace",
    name: "Test Workspace",
  };

  const mockSpace = {
    sId: "test-space",
    name: "Test Space",
    kind: "private",
  };

  const mockFolder = {
    sId: "test-folder",
    name: "Test Folder",
    dataSource: {
      sId: "ds-1",
      name: "Test DataSource",
    },
  };

  it("renders correctly when user can write", () => {
    render(
      <FoldersHeaderMenu
        canWriteInSpace={true}
        contentActionsRef={mockContentActionsRef}
        folder={mockFolder}
        owner={mockOwner}
        space={mockSpace}
      />
    );

    expect(screen.getByRole("button", { name: /add data/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /edit folder/i })).toBeEnabled();
  });

  it("renders correctly when user cannot write", () => {
    render(
      <FoldersHeaderMenu
        canWriteInSpace={false}
        contentActionsRef={mockContentActionsRef}
        folder={mockFolder}
        owner={mockOwner}
        space={mockSpace}
      />
    );

    expect(screen.getByRole("button", { name: /add data/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /edit folder/i })).toBeDisabled();
  });

  it("shows tooltip with correct message for global space", () => {
    render(
      <FoldersHeaderMenu
        canWriteInSpace={false}
        contentActionsRef={mockContentActionsRef}
        folder={mockFolder}
        owner={mockOwner}
        space={{ ...mockSpace, kind: "global" }}
      />
    );

    expect(screen.getByText(/Only builders of the workspace can add data/i)).toBeInTheDocument();
    expect(screen.getByText(/Only builders of the workspace can edit a folder/i)).toBeInTheDocument();
  });

  it("calls correct actions when menu items are clicked", () => {
    render(
      <FoldersHeaderMenu
        canWriteInSpace={true}
        contentActionsRef={mockContentActionsRef}
        folder={mockFolder}
        owner={mockOwner}
        space={mockSpace}
      />
    );

    // Open dropdown menu
    fireEvent.click(screen.getByRole("button", { name: /add data/i }));

    // Click menu items
    fireEvent.click(screen.getByText(/create a document/i));
    expect(mockContentActionsRef.current.callAction).toHaveBeenCalledWith("DocumentUploadOrEdit");

    fireEvent.click(screen.getByText(/create a table/i));
    expect(mockContentActionsRef.current.callAction).toHaveBeenCalledWith("TableUploadOrEdit");

    fireEvent.click(screen.getByText(/upload multiple documents/i));
    expect(mockContentActionsRef.current.callAction).toHaveBeenCalledWith("MultipleDocumentsUpload");
  });
});