import { FrameSharingFiles } from "@app/components/assistant/conversation/interactive_content/frame/FrameSharingFiles";
import type { ShareFrameViewerFile } from "@app/lib/api/viz/share_frame_viewer_files";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

const viewerFiles: ShareFrameViewerFile[] = [
  {
    ref: "file_1",
    name: "quarterly_results.csv",
    contentType: "text/csv",
    sourceKind: "conversation",
    sourceName: "Quarterly review",
  },
  {
    ref: "file_2",
    name: "quarterly_results.csv",
    contentType: "text/csv",
    sourceKind: "pod",
    sourceName: "Finance",
    pathInSource: "reports/2026",
  },
];

it("keeps the sharing notice visible while the file list is opened and closed with the keyboard", async () => {
  const user = userEvent.setup();
  render(<FrameSharingFiles viewerFiles={viewerFiles} />);

  const notice = screen.getByText(/Sharing does not grant access to the rest/);
  expect(notice).toHaveTextContent(
    "Viewers can access the files and data used by this frame. Sharing does not grant access to the rest of the conversation or pod."
  );
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
  const toggle = screen.getByRole("button", { name: "2 included files" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");

  await user.tab();
  expect(toggle).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  const list = screen.getByRole("list", { name: "Included files" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  expect(within(list).getAllByText("quarterly_results.csv")).toHaveLength(2);
  expect(
    within(list).getByText("Conversation · Quarterly review")
  ).toBeVisible();
  expect(within(list).getByText("Pod · Finance")).toBeVisible();
  expect(within(list).getByText("/reports/2026")).toBeVisible();
  expect(notice).toBeVisible();

  await user.keyboard(" ");
  await waitFor(() => {
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
  expect(notice).toBeVisible();
  expect(toggle).toHaveFocus();
  expect(toggle).toHaveAttribute("aria-expanded", "false");
});

it("omits the file notice when no files are included", () => {
  const { container } = render(<FrameSharingFiles viewerFiles={[]} />);
  expect(container).toBeEmptyDOMElement();
});
