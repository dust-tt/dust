import { AuthenticatedVisualizationActionIframe } from "@app/components/assistant/conversation/actions/AuthenticatedVisualizationActionIframe";
import { DocumentFrameFallback } from "@app/components/editor/document/DocumentFrame";
import { usePodFrameRenderableContent } from "@app/hooks/usePodFrameRenderableContent";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { getFrameFunctionReferenceKind } from "@app/types/api/frame_function_reference";
import { isFrameContentType, stripMimeParameters } from "@app/types/files";
import { parseCanonicalScopedPath } from "@app/types/mount_path";
import type { LightWorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";
import { useContext } from "react";

interface DocumentFrameEmbedProps {
  owner: LightWorkspaceType;
  path: string;
}

/**
 * @cc [owner:tdraier,label:product;security] document-frame-embed-access
 * A Frame embedded in a document MUST load only through the file API from its path, so it shows
 * only to a reader who can read the Frame's file; a path the API refuses or that is not a Frame
 * MUST show as the path. It MUST render as a regular, non-editable Frame, inline, its height
 * capped as in a message.
 */
export function DocumentFrameEmbed({ owner, path }: DocumentFrameEmbedProps) {
  const vizUrl = useContext(AuthContext)?.vizUrl;
  const { fileId, fileContent, fileContentType, isLoading } =
    usePodFrameRenderableContent({ owner, framePath: path });

  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  const contentType = fileContentType
    ? stripMimeParameters(fileContentType)
    : null;
  if (
    !vizUrl ||
    !fileId ||
    !fileContent ||
    !contentType ||
    !isFrameContentType(contentType)
  ) {
    return <DocumentFrameFallback path={path} />;
  }

  const scope = parseCanonicalScopedPath(path)?.scope;
  return (
    <AuthenticatedVisualizationActionIframe
      agentConfigurationId={null}
      workspaceId={owner.sId}
      vizUrl={vizUrl}
      visualization={{
        code: fileContent,
        complete: true,
        identifier: `viz-document-frame-${fileId}`,
      }}
      conversationId={
        scope?.kind === "canonical-conversation" ? scope.id : null
      }
      spaceId={scope?.kind === "canonical-pod" ? scope.id : undefined}
      framePackageRoot={path.slice(0, path.lastIndexOf("/"))}
      frameId={
        getFrameFunctionReferenceKind(contentType) === "v2" ? fileId : undefined
      }
    />
  );
}
