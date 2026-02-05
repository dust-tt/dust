import { Spinner } from "@dust-tt/sparkle";
import React, { useMemo } from "react";

import { useMCPAppSession } from "@app/lib/swr/mcp_apps";
import type { LightWorkspaceType } from "@app/types";

interface MCPAppIframeProps {
  owner: LightWorkspaceType;
  conversationId: string;
  sessionId: string;
}

/**
 * MCPAppIframe renders an MCP App session in a sandboxed iframe.
 * The HTML content is fetched from the backend API and includes injected tool result data.
 */
export function MCPAppIframe({
  owner,
  conversationId,
  sessionId,
}: MCPAppIframeProps) {
  const { session, isMCPAppSessionLoading, mcpAppSessionError } =
    useMCPAppSession({
      owner,
      conversationId,
      sessionId,
    });

  // Build CSP meta tag from session CSP configuration
  const cspMetaTag = useMemo(() => {
    if (!session?.csp) {
      // Default restrictive CSP
      return "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';\">";
    }

    const cspParts = Object.entries(session.csp)
      .map(([directive, value]) => `${directive} ${value}`)
      .join("; ");

    return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; ${cspParts}">`;
  }, [session?.csp]);

  // Inject CSP meta tag into the HTML if not already present
  const htmlWithCSP = useMemo(() => {
    if (!session?.html) {
      return null;
    }

    // Check if HTML already has a CSP meta tag
    if (session.html.includes("Content-Security-Policy")) {
      return session.html;
    }

    // Inject CSP meta tag after <head>
    return session.html.replace("<head>", `<head>\n  ${cspMetaTag}`);
  }, [session?.html, cspMetaTag]);

  if (isMCPAppSessionLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-separator bg-muted-background p-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (mcpAppSessionError || !htmlWithCSP) {
    return (
      <div className="rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
        Failed to load MCP App content
      </div>
    );
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-separator">
      <iframe
        srcDoc={htmlWithCSP}
        sandbox="allow-scripts"
        className="h-96 w-full"
        title="MCP App Content"
      />
    </div>
  );
}
