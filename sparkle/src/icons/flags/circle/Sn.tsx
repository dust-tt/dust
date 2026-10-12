import type { SVGProps } from "react";
import * as React from "react";

const SvgSn = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#FFDA44"
      d="M14.348.992A9.96 9.96 0 0 0 10.001 0a9.96 9.96 0 0 0-4.348.992L4.783 10l.87 9.008A9.96 9.96 0 0 0 10 20a9.96 9.96 0 0 0 4.347-.992l.87-9.008z"
    />
    <path
      fill="#496E2D"
      d="m9.999 6.522.863 2.657h2.794l-2.26 1.642.863 2.657L10 11.836l-2.26 1.642.863-2.657-2.26-1.642h2.794zM5.652.993A10 10 0 0 0 0 10a10 10 0 0 0 5.652 9.007z"
    />
    <path
      fill="#D80027"
      d="M14.348.993v18.014A10 10 0 0 0 20 10 10 10 0 0 0 14.348.993"
    />
  </svg>
);
export default SvgSn;
