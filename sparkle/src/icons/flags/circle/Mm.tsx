import type { SVGProps } from "react";
import * as React from "react";

const SvgMm = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#6DA544"
      d="M19.378 13.478A10 10 0 0 0 20 10c0-1.223-.22-2.395-.622-3.478L10 5.652l-9.378.87A10 10 0 0 0 0 10c0 1.223.22 2.395.622 3.478l9.378.87z"
    />
    <path fill="#FFDA44" d="M19.377 6.522a10.004 10.004 0 0 0-18.756 0z" />
    <path
      fill="#D80027"
      d="M10 20c4.299 0 7.964-2.714 9.377-6.522H.621A10 10 0 0 0 10 20"
    />
    <path
      fill="#F0F0F0"
      d="M16.857 8.46H11.62L10 3.478 8.381 8.46H3.143l4.238 3.08-1.62 4.982L10 13.478l4.238 3.044-1.619-4.982z"
    />
  </svg>
);
export default SvgMm;
