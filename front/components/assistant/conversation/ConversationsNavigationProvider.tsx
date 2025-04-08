import { Dialog, DialogContainer, DialogContent } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { RefObject } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

interface ConversationsNavigationContextType {
  conversationsNavigationRef: RefObject<HTMLDivElement>;
  scrollConversationsToTop: () => void;
  activeConversationId: string | null;
  setIsImageUrl: (imageUrl: string | null) => void;
}

const ConversationsNavigationContext =
  createContext<ConversationsNavigationContextType | null>(null);

export function ConversationsNavigationProvider({
  initialConversationId,
  children,
}: {
  initialConversationId?: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const conversationsNavigationRef = useRef<HTMLDivElement>(null);
  const [isImageUrl, setIsImageUrl] = useState<string | null>(null);

  const scrollConversationsToTop = useCallback(() => {
    if (conversationsNavigationRef.current) {
      // Find the ScrollArea viewport
      const viewport = conversationsNavigationRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (viewport) {
        viewport.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      }
    }
  }, []);

  const activeConversationId = useMemo(() => {
    const conversationId = router.query.cId ?? "";

    if (conversationId && typeof conversationId === "string") {
      return conversationId === "new" ? null : conversationId;
    }

    return initialConversationId ?? null;
  }, [initialConversationId, router.query.cId]);

  return (
    <ConversationsNavigationContext.Provider
      value={{
        conversationsNavigationRef,
        scrollConversationsToTop,
        activeConversationId,
        setIsImageUrl,
      }}
    >
      <ImageModal imageUrl={isImageUrl} onClose={() => setIsImageUrl(null)} />
      {children}
    </ConversationsNavigationContext.Provider>
  );
}

interface ImageModalProps {
  imageUrl: string | null;
  onClose: () => void;
}

export function ImageModal({ imageUrl, onClose }: ImageModalProps) {
  return (
    <Dialog
      open={!!imageUrl}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="xl">
        <DialogContainer>
          <div className="flex items-center justify-center">
            {imageUrl && (
              <img
                src={imageUrl}
                alt="Full size view"
                className="max-h-[80vh] w-auto object-contain"
              />
            )}
          </div>
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}

export function useConversationsNavigation() {
  const context = useContext(ConversationsNavigationContext);
  if (!context) {
    throw new Error(
      "useConversationsNavigation must be used within a ConversationsNavigationProvider"
    );
  }
  return context;
}
