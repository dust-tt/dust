import type { SVGProps } from "react";
import * as React from "react";
const SvgTelescope = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      d="M18.788 2.273a2 2 0 0 1 2.367 1.264l.057.19 1.515 6.06.038.194a2.001 2.001 0 0 1-1.492 2.232l-1.09.273v-.001a3 3 0 0 1-2.271-.338 2.992 2.992 0 0 1-.333-.236l-2.627.561a2.988 2.988 0 0 1-.794 2.607l2.736 5.474a1 1 0 0 1-1.788.895l-2.736-5.472A3.035 3.035 0 0 1 12 16c-.126 0-.25-.01-.371-.024l-2.735 5.472a1 1 0 0 1-1.789-.895l2.737-5.473a2.99 2.99 0 0 1-.751-1.357l-4.997 1.066h-.001a1.934 1.934 0 0 1-2.29-1.454L1.27 11.2l-.002-.005a2.071 2.071 0 0 1 1.337-2.448l.014-.004 12.97-4.265a2.99 2.99 0 0 1 2.108-1.934h.001l1.09-.272Z"
    />
  </svg>
);
export default SvgTelescope;
