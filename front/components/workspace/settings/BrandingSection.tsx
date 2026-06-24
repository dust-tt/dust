import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import config from "@app/lib/api/config";
import type { UserUploadableBrandingAssetName } from "@app/lib/api/workspace_branding";
import {
  usePromoteWorkspaceBrandingAsset,
  useWorkspaceBranding,
} from "@app/lib/swr/workspace_branding";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  EmptyCTA,
  Spinner,
  Upload01,
  XClose,
} from "@dust-tt/sparkle";
import { useCallback, useRef, useState } from "react";

interface BrandingAssetUploaderProps {
  asset: UserUploadableBrandingAssetName;
  // Opaque version token, used as a URL cache-buster so the browser
  // re-fetches after a new asset is promoted.
  currentVersion: string | null;
  description: string;
  onSaved: () => Promise<void>;
  owner: LightWorkspaceType;
  title: string;
}

function BrandingAssetUploader({
  asset,
  currentVersion,
  description,
  onSaved,
  owner,
  title,
}: BrandingAssetUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);

  const fileUploaderService = useFileUploaderService({
    hasSandboxTools: false,
    owner,
    useCase: "workspace_branding",
    useCaseMetadata: { asset },
  });

  const { promoteAsset } = usePromoteWorkspaceBrandingAsset({ owner });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    setIsBusy(true);

    const uploaded = await fileUploaderService.handleFilesUpload([file]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    const fileId = uploaded?.[0]?.fileId ?? null;
    if (!fileId) {
      setIsBusy(false);
      return;
    }

    const ok = await promoteAsset(asset, fileId);
    if (ok) {
      await onSaved();
    }

    setIsBusy(false);
  };

  const handleRemove = async () => {
    setIsBusy(true);
    const ok = await promoteAsset(asset, null);
    if (ok) {
      await onSaved();
    }

    setIsBusy(false);
  };

  const busy = isBusy || fileUploaderService.isProcessingFiles;

  // Security: branding assets are <img src> / <link> references only,
  // never fetched and inlined into DOM.
  const assetUrl =
    currentVersion !== null
      ? `${config.getApiBaseUrl()}/api/v1/public/branding/${owner.sId}/${asset}?v=${currentVersion}`
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="heading-lg text-foreground dark:text-foreground-night">
          {title}
        </p>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {description}
        </p>
      </div>

      <input
        ref={fileInputRef}
        accept=".jpg,.jpeg,.png,.svg,.webp,.ico"
        className="hidden"
        onChange={handleFileChange}
        type="file"
      />

      {assetUrl ? (
        <div className="flex h-14 items-center justify-between">
          <Avatar
            visual={
              busy ? (
                <Spinner size="sm" />
              ) : (
                <img
                  alt={title}
                  className="h-full w-full object-contain"
                  src={assetUrl}
                />
              )
            }
            size="lg"
            className={asset === "logo" ? "w-24" : undefined}
          />
          <Button
            disabled={busy}
            icon={XClose}
            label="Remove"
            size="sm"
            variant="outline"
            onClick={() => void handleRemove()}
          />
        </div>
      ) : (
        <EmptyCTA
          message={
            asset === "favicon"
              ? "SVG, PNG, WebP or ICO — Square format"
              : "SVG, PNG or WebP — Transparent background"
          }
          action={
            busy ? (
              <Spinner size="md" />
            ) : (
              <Button
                icon={Upload01}
                label="Upload"
                onClick={() => fileInputRef.current?.click()}
              />
            )
          }
        />
      )}
    </div>
  );
}

interface BrandingSectionProps {
  owner: LightWorkspaceType;
}

export function BrandingSection({ owner }: BrandingSectionProps) {
  const { branding, mutateBranding } = useWorkspaceBranding({ owner });

  const handleSaved = useCallback(async () => {
    await mutateBranding();
  }, [mutateBranding]);

  return (
    <div className="flex flex-col gap-8">
      <BrandingAssetUploader
        asset="logo"
        currentVersion={branding?.assets.logo?.version ?? null}
        description="Shown in the header of every shared Frame in place of the Dust logo. Horizontal format works best."
        onSaved={handleSaved}
        owner={owner}
        title="Logo"
      />
      <BrandingAssetUploader
        asset="favicon"
        currentVersion={branding?.assets.favicon?.version ?? null}
        description="A compact version of your logo. Used as the favicon when someone opens a whitelabel Frame. Must be square (1:1 ratio)."
        onSaved={handleSaved}
        owner={owner}
        title="Icon"
      />
    </div>
  );
}
