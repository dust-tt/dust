import { useCallback, useEffect, useRef, useState } from "react";

const GOOGLE_API_SCRIPT_URL = "https://apis.google.com/js/api.js";

// Type declarations for Google Picker API
interface PickerBuilder {
  addView(view: DocsView): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setCallback(callback: (data: PickerCallbackData) => void): PickerBuilder;
  build(): Picker;
}

interface DocsView {
  setMimeTypes(mimeTypes: string): DocsView;
  setQuery(query: string): DocsView;
  setFileIds(ids: string): DocsView;
}

interface Picker {
  setVisible(visible: boolean): void;
}

interface PickerDocument {
  id: string;
  name: string;
  mimeType: string;
  url?: string;
}

interface PickerCallbackData {
  action: string;
  docs?: PickerDocument[];
}

// Augment the global Window interface for Google APIs
declare global {
  interface Window {
    gapi?: {
      load: (api: string, callback: () => void) => void;
    };
    google?: {
      picker: {
        PickerBuilder: new () => PickerBuilder;
        DocsView: new (viewId?: string) => DocsView;
        Feature: { MULTISELECT_ENABLED: string };
        Action: { PICKED: string; CANCEL: string };
        ViewId: { DOCS: string };
      };
    };
  }
}

export interface GooglePickerFile {
  id: string;
  name: string;
  mimeType: string;
  url?: string;
}

export interface UseGooglePickerProps {
  clientId: string;
  developerKey: string;
  accessToken: string | null;
  appId: string; // The Cloud project number (from clientId before .apps.googleusercontent.com)
  fileId: string;
  mimeTypes?: string[];
  onFilesSelected: (files: GooglePickerFile[]) => void;
  onCancel?: () => void;
}

export interface UseGooglePickerResult {
  openPicker: () => void;
  isPickerLoaded: boolean;
  isPickerOpen: boolean;
  error: Error | null;
}

export function useGooglePicker({
  developerKey,
  accessToken,
  appId,
  fileId,
  mimeTypes,
  onFilesSelected,
  onCancel,
}: UseGooglePickerProps): UseGooglePickerResult {
  const [isPickerLoaded, setIsPickerLoaded] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const pickerRef = useRef<Picker | null>(null);
  const isLoadingRef = useRef(false);

  // Load the Google API script and picker
  useEffect(() => {
    const loadScript = () => {
      // Check if script is already loaded
      if (window.gapi) {
        loadPicker();
        return;
      }

      // Check if script is already being loaded
      const existingScript = document.querySelector(
        `script[src="${GOOGLE_API_SCRIPT_URL}"]`
      );
      if (existingScript) {
        existingScript.addEventListener("load", loadPicker);
        return;
      }

      // Load the script
      const script = document.createElement("script");
      script.src = GOOGLE_API_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = loadPicker;
      script.onerror = () => {
        setError(new Error("Failed to load Google API script"));
        isLoadingRef.current = false;
      };
      document.body.appendChild(script);
    };

    const loadPicker = () => {
      if (isLoadingRef.current || isPickerLoaded) {
        return;
      }

      if (!window.gapi) {
        setError(new Error("Google API not available"));
        return;
      }

      isLoadingRef.current = true;

      window.gapi.load("picker", () => {
        setIsPickerLoaded(true);
        isLoadingRef.current = false;
      });
    };

    loadScript();
  }, [isPickerLoaded]);

  const handlePickerCallback = useCallback(
    (data: PickerCallbackData) => {
      if (!window.google) {
        return;
      }

      if (data.action === window.google.picker.Action.PICKED && data.docs) {
        const files: GooglePickerFile[] = data.docs.map((doc) => ({
          id: doc.id,
          name: doc.name,
          mimeType: doc.mimeType,
          url: doc.url,
        }));
        onFilesSelected(files);
        setIsPickerOpen(false);
      } else if (data.action === window.google.picker.Action.CANCEL) {
        onCancel?.();
        setIsPickerOpen(false);
      }
    },
    [onFilesSelected, onCancel]
  );

  const openPicker = useCallback(() => {
    if (!isPickerLoaded || !window.google || !accessToken) {
      return;
    }

    try {
      // Create a view for Google Drive files
      const view = new window.google.picker.DocsView(
        window.google.picker.ViewId.DOCS
      );

      // Set mime type filter if provided
      if (mimeTypes && mimeTypes.length > 0) {
        view.setMimeTypes(mimeTypes.join(","));
      }

      // Pre-select the file that needs authorization
      view.setFileIds(fileId);

      // Build the picker
      // setAppId is required for drive.file scope to grant access to selected files
      const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(accessToken)
        .setDeveloperKey(developerKey)
        .setAppId(appId)
        .setCallback(handlePickerCallback)
        .build();

      pickerRef.current = picker;
      picker.setVisible(true);
      setIsPickerOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to open picker"));
    }
  }, [
    isPickerLoaded,
    accessToken,
    appId,
    developerKey,
    fileId,
    mimeTypes,
    handlePickerCallback,
  ]);

  return {
    openPicker,
    isPickerLoaded,
    isPickerOpen,
    error,
  };
}
