import { sanitizeOAuthRegistrationRequestBody } from "@app/lib/api/mcp_server/oauth_registration";
import { describe, expect, it } from "vitest";

describe("sanitizeOAuthRegistrationRequestBody", () => {
  it("removes device_code from grant_types", () => {
    const body = JSON.stringify({
      client_name: "Raycast MCP: Dust (dev)",
      grant_types: [
        "authorization_code",
        "refresh_token",
        "urn:ietf:params:oauth:grant-type:device_code",
      ],
      redirect_uris: ["raycast://oauth?package_name=mcp_server_dust_(dev)"],
    });

    expect(JSON.parse(sanitizeOAuthRegistrationRequestBody(body))).toEqual({
      client_name: "Raycast MCP: Dust (dev)",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["raycast://oauth?package_name=mcp_server_dust_(dev)"],
    });
  });

  it("leaves supported grant_types unchanged", () => {
    const body = JSON.stringify({
      grant_types: ["authorization_code", "refresh_token"],
    });

    expect(sanitizeOAuthRegistrationRequestBody(body)).toBe(body);
  });

  it("returns invalid JSON unchanged", () => {
    expect(sanitizeOAuthRegistrationRequestBody("not-json")).toBe("not-json");
  });
});
