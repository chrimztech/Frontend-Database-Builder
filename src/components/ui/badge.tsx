import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.12em] transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-[var(--shadow-soft)] hover:bg-primary/88",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground shadow-[var(--shadow-soft)] hover:bg-secondary/85",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-[var(--shadow-soft)] hover:bg-destructive/88",
        outline: "border-border/80 bg-white/72 text-foreground shadow-[var(--shadow-soft)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
