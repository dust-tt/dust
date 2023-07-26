import "@app/styles/global.css";

import { SparkleContext } from "@dust-tt/sparkle";
import Link from "next/link";
import { SessionProvider } from "next-auth/react";

function NextLinkWrapper({
  key,
  href,
  className,
  children,
  ariaCurrent,
  ariaLabel,
  onClick,
}) {
  return (
    <Link
      key={key}
      href={href}
      className={className}
      onClick={onClick}
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
    >
      {children}
    </Link>
  );
}

export default function App({
  Component,
  pageProps: { session, ...pageProps },
}) {
  return (
    <SparkleContext.Provider value={{ components: { link: NextLinkWrapper } }}>
      <SessionProvider session={session}>
        <Component {...pageProps} />
      </SessionProvider>
    </SparkleContext.Provider>
  );
}
