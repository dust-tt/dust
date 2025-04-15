import type { SVGProps } from "react";
import * as React from "react";
const SvgExternalLink = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20 11h2V3h-8v2h4.564c-.677 1.471-1.754 2.815-3.056 3.86C13.834 10.206 11.86 11 10 11v2c2.412 0 4.814-1.017 6.76-2.58A13.024 13.024 0 0 0 20 6.59V11Z"
    />
    <path fill="currentColor" d="M7 7h4V5H5v14h14v-5h-2v3H7V7Z" />
  </svg>
);
export default SvgExternalLink;
