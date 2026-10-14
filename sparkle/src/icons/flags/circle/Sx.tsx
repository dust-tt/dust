import type { SVGProps } from "react";
import * as React from "react";

const SvgSx = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#D80027"
      d="M9.131 10.87S2.936 2.928 2.93 2.929A9.97 9.97 0 0 1 10 0c5.524 0 10 4.477 10 10z"
    />
    <path
      fill="#0052B4"
      d="M9.131 10s-6.195 7.073-6.201 7.071A9.97 9.97 0 0 0 10 20c5.524 0 10-4.477 10-10z"
    />
    <path
      fill="#F0F0F0"
      d="M2.929 2.929c-3.905 3.905-3.905 10.237 0 14.142L10 10z"
    />
    <path
      fill="#FFDA44"
      d="M1.097 10q-.009.108-.01.217A2.826 2.826 0 1 0 6.732 10zM3.913 8.696a.87.87 0 1 0 0-1.74.87.87 0 0 0 0 1.74"
    />
    <path
      fill="#D80027"
      d="M1.957 7.609v2.826c0 1.497 1.957 1.956 1.957 1.956s1.956-.459 1.956-1.956V7.609z"
    />
    <path
      fill="#338AF3"
      d="M3.914 11.481c-.363-.13-1.088-.464-1.088-1.046V8.478H5v1.957c0 .584-.725.917-1.086 1.046"
    />
    <path
      fill="#F3F3F3"
      d="M4.349 9.565V9.13l-.435-.217-.435.217v.435l-.217.218v.87h1.304v-.87z"
    />
  </svg>
);
export default SvgSx;
