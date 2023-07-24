import * as React from "react";
import type { SVGProps } from "react";
const SvgKey = (props: SVGProps<SVGSVGElement>) => (
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
      d="M15.75 3a5.25 5.25 0 0 0-5.173 6.151c.127.737-.02 1.602-.639 2.221l-6.499 6.5A1.5 1.5 0 0 0 3 18.931V21h2.25v-1.5a.75.75 0 0 1 .75-.75h1.5v-1.5a.75.75 0 0 1 .75-.75h1.94l2.438-2.438c.619-.62 1.484-.766 2.221-.639A5.25 5.25 0 1 0 15.75 3ZM9 8.25a6.75 6.75 0 1 1 5.594 6.651c-.39-.067-.717.032-.906.221L11.03 17.78a.75.75 0 0 1-.53.22H9v1.5a.75.75 0 0 1-.75.75h-1.5v1.5a.75.75 0 0 1-.75.75H2.25a.75.75 0 0 1-.75-.75v-2.818a3 3 0 0 1 .879-2.121l6.499-6.5c.189-.188.288-.516.22-.905A6.788 6.788 0 0 1 9 8.25Zm6-3a.75.75 0 0 1 .75-.75 3.75 3.75 0 0 1 3.75 3.75.75.75 0 0 1-1.5 0A2.25 2.25 0 0 0 15.75 6a.75.75 0 0 1-.75-.75Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgKey;
