import { type ComponentType, type ReactNode } from "react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

export function AdminPageHeader({
  eyebrow = "Workspace",
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="max-w-3xl">
        <p className="kicker">{eyebrow}</p>
        <h2 className="mt-2 text-3xl text-foreground sm:text-4xl">{title}</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function AdminStat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("admin-stat rounded-[1.35rem] px-4 py-4", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function AdminPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("admin-panel rounded-[1.6rem]", className)}>{children}</div>;
}

export function AdminPanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-5 py-4 sm:px-6",
        className,
      )}
    >
      <div className="max-w-2xl">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function AdminEmptyState({
  title,
  description,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description: string;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "admin-empty flex flex-col items-center justify-center rounded-[1.4rem] px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/8 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-lg font-semibold text-foreground">{title}</p>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
