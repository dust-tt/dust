import type { SVGProps } from "react";
import * as React from "react";

const SvgCodeSlash = (props: SVGProps<SVGSVGElement>) => (
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
      d="m24 12-5 4.907-1.5-1.492L21 12l-3.5-3.539L19 6.97zM3 12l3.5 3.415L5 16.907 0 12l5-5.031L6.5 8.46zm8 7.896H8.5L13 3.98h2.5z"
    />
  </svg>
);
export default SvgCodeSlash;
