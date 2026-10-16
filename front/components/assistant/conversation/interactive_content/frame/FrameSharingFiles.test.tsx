import { FrameSharingFiles } from "@app/components/assistant/conversation/interactive_content/frame/FrameSharingFiles";
import type { ShareFrameViewerFile } from "@app/lib/api/viz/share_frame_viewer_files";
import { Button, Popover } from "@dust-tt/sparkle";
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

it("opens a file dialog and returns keyboard focus to the sharing popover", async () => {
  const user = userEvent.setup();
  render(
    <Popover
      trigger={<Button label="Share" />}
      popoverTriggerAsChild
      aria-label="Share frame"
      content={<FrameSharingFiles viewerFiles={viewerFiles} variant="live" />}
      preventAutoFocusOnClose={false}
    />
  );

  const share = screen.getByRole("button", { name: "Share" });
  await user.click(share);

  const notice = screen.getByText(/They can’t access the rest/);
  expect(notice).toHaveTextContent(
    "People who can view this frame can also access the files and data it uses. They can’t access the rest of the conversation or pod."
  );
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "View 2 files" });
  expect(trigger).toHaveAttribute("aria-haspopup", "dialog");

  expect(trigger).toHaveFocus();
  await user.keyboard("{Enter}");
  const dialog = screen.getByRole("dialog", { name: "Included files" });
  const list = within(dialog).getByRole("list", { name: "Included files" });
  expect(
    within(dialog).getByRole("region", { name: "Included file list" })
  ).toHaveFocus();
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  expect(within(list).getAllByText("quarterly_results.csv")).toHaveLength(2);
  expect(
    within(list).getByText("Conversation · Quarterly review")
  ).toBeVisible();
  expect(within(list).getByText("Pod · Finance")).toBeVisible();
  expect(within(list).getByText("/reports/2026")).toBeVisible();
  expect(notice).toBeVisible();

  await user.keyboard("{Escape}");
  await waitFor(() => {
    expect(
      screen.queryByRole("dialog", { name: "Included files" })
    ).not.toBeInTheDocument();
  });
  expect(notice).toBeVisible();
  expect(trigger).toHaveFocus();

  await user.keyboard(" ");
  await user.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(trigger).toHaveFocus());

  await user.keyboard("{Escape}");
  await waitFor(() => expect(share).toHaveFocus());
});

it("omits the file notice when no files are included", () => {
  const { container } = render(
    <FrameSharingFiles viewerFiles={[]} variant="live" />
  );
  expect(container).toBeEmptyDOMElement();
});

it("uses future tense for the files a pending draft will share", () => {
  render(<FrameSharingFiles viewerFiles={viewerFiles} variant="pending" />);

  expect(
    screen.getByText("These files and data will be shared too")
  ).toBeVisible();
  expect(
    screen.getByText(/Once your changes are live, people who can view/)
  ).toBeVisible();
  expect(
    screen.queryByText("Files and data used by this frame are shared too")
  ).not.toBeInTheDocument();
});
