import { RemoteMCPServerConfigurationSection } from "@app/components/actions/mcp/create/RemoteMCPServerConfigurationSection";
import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/forms/types";
import { createMCPServerDialogFormSchema } from "@app/components/actions/mcp/forms/types";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import type { FetcherFn } from "@app/lib/swr/fetcher";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";

const REDIRECT_URI = "https://legacy.example.com/oauth/mcp_static/finalize";
const CALLBACK_ENDPOINT = "/api/w/test-workspace/oauth/mcp_static/redirect_uri";
const PRESET: DefaultRemoteMCPServerConfig = {
  id: 12345,
  name: "Example MCP",
  description: "A remote server with Static OAuth.",
  url: "https://mcp.example.com",
  icon: "ActionGlobeAltIcon",
  authMethod: "oauth-static",
};

function TestForm({
  fetcher,
  defaultServerConfig,
  authMethod = "oauth-static",
  isOpen = true,
}: {
  fetcher: FetcherFn;
  defaultServerConfig?: DefaultRemoteMCPServerConfig;
  authMethod?: CreateMCPServerDialogFormValues["authMethod"];
  isOpen?: boolean;
}) {
  const form = useForm<CreateMCPServerDialogFormValues>({
    defaultValues: createMCPServerDialogFormSchema.parse({ authMethod }),
  });
  return (
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <FetcherProvider fetcher={fetcher} fetcherWithBody={vi.fn()}>
        <FormProvider {...form}>
          <RemoteMCPServerConfigurationSection
            workspaceId="test-workspace"
            isOpen={isOpen}
            defaultServerConfig={defaultServerConfig}
            onAuthorizationChange={vi.fn()}
          />
        </FormProvider>
      </FetcherProvider>
    </SWRConfig>
  );
}

describe("Static OAuth callback instructions", () => {
  it.each([
    { name: "custom server", defaultServerConfig: undefined },
    { name: "catalog preset", defaultServerConfig: PRESET },
  ])("shows the server's configured callback for a $name", async ({
    defaultServerConfig,
  }) => {
    const fetcher = vi.fn().mockResolvedValue({ redirectUri: REDIRECT_URI });
    render(
      <TestForm fetcher={fetcher} defaultServerConfig={defaultServerConfig} />
    );

    expect(await screen.findByText(REDIRECT_URI)).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith(CALLBACK_ENDPOINT);
    expect(screen.queryByText(/app\.dust\.tt/)).not.toBeInTheDocument();
  });

  it("does not show a browser-computed callback while loading", () => {
    const fetcher = vi.fn(() => new Promise(() => {}));
    render(<TestForm fetcher={fetcher} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading redirect URI"
    );
    expect(screen.queryByText(/app\.dust\.tt/)).not.toBeInTheDocument();
  });

  it("allows retrying a failed request without falling back to the app callback", async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("API unavailable"))
      .mockRejectedValueOnce(new Error("API still unavailable"))
      .mockResolvedValue({ redirectUri: REDIRECT_URI });
    render(<TestForm fetcher={fetcher} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load the redirect URI"
    );
    expect(screen.queryByText(/app\.dust\.tt/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(REDIRECT_URI)).toBeInTheDocument();
  });

  it.each([
    { authMethod: "oauth-static", isOpen: false },
    { authMethod: "oauth-dynamic", isOpen: true },
    { authMethod: "bearer", isOpen: true },
  ] as const)("does not request instructions for $authMethod with isOpen=$isOpen", ({
    authMethod,
    isOpen,
  }) => {
    const fetcher = vi.fn();
    render(
      <TestForm fetcher={fetcher} authMethod={authMethod} isOpen={isOpen} />
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByText(/redirect URI/)).not.toBeInTheDocument();
  });
});
