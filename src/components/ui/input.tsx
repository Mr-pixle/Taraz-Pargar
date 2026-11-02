import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-[10px] border border-input bg-background/75 shadow-[inset_0_1px_2px_hsl(222_40%_20%/0.05)] transition-[border-color,box-shadow,background-color] duration-150 hover:border-foreground/25 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-azure focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-azure/15 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/15 disabled:cursor-not-allowed disabled:opacity-55 px-3 py-1 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
