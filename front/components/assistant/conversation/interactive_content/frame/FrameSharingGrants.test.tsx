import { FrameSharingGrants } from "@app/components/assistant/conversation/interactive_content/frame/FrameSharingGrants";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

it("explains why a public domain is rejected and allows inviting a named address instead", async () => {
  const onAdd = vi.fn().mockResolvedValue(true);
  render(
    <FrameSharingGrants
      sharing={{ grants: [], accessGrants: [], canGrantDomains: true }}
      canInviteExternal={true}
      canRevoke={true}
      isLoading={false}
      hasError={false}
      onAdd={onAdd}
      onRevoke={vi.fn()}
      onRetry={vi.fn()}
    />
  );
  const input = screen.getByRole("textbox", { name: "Add people or domains" });
  const submit = screen.getByRole("button", { name: "Add" });

  fireEvent.change(input, { target: { value: "example.com, @GMAIL.COM" } });
  fireEvent.click(submit);

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(
    '"@GMAIL.COM": Public or disposable email domains are not allowed. Invite individual email addresses instead.'
  );
  expect(
    screen.queryByText(/Invitations are sent to email addresses only/)
  ).not.toBeInTheDocument();
  expect(input).toHaveAttribute("aria-describedby", alert.id);
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(onAdd).not.toHaveBeenCalled();

  fireEvent.change(input, {
    target: { value: "example.com, alice@gmail.com" },
  });
  fireEvent.click(submit);

  await waitFor(() => {
    expect(onAdd).toHaveBeenCalledExactlyOnceWith({
      emails: ["alice@gmail.com"],
      domains: ["example.com"],
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
