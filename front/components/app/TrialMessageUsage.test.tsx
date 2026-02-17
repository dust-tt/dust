import { render, screen } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TrialMessageUsage } from "./TrialMessageUsage";

vi.mock("@dust-tt/sparkle", () => ({
  Button: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
  LinkWrapper: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
}));

const mockedUseTrialMessageUsage = vi.fn();
vi.mock("@app/lib/swr/trial_message_usage", () => ({
  useTrialMessageUsage: () => mockedUseTrialMessageUsage(),
}));

describe("TrialMessageUsage", () => {
  beforeEach(() => {
    mockedUseTrialMessageUsage.mockReset();
  });

  it("does not render when remaining messages are 90 or more", () => {
    mockedUseTrialMessageUsage.mockReturnValue({
      messageUsage: { count: 10, limit: 100 }, // remaining 90
      mutateMessageUsage: vi.fn(),
    });

    render(<TrialMessageUsage isAdmin={false} workspaceId="w_1" />);
    expect(screen.queryByText("Trial messages used")).toBeNull();
  });

  it("renders when remaining messages are less than 90", () => {
    mockedUseTrialMessageUsage.mockReturnValue({
      messageUsage: { count: 11, limit: 100 }, // remaining 89
      mutateMessageUsage: vi.fn(),
    });

    render(<TrialMessageUsage isAdmin={false} workspaceId="w_1" />);
    expect(screen.getByText("Trial messages used")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText(/\/\s*100/)).toBeInTheDocument();
  });

  it("does not render when usage is unlimited", () => {
    mockedUseTrialMessageUsage.mockReturnValue({
      messageUsage: { count: 0, limit: -1 },
      mutateMessageUsage: vi.fn(),
    });

    render(<TrialMessageUsage isAdmin={false} workspaceId="w_1" />);
    expect(screen.queryByText("Trial messages used")).toBeNull();
  });
});
