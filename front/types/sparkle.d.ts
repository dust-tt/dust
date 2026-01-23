// Type augmentation for Sparkle components
// TODO: Remove this once these props are properly supported in @dust-tt/sparkle
import "@dust-tt/sparkle";

declare module "@dust-tt/sparkle" {
  interface LinkWrapperProps {
    className?: string;
    target?: string;
    rel?: string;
  }
}
