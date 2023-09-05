import { Head, Html, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html className="h-full antialiased" lang="en">
      <Head />
      <body className="flex min-h-full flex-col bg-structure-50 dark:bg-structure-50-dark">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
