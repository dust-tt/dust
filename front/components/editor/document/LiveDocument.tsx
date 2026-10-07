import { DocumentView } from "@app/components/editor/document/Document";
import { buildLiveDocumentExtensions } from "@app/components/editor/document/liveExtensions";
import type {
  DocumentLiveSession,
  DocumentProps,
} from "@app/components/editor/document/types";
import { useLiveSession } from "@app/components/editor/document/useLiveSession";
import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

/** A Document in a live session: the file read-only until the shared document has synced. */
export default function LiveDocument(
  props: DocumentProps & { live: DocumentLiveSession }
) {
  const { t } = useLingui();
  const { connection, status } = useLiveSession(props.live);
  const { name, color } = props.live.user;
  const extensions = useMemo(
    () =>
      connection
        ? buildLiveDocumentExtensions({
            t,
            document: connection.document,
            awareness: connection.provider.awareness,
            user: { name, color },
          })
        : null,
    [t, connection, name, color]
  );

  return connection && extensions ? (
    // A new connection is a new shared document: the editor binds to it from scratch.
    <DocumentView
      key={connection.id}
      {...props}
      liveView={{
        status,
        binding: { extensions, connected: status === "live" },
      }}
    />
  ) : (
    <DocumentView {...props} liveView={{ status, binding: null }} />
  );
}
