import type { SVGProps } from "react";
import * as React from "react";

const SvgBy = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#FCFCFC"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path fill="#A2001D" d="M4.13 9.275 3.043 7.303l1.087-1.94 1.087 1.94z" />
    <path
      fill="#A2001D"
      d="M1.956 9.275.87 7.303l1.087-1.94 1.087 1.94zM4.13 14.638l-1.087-1.972 1.087-1.941 1.087 1.94z"
    />
    <path
      fill="#A2001D"
      d="M1.956 14.638.87 12.666l1.087-1.941 1.087 1.94zM5.218 1.941l-.308-.55q-.83.493-1.547 1.13l.768 1.392zM4.131 16.087l-.776 1.385q.717.637 1.546 1.131l.317-.575z"
    />
    <path
      fill="#6DA544"
      d="M6.088 12.609v6.596a10.003 10.003 0 0 0 13.291-5.727z"
    />
    <path
      fill="#A2001D"
      d="M19.379 13.478A10 10 0 0 0 20 10c0-5.523-4.477-10-10-10a10 10 0 0 0-3.913.795v12.683z"
    />
  </svg>
);
export default SvgBy;
