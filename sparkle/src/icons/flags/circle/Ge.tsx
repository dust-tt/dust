import type { SVGProps } from "react";
import * as React from "react";

const SvgGe = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#D80027"
      d="M19.915 8.696h-8.61V.085a10 10 0 0 0-2.61 0v8.61H.086a10 10 0 0 0 0 2.61h8.61v8.61a10 10 0 0 0 2.61 0v-8.61h8.61a10 10 0 0 0 0-2.61"
    />
    <path
      fill="#D80027"
      d="M6.087 4.783V3.478H4.783v1.305H3.479v1.304h1.304v1.304h1.304V6.087h1.305V4.783zM15.218 4.783V3.478h-1.304v1.305h-1.305v1.304h1.305v1.304h1.304V6.087h1.304V4.783zM6.087 13.913v-1.304H4.783v1.304H3.479v1.304h1.304v1.305h1.304v-1.305h1.305v-1.304zM15.218 13.913v-1.304h-1.304v1.304h-1.305v1.304h1.305v1.305h1.304v-1.305h1.304v-1.304z"
    />
  </svg>
);
export default SvgGe;
