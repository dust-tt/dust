import type { SVGProps } from "react";
import * as React from "react";

const SvgBm = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20 10c0 5.523-4.477 10-10 10S0 15.523 0 10c0 .002 10-9.999 10-10 5.523 0 10 4.477 10 10"
    />
    <path
      fill="#0052B4"
      d="M10 4.783v3.372L6.52 4.783zM5.218 10h2.938L5.218 6.087 4.783 9.13z"
    />
    <path fill="#F0F0F0" d="M9.973 10h.026v-.027z" />
    <path
      fill="#F0F0F0"
      d="M10 5.217V0h-.002C4.476 0 0 4.478 0 10h5.217V7.062L8.155 10h1.818L10 9.973V8.155L7.062 5.217z"
    />
    <path
      fill="#D80027"
      d="M5.06 1.304A10.05 10.05 0 0 0 1.305 5.06v5.376h2.608V3.913h6.522V1.304z"
    />
    <path fill="#D80027" d="m10.397 9.168-3.95-3.95h-1.23l5.18 5.18z" />
    <path
      fill="#F3F3F3"
      d="M11.305 5.217V10c0 2.33 6.087 2.33 6.087 0V5.217z"
    />
    <path
      fill="#6DA544"
      d="M11.305 10c0 2.33 3.043 3.044 3.043 3.044s3.044-.714 3.044-3.044z"
    />
    <path
      fill="#A2001D"
      d="m14.349 8.087-1.414.609V10l1.414.87 1.413-.87V8.696z"
    />
    <path fill="#338AF3" d="M12.936 7.391h2.826v1.305h-2.827z" />
  </svg>
);
export default SvgBm;
