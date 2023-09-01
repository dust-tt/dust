import { useId } from 'react'

export function DustIcon(props) {
  return (
    <img src="/favicon180.png" alt="dust" className="h-6 w-6" />
  )
}

export function Title(props) {
  return (
    <div className="mx-1 mt-8 flex flex-row items-center">
      <DustIcon />
      <div className="flex h-4 w-4"></div>
      <div className="flex text-2xl font-bold tracking-tight text-white">DUST BLOG</div>
    </div>
  )
}