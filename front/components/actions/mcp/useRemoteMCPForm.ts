import { useEffect, useReducer, useState } from "react";

import type { MCPFormAction, MCPFormState } from "@app/lib/actions/mcp";
import type { RemoteMCPServerType } from "@app/lib/actions/mcp_metadata";
import { validateUrl } from "@app/types";

function getInitialFormState(): MCPFormState {
  return {
    url: "",
    name: "",
    description: "",
    tools: [],
    errors: {},
  };
}

type ValidationResult = {
  isValid: boolean;
  errors: MCPFormState["errors"];
};

export function validateFormState(state: MCPFormState): ValidationResult {
  const urlValidation = validateUrl(state.url);
  const errors: MCPFormState["errors"] = {
    url: !urlValidation.valid
      ? "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c))."
      : undefined,
    name: !state.name ? "Name is required" : undefined,
  };
  return { isValid: urlValidation.valid && !!state.name, errors };
}

export const useRemoteMCPForm = (mcpServer?: RemoteMCPServerType) => {
  const [sharedSecret, setSharedSecret] = useState<string | undefined>(
    undefined
  );

  const formReducer = (
    state: MCPFormState,
    action: MCPFormAction
  ): MCPFormState => {
    switch (action.type) {
      case "SET_FIELD": {
        return { ...state, [action.field]: action.value };
      }
      case "SET_ERROR":
        return {
          ...state,
          errors: { ...state.errors, [action.field]: action.value },
        };
      case "VALIDATE": {
        const result = validateFormState(state);
        return { ...state, errors: result.errors };
      }
      default:
        return state;
    }
  };

  const [formState, dispatch] = useReducer(formReducer, getInitialFormState());

  // Helper function to populate form from server data
  const populateFormFromServer = (serverData: RemoteMCPServerType) => {
    dispatch({ type: "SET_FIELD", field: "name", value: serverData.name });
    dispatch({
      type: "SET_FIELD",
      field: "description",
      value: serverData.description || "",
    });
    dispatch({ type: "SET_FIELD", field: "tools", value: serverData.tools });

    if (serverData.url) {
      dispatch({ type: "SET_FIELD", field: "url", value: serverData.url });
    }

    if (serverData.sharedSecret) {
      setSharedSecret(serverData.sharedSecret);
    }
  };

  // Initialize form from the mcpServer prop when available
  useEffect(() => {
    if (mcpServer) {
      populateFormFromServer(mcpServer);
    }
  }, [mcpServer]);

  return {
    formState,
    dispatch,
    populateFormFromServer,
    sharedSecret,
  };
};
