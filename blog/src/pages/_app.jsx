import Head from 'next/head'
import { ThemeProvider } from 'next-themes'
import { MDXProvider } from '@mdx-js/react'

import { Layout } from '@/components/Layout'
import * as mdxComponents from '@/components/mdx'

import '@/styles/tailwind.css'
import 'focus-visible'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Dust Blog - Build Smarter Teams with Generative AI</title>
        <link rel="shortcut icon" href="/favicon.png" />
        <meta
          name="description"
          content="Dust's mission is to harness the power of LLMs to help teams craft better content, understand their environment faster, and ultimately take better decisions. Here we document our voyage."
        />
      </Head>
      <ThemeProvider attribute="class" disableTransitionOnChange>
        <MDXProvider components={mdxComponents}>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </MDXProvider>
      </ThemeProvider>
    </>
  )
}
