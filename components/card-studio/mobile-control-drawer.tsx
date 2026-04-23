"use client"

import { useState } from "react"
import { Settings2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer"
import { PanelHeader, PanelBody } from "./control-panel"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"

/**
 * Mobile-only bottom drawer with all studio controls. Shows a floating action
 * button (FAB) in the bottom-right corner; tapping it slides up the control
 * panel from the bottom edge. The drawer can be dismissed by swiping down on
 * the handle area, tapping the overlay, or pressing the X button.
 */
export function MobileControlDrawer() {
  const [open, setOpen] = useState(false)

  const onCapture = () => {
    const fn = (window as unknown as { __captureCard?: () => void }).__captureCard
    fn?.()
  }

  return (
    <>
      {/* Floating Action Button — only visible when drawer is closed */}
      {!open && (
        <Button
          size="lg"
          className="fixed bottom-6 right-6 z-40 size-14 rounded-full shadow-lg md:hidden"
          onClick={() => setOpen(true)}
          aria-label="Open settings"
        >
          <Settings2 className="size-6" />
        </Button>
      )}

      <Drawer open={open} onOpenChange={setOpen} scrollLockTimeout={0}>
        <DrawerContent className="flex max-h-[85dvh] flex-col md:hidden">
          <VisuallyHidden>
            <DrawerTitle>Card Studio Settings</DrawerTitle>
          </VisuallyHidden>
          
          {/* Close button in the top-right corner */}
          <DrawerClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 z-10"
              aria-label="Close settings"
            >
              <X className="size-5" />
            </Button>
          </DrawerClose>

          {/* Header is draggable for closing */}
          <PanelHeader onCapture={onCapture} />
          
          {/*
            Scrollable body wrapped with data-vaul-no-drag so touch events
            inside this area scroll the content instead of closing the drawer.
            This is the key to allowing full scroll on mobile.
          */}
          <div data-vaul-no-drag className="min-h-0 flex-1 overflow-hidden">
            <PanelBody 
              className="h-full max-h-[calc(85dvh-120px)] overflow-y-auto" 
              onCapture={onCapture} 
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
