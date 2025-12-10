import {
  Button,
  ClipboardCheckIcon,
  ClipboardIcon,
  Spinner,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { clientFetch } from "@app/lib/egress/client";

interface CopyTokenButtonProps {
  tokenUrl: string;
  label?: string;
}

export function CopyTokenButton({
  tokenUrl,
  label = "Copy Token",
}: CopyTokenButtonProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = async () => {
    if (
      !window.confirm(
        "⚠️ WARNING: Access tokens are sensitive credentials. Only fetch and copy this token if you understand the security implications. The token will be copied to your clipboard."
      )
    ) {
      return;
    }

    // Need to focus and wait after confirmation modal, for copyToClipboard to work
    window.focus();
    await new Promise((resolve) => setTimeout(resolve, 500));

    setIsLoading(true);
    setError(null);
    const res = await clientFetch(tokenUrl);
    if (!res.ok) {
      const err = await res.json();
      setError(err.error?.message ?? "Failed to fetch access token");
      setIsLoading(false);
      return;
    }
    const data = await res.json();
    if (data.token) {
      await copyToClipboard(
        new ClipboardItem({
          "text/plain": new Blob([data.token], { type: "text/plain" }),
        })
      );
    } else {
      setError("No token available");
    }
    setIsLoading(false);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        icon={
          isLoading ? Spinner : isCopied ? ClipboardCheckIcon : ClipboardIcon
        }
        variant="outline"
        size="xs"
        label={
          isLoading
            ? "Loading..."
            : isCopied
              ? "Copied!"
              : error
                ? "Error"
                : label
        }
        onClick={handleCopy}
        disabled={isLoading}
        tooltip={error ?? undefined}
      />
    </div>
  );
}
