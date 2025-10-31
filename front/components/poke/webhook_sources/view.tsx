import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableHead,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { WebhookSourceForAdminType } from "@app/types/triggers/webhooks";

export function ViewWebhookSourceTable({
  webhookSource,
}: {
  webhookSource: WebhookSourceForAdminType;
}) {
  return (
    <div className="border-material-200 overflow-x-auto rounded-lg border">
      <PokeTable>
        <PokeTableBody>
          <PokeTableRow>
            <PokeTableHead>ID</PokeTableHead>
            <PokeTableCell>{webhookSource.id}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>sId</PokeTableHead>
            <PokeTableCell>{webhookSource.sId}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Name</PokeTableHead>
            <PokeTableCell>{webhookSource.name}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Provider</PokeTableHead>
            <PokeTableCell>
              {webhookSource.provider ?? "custom"}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Subscribed Events</PokeTableHead>
            <PokeTableCell>
              {webhookSource.subscribedEvents.length > 0
                ? webhookSource.subscribedEvents.join(", ")
                : "None"}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>URL Secret</PokeTableHead>
            <PokeTableCell>
              <span className="font-mono text-xs">
                {webhookSource.urlSecret}
              </span>
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Secret</PokeTableHead>
            <PokeTableCell>
              <span className="font-mono text-xs">
                {webhookSource.secret ? "***redacted***" : "None"}
              </span>
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Signature Header</PokeTableHead>
            <PokeTableCell>
              {webhookSource.signatureHeader ?? "None"}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Signature Algorithm</PokeTableHead>
            <PokeTableCell>
              {webhookSource.signatureAlgorithm ?? "None"}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>OAuth Connection ID</PokeTableHead>
            <PokeTableCell>
              {webhookSource.oauthConnectionId ?? "None"}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Remote Metadata</PokeTableHead>
            <PokeTableCell>
              {webhookSource.remoteMetadata ? (
                <pre className="max-w-2xl overflow-x-auto text-xs">
                  {JSON.stringify(webhookSource.remoteMetadata, null, 2)}
                </pre>
              ) : (
                "None"
              )}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Created</PokeTableHead>
            <PokeTableCell>
              {new Date(webhookSource.createdAt).toLocaleString()}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Updated</PokeTableHead>
            <PokeTableCell>
              {new Date(webhookSource.updatedAt).toLocaleString()}
            </PokeTableCell>
          </PokeTableRow>
        </PokeTableBody>
      </PokeTable>
    </div>
  );
}
