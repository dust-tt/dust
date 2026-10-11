import { Trans } from "@lingui/react/macro";
import { Button } from "@viz/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@viz/components/ui/dialog";
import { AlertTriangleIcon, ExternalLinkIcon } from "lucide-react";
import * as React from "react";

interface NavigationWarningDialogProps {
  isOpen: boolean;
  url: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function NavigationWarningDialog({
  isOpen,
  url,
  onCancel,
  onConfirm,
}: NavigationWarningDialogProps) {
  const [urlObj, setUrlObj] = React.useState<URL | null>(null);

  React.useEffect(() => {
    try {
      setUrlObj(new URL(url));
    } catch {
      setUrlObj(null);
    }
  }, [url]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangleIcon className="h-5 w-5 text-amber-600" />
            </div>
            <DialogTitle className="text-left">
              <Trans>External link warning</Trans>
            </DialogTitle>
          </div>
          <DialogDescription className="text-left">
            <Trans>
              You are about to navigate to an external website. Please verify
              the URL before proceeding.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
              <ExternalLinkIcon className="h-4 w-4" />
              <Trans>Destination URL:</Trans>
            </div>
            <div className="font-mono text-sm break-all bg-white p-2 rounded border">
              {url}
            </div>
          </div>

          {urlObj && (
            <div className="text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <span>
                  <Trans>Domain:</Trans>
                </span>
                <span className="font-medium text-gray-900">
                  {urlObj.hostname}
                </span>
              </div>
              {urlObj.protocol !== "https:" && (
                <div className="flex items-center gap-1 mt-1 text-amber-600">
                  <AlertTriangleIcon className="h-3 w-3" />
                  <span className="text-xs">
                    <Trans>This connection is not secure</Trans>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            <Trans>Cancel</Trans>
          </Button>
          <Button onClick={onConfirm} className="gap-2">
            <ExternalLinkIcon className="h-4 w-4" />
            <Trans>Continue</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface NavigationWarningState {
  isOpen: boolean;
  url: string;
  resolve: ((confirmed: boolean) => void) | null;
}

export function useNavigationWarning() {
  const [state, setState] = React.useState<NavigationWarningState>({
    isOpen: false,
    url: "",
    resolve: null,
  });

  const showWarning = React.useCallback((url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        url,
        resolve,
      });
    });
  }, []);

  const handleConfirm = React.useCallback(() => {
    state.resolve?.(true);
    setState({ isOpen: false, url: "", resolve: null });
  }, [state]);

  const handleCancel = React.useCallback(() => {
    state.resolve?.(false);
    setState({ isOpen: false, url: "", resolve: null });
  }, [state]);

  const DialogComponent = React.useCallback(
    () => (
      <NavigationWarningDialog
        isOpen={state.isOpen}
        url={state.url}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    ),
    [state.isOpen, state.url, handleConfirm, handleCancel]
  );

  return {
    showWarning,
    DialogComponent,
  };
}
