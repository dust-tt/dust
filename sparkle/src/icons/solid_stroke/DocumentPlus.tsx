import * as React from "react";
import type { SVGProps } from "react";
const SvgDocumentPlus = (props: SVGProps<SVGSVGElement>) => (
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
      fillRule="evenodd"
      d="M5.625 3a.375.375 0 0 0-.375.375v17.25c0 .207.168.375.375.375h12.75a.375.375 0 0 0 .375-.375v-9A2.625 2.625 0 0 0 16.125 9h-1.5a1.875 1.875 0 0 1-1.875-1.875v-1.5A2.625 2.625 0 0 0 10.125 3h-4.5Zm0-1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V11.25c0-5.385-4.365-9.75-9.75-9.75H5.625Zm8.132 2.168c.315.582.493 1.249.493 1.957v1.5c0 .207.168.375.375.375h1.5c.708 0 1.375.178 1.957.493a8.28 8.28 0 0 0-4.325-4.325ZM12 10.5a.75.75 0 0 1 .75.75v2.25H15a.75.75 0 0 1 0 1.5h-2.25v2.25a.75.75 0 0 1-1.5 0V15H9a.75.75 0 0 1 0-1.5h2.25v-2.25a.75.75 0 0 1 .75-.75Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgDocumentPlus;
