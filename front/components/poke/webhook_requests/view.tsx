import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableHead,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { PokeWebhookRequestType } from "@app/pages/api/poke/workspaces/[wId]/webhook_sources/[webhookSourceId]/requests";

export function ViewWebhookRequestTable({
  webhookRequest,
}: {
  webhookRequest: PokeWebhookRequestType;
}) {
  return (
    <div className="border-material-200 overflow-x-auto rounded-lg border">
      <PokeTable>
        <PokeTableBody>
          <PokeTableRow>
            <PokeTableHead>ID</PokeTableHead>
            <PokeTableCell>{webhookRequest.id}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Status</PokeTableHead>
            <PokeTableCell>
              <span
                className={`rounded px-2 py-1 text-xs font-medium ${
                  webhookRequest.status === "processed"
                    ? "bg-success-100 text-success-800"
                    : webhookRequest.status === "failed"
                      ? "bg-red-100 text-red-800"
                      : "bg-warning-100 text-warning-800"
                }`}
              >
                {webhookRequest.status}
              </span>
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Webhook Source ID</PokeTableHead>
            <PokeTableCell>{webhookRequest.webhookSourceId}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Processed At</PokeTableHead>
            <PokeTableCell>
              {webhookRequest.processedAt
                ? new Date(webhookRequest.processedAt).toLocaleString()
                : "Not processed"}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Error Message</PokeTableHead>
            <PokeTableCell>
              {webhookRequest.errorMessage ? (
                <pre className="max-w-2xl overflow-x-auto text-xs text-red-800">
                  {webhookRequest.errorMessage}
                </pre>
              ) : (
                "None"
              )}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Created At</PokeTableHead>
            <PokeTableCell>
              {new Date(webhookRequest.createdAt).toLocaleString()}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Updated At</PokeTableHead>
            <PokeTableCell>
              {new Date(webhookRequest.updatedAt).toLocaleString()}
            </PokeTableCell>
          </PokeTableRow>
        </PokeTableBody>
      </PokeTable>
    </div>
  );
}
