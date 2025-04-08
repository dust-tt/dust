import type { SVGProps } from "react";
import * as React from "react";
const SvgMailClose = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#111418"
      d="M22 14h-2V7.238l-7.928 7.1L4 7.216V19h11v2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v10ZM4.511 5l7.55 6.662L19.502 5H4.511Zm16.903 14 2.121 2.121-1.414 1.415L20 20.413l-2.121 2.121-1.415-1.414L18.587 19l-2.121-2.121 1.414-1.415L20 17.587l2.121-2.121 1.415 1.414L21.413 19Z"
    />
  </svg>
);
export default SvgMailClose;
