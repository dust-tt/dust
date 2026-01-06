import { z } from "zod";

import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import type { MCPServerType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase, OAuthCredentials } from "@app/types";
import { validateUrl } from "@app/types";

export const AUTH_METHODS = ["oauth-dynamic", "oauth-static", "bearer"] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];

export const DEFAULT_AUTH_METHOD: AuthMethod = "oauth-dynamic";

export type CreateMCPServerFormValues = {
  remoteServerUrl: string;
  authMethod: AuthMethod;
  sharedSecret: string;
  useCase: MCPOAuthUseCase | null;
  authCredentials: OAuthCredentials | null;
  useCustomHeaders: boolean;
  customHeaders: { key: string; value: string }[];
};

interface GetDefaultsOptions {
  internalMCPServer?: MCPServerType;
  defaultServerConfig?: DefaultRemoteMCPServerConfig;
}

export function getCreateMCPServerFormDefaults(
  options: GetDefaultsOptions = {}
): CreateMCPServerFormValues {
  const { defaultServerConfig } = options;

  return {
    remoteServerUrl: defaultServerConfig?.url ?? "",
    authMethod: defaultServerConfig?.authMethod ?? DEFAULT_AUTH_METHOD,
    sharedSecret: "",
    useCase: null,
    authCredentials: null,
    useCustomHeaders: false,
    customHeaders: [],
  };
}

interface GetSchemaOptions {
  internalMCPServer?: MCPServerType;
  defaultServerConfig?: DefaultRemoteMCPServerConfig;
  authorization: AuthorizationInfo | null;
  requiresBearerToken: boolean;
}

export function getCreateMCPServerFormSchema(options: GetSchemaOptions) {
  const {
    internalMCPServer,
    defaultServerConfig,
    authorization,
    requiresBearerToken,
  } = options;

  return z
    .object({
      remoteServerUrl: z.string(),
      authMethod: z.enum(AUTH_METHODS),
      sharedSecret: z.string(),
      useCase: z
        .enum(["platform_actions", "personal_actions"] as const)
        .nullable(),
      authCredentials: z.record(z.string()).nullable(),
      useCustomHeaders: z.boolean(),
      customHeaders: z.array(
        z.object({
          key: z.string(),
          value: z.string(),
        })
      ),
    })
    .superRefine((data, ctx) => {
      // URL validation for remote servers (not internal)
      if (!internalMCPServer && !defaultServerConfig?.url) {
        const urlValidation = validateUrl(data.remoteServerUrl);
        if (!urlValidation.valid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c).",
            path: ["remoteServerUrl"],
          });
        }
      }

      // Use case required when authorization is set
      if (authorization && !data.useCase) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please select a use case",
          path: ["useCase"],
        });
      }

      // Bearer token required for certain configurations
      if (defaultServerConfig?.authMethod === "bearer" && !data.sharedSecret) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "API key is required",
          path: ["sharedSecret"],
        });
      }

      // Bearer token required for internal servers that need it
      if (
        internalMCPServer &&
        !authorization &&
        requiresBearerToken &&
        !data.sharedSecret
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Bearer token is required",
          path: ["sharedSecret"],
        });
      }
    });
}

export function isFormSubmittable(
  values: CreateMCPServerFormValues,
  options: {
    internalMCPServer?: MCPServerType;
    defaultServerConfig?: DefaultRemoteMCPServerConfig;
    authorization: AuthorizationInfo | null;
    requiresBearerToken: boolean;
    isOAuthFormValid: boolean;
    isLoading: boolean;
  }
): boolean {
  const {
    internalMCPServer,
    defaultServerConfig,
    authorization,
    requiresBearerToken,
    isOAuthFormValid,
    isLoading,
  } = options;

  if (isLoading) {
    return false;
  }

  if (!isOAuthFormValid) {
    return false;
  }

  if (authorization && !values.useCase) {
    return false;
  }

  if (defaultServerConfig?.authMethod === "bearer" && !values.sharedSecret) {
    return false;
  }

  if (
    internalMCPServer &&
    !authorization &&
    requiresBearerToken &&
    !values.sharedSecret
  ) {
    return false;
  }

  if (!internalMCPServer && !defaultServerConfig?.url) {
    const urlValidation = validateUrl(values.remoteServerUrl);
    if (!urlValidation.valid) {
      return false;
    }
  }

  return true;
}
