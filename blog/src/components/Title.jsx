import { useId } from 'react'

export function DustIcon(props) {
  return (
    <div className="flex rotate-[30deg]">
      <div className="h-4 w-[8px] rounded-xl bg-gray-400 group-hover:bg-violet-700"></div>
      <div className="h-4 w-[2px] bg-transparent"></div>
      <div className="h-6 w-[8px] rounded-xl bg-gray-400 group-hover:bg-violet-700"></div>
    </div>
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