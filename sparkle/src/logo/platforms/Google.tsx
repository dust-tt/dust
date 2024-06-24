import type { SVGProps } from "react";
import * as React from "react";
const SvgGoogle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#4285F4"
      fillRule="evenodd"
      d="M22.038 12.227c0-.709-.065-1.39-.186-2.045h-9.633v3.868h5.505c-.237 1.25-.958 2.31-2.041 3.018v2.51h3.305c1.934-1.741 3.05-4.305 3.05-7.35Z"
      clipRule="evenodd"
    />
    <path
      fill="#34A853"
      fillRule="evenodd"
      d="M12.22 22c2.76 0 5.076-.895 6.768-2.423l-3.305-2.509c-.916.6-2.088.955-3.464.955-2.663 0-4.918-1.76-5.722-4.123H3.08v2.59C4.763 19.76 8.221 22 12.22 22Z"
      clipRule="evenodd"
    />
    <path
      fill="#FBBC05"
      fillRule="evenodd"
      d="M6.497 13.9a5.89 5.89 0 0 1-.32-1.9c0-.659.115-1.3.32-1.9V7.51H3.08a9.815 9.815 0 0 0 0 8.981l3.417-2.59Z"
      clipRule="evenodd"
    />
    <path
      fill="#EA4335"
      fillRule="evenodd"
      d="M12.22 5.977c1.501 0 2.85.505 3.909 1.496l2.933-2.868C17.292 2.99 14.976 2 12.22 2 8.221 2 4.763 4.24 3.08 7.51l3.417 2.59c.804-2.364 3.059-4.123 5.722-4.123Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgGoogle;
