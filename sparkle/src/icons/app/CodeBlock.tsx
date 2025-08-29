import type { SVGProps } from "react";
import * as React from "react";
const SvgCodeBlock = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 25"
    {...props}
  >
    <path
      fill="currentColor"
      d="m3.414 8.031 2.293-2.305-1.414-1.421L.586 8.03l3.707 3.727 1.414-1.422-2.293-2.305Zm6.172 0L7.293 5.726l1.414-1.421 3.707 3.726-3.707 3.727-1.414-1.422 2.293-2.305ZM14 5.016h7c.003 6.03.003 9.062 0 15.093H3v-7.047h3V17.1h12V8.026h-4v-3.01Z"
    />
  </svg>
);
export default SvgCodeBlock;
