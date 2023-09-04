import { Intro, IntroFooter } from '@/components/Intro'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useRouter } from 'next/router';

function FixedSidebar({ main, footer, isRootUrl }) {
  return (
    <div className="bg-structure-100-dark relative flex-none overflow-hidden px-6 lg:pointer-events-none lg:fixed lg:inset-0 lg:z-40 lg:flex lg:px-0 lg:bg-transparent">
      <div className="bg-structure-100-dark relative flex w-full lg:pointer-events-auto lg:mr-[calc(max(2rem,65%-38rem)+40rem)] lg:min-w-[32rem] lg:overflow-y-auto lg:overflow-x-hidden lg:pl-[max(4rem,calc(35%-38rem))]">
        <div className="mx-auto max-w-lg lg:mx-0 lg:flex lg:w-96 lg:max-w-none lg:flex-col lg:before:flex-1 lg:before:pt-6">
          <div className={// On mobile when not on the root url, we hide the intro and footer (only show dust blog logo)
            "sm:pb-20 sm:pt-32 lg:py-20" + (isRootUrl ? " pb-16 pt-20" : " pb-6")}>
            <div className="relative">
              {main}
            </div>
          </div>
          <div className={"flex flex-1 items-end justify-center pb-4 lg:justify-start lg:pb-6" + (
            !isRootUrl ? " hidden sm:flex" : "")}>
            {footer}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Layout({ children }) {
  let router = useRouter();
  let isRootUrl = router.pathname === '/';

  return (
    <>
      <FixedSidebar main={<Intro isRootUrl={isRootUrl} />} footer={<IntroFooter />} isRootUrl={isRootUrl} />
      <ThemeToggle />
      <div className="relative flex-auto">
        <main className="space-y-20 py-20 sm:space-y-32 sm:py-32">
          {children}
        </main>
      </div>
    </>
  )
}
