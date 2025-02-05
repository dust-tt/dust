import { Button, Input, Modal } from "@dust-tt/sparkle";
import type { LightWorkspaceType } from "@dust-tt/types";
import { setupOAuthConnection } from "@dust-tt/types";
import { useState } from "react";

export function ConnectSalesforceModal({
  owner,
  onClose,
  onSuccess,
}: {
  owner: LightWorkspaceType;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [instanceUrl, setInstanceUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const connection = await setupOAuthConnection({
        dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
        owner,
        provider: "salesforce",
        useCase: "connection",
        extraConfig: {
          instance_url: instanceUrl,
        },
      });

      if (!connection.isOk()) {
        setError(connection.error.message);
        return;
      }

      onSuccess();
    } catch (e) {
      setError("Failed to connect to Salesforce. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Connect to Salesforce"
      variant="side-sm"
      hasChanged={false}
    >
      <div className="flex flex-col gap-4 p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Salesforce Instance URL
          </label>
          <Input
            name="instanceUrl"
            type="url"
            placeholder="https://your-instance.salesforce.com"
            value={instanceUrl}
            onChange={(e) => setInstanceUrl(e.target.value)}
            className="w-full"
          />
          <p className="mt-1 text-sm text-gray-500">
            Enter your Salesforce instance URL. This is usually in the format
            https://something.salesforce.com
          </p>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            label="Cancel"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleConnect}
            loading={isLoading}
            disabled={!instanceUrl || isLoading}
            label="Connect"
          />
        </div>
      </div>
    </Modal>
  );
}
