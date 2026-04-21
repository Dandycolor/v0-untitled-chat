"use client"

import dynamic from "next/dynamic"

// Client-only; R3F / WebGL need window
const StudioApp = dynamic(
  () => import("@/components/card-studio/studio-app").then((m) => m.StudioApp),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        Loading studio…
      </div>
    ),
  },
)

export default function Page() {
  return <StudioApp />
}
