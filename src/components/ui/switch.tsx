"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

// Glass key switch: frosted track, glossy bead; the bead stretches while pressed. RTL-aware travel.
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "group peer relative inline-flex h-[24px] w-[42px] shrink-0 cursor-pointer items-center rounded-full border p-[2px] transition-[background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=unchecked]:border-foreground/10 data-[state=unchecked]:bg-foreground/10 data-[state=unchecked]:shadow-[inset_0_1px_3px_hsl(222_40%_10%/0.18)]",
      "data-[state=checked]:border-azure/60 data-[state=checked]:bg-azure data-[state=checked]:bg-[linear-gradient(180deg,hsl(0_0%_100%/0.22),transparent_60%)] data-[state=checked]:shadow-[inset_0_1px_0_hsl(0_0%_100%/0.3),0_0_0_3px_hsl(var(--azure)/0.14),0_4px_12px_-4px_hsl(var(--azure)/0.6)]",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-[18px] w-[18px] rounded-full bg-white shadow-[inset_0_-1px_1px_hsl(222_30%_20%/0.12),0_1px_1px_hsl(222_40%_10%/0.12),0_2px_6px_hsl(222_40%_10%/0.25)] ring-0 [background-image:radial-gradient(circle_at_50%_25%,#fff,#eef1f6_70%)]",
        "transition-[transform,width] duration-[260ms] [transition-timing-function:cubic-bezier(0.3,1.4,0.5,1)] group-active:w-[23px]",
        "data-[state=unchecked]:translate-x-0 data-[state=checked]:translate-x-[18px] rtl:data-[state=checked]:-translate-x-[18px] group-active:data-[state=checked]:translate-x-[13px] rtl:group-active:data-[state=checked]:-translate-x-[13px]"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
