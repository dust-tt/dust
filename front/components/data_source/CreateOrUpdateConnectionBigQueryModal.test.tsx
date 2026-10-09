import { CreateOrUpdateConnectionBigQueryModal } from "@app/components/data_source/CreateOrUpdateConnectionBigQueryModal";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock(import("@app/components/sparkle/ThemeContext"), () => ({
  useTheme: () => ({ isDark: false, theme: "light", setTheme: vi.fn() }),
}));

vi.mock(import("@app/lib/swr/bigquery"), () => ({
  useBigQueryLocations: () => ({
    locations: undefined,
    isLocationsLoading: false,
    isLocationsError: false,
    error: undefined,
    mutateLocations: vi.fn(),
  }),
}));

const owner = LightWorkspaceFactory.build();

const incompleteCredentials = JSON.stringify({
  type: "service_account",
  client_email: "dust@project.iam.gserviceaccount.com",
  client_id: "123",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509",
  universe_domain: "googleapis.com",
  private_key: 42,
});

function renderModal() {
  render(
    <CreateOrUpdateConnectionBigQueryModal
      owner={owner}
      connectorProviderConfiguration={CONNECTOR_CONFIGURATIONS.bigquery}
      isOpen
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />
  );
}

function pasteCredentials(credentials: string) {
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: credentials },
  });
}

describe("CreateOrUpdateConnectionBigQueryModal", () => {
  it("lists the missing and invalid fields of the pasted credentials", () => {
    renderModal();
    pasteCredentials(incompleteCredentials);

    expect(
      screen.getByText(
        "Missing or invalid fields: project_id, private_key_id, and private_key."
      )
    ).toBeTruthy();
    expect(screen.queryByText(/Validation error/)).toBeNull();
  });

  it("explains that the pasted JSON must be an object", () => {
    renderModal();
    pasteCredentials("null");

    expect(
      screen.getByText("The service account JSON must be an object.")
    ).toBeTruthy();
  });

  it("lists the fields in French", async () => {
    const messages = await loadCatalog("fr-FR");
    act(() => i18n.loadAndActivate({ locale: "fr-FR", messages }));
    renderModal();
    pasteCredentials(incompleteCredentials);

    expect(
      screen.getByText(
        /^Champs manquants ou non valides\s: project_id, private_key_id et private_key\.$/
      )
    ).toBeTruthy();
  });
});
