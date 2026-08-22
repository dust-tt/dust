import { EgressDomainListEditor } from "@app/components/sandbox/EgressDomainListEditor";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const baseProps = {
  allowedDomains: ["api.github.com"],
  pendingRequests: [{ domain: "api.stripe.com" }],
  onSave: vi.fn(async () => true),
  onApproveRequest: vi.fn(),
  onRejectRequest: vi.fn(),
  isUpdating: false,
  emptyMessage: "No domains are currently allowed.",
};

describe("EgressDomainListEditor", () => {
  it("renders domains and pending requests but no controls when read-only", () => {
    render(<EgressDomainListEditor {...baseProps} readOnly />);

    // The allowed domain and the pending request are still visible.
    expect(screen.getByText("api.github.com")).toBeInTheDocument();
    expect(screen.getByText("api.stripe.com")).toBeInTheDocument();
    expect(screen.getByText("Pending approval")).toBeInTheDocument();

    // No add input and no add/remove/approve/reject controls.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByLabelText("Domain")).not.toBeInTheDocument();
  });

  it("renders the mutation controls when editable", () => {
    render(<EgressDomainListEditor {...baseProps} />);

    expect(
      screen.getByRole("button", { name: "Add domain" })
    ).toBeInTheDocument();
    // The Approve button's accessible name comes from its tooltip, so match the
    // visible label text instead.
    expect(screen.getByText("Approve")).toBeInTheDocument();
  });
});
