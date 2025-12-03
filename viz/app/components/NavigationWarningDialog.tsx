import * as React from "react";
import { ExternalLinkIcon, AlertTriangleIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@viz/components/ui/dialog";
import { Button } from "@viz/components/ui/button";

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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 items-center justify-center rounded-full bg-amber-100'>
              <AlertTriangleIcon className='h-5 w-5 text-amber-600' />
            </div>
            <DialogTitle className='text-left'>
              External Link Warning
            </DialogTitle>
          </div>
          <DialogDescription className='text-left'>
            You are about to navigate to an external website. Please verify the
            URL before proceeding.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='rounded-md border bg-gray-50 p-3'>
            <div className='flex items-center gap-2 text-sm text-gray-600 mb-1'>
              <ExternalLinkIcon className='h-4 w-4' />
              Destination URL:
            </div>
            <div className='font-mono text-sm break-all bg-white p-2 rounded border'>
              {url}
            </div>
          </div>

          {urlObj && (
            <div className='text-sm text-gray-600'>
              <div className='flex items-center gap-2'>
                <span>Domain:</span>
                <span className='font-medium text-gray-900'>
                  {urlObj.hostname}
                </span>
              </div>
              {urlObj.protocol !== "https:" && (
                <div className='flex items-center gap-1 mt-1 text-amber-600'>
                  <AlertTriangleIcon className='h-3 w-3' />
                  <span className='text-xs'>This connection is not secure</span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className='flex-row justify-end gap-2'>
          <Button variant='outline' onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm} className='gap-2'>
            <ExternalLinkIcon className='h-4 w-4' />
            Continue
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
