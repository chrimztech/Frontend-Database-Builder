import { type ComponentType, type ReactNode, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Standard shape returned by every paginated backend list endpoint. */
export type PageResponse<T> = {
  content: T[];
  total_elements: number;
  total_pages: number;
  number: number;
  size: number;
};

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** 0-indexed page numbers to render, with `null` standing in for an ellipsis gap. */
function buildPageNumbers(page: number, totalPages: number): (number | null)[] {
  const last = totalPages - 1;
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const window = new Set<number>([0, last, page]);
  if (page > 0) window.add(page - 1);
  if (page < last) window.add(page + 1);

  const sorted = [...window].sort((a, b) => a - b);
  const result: (number | null)[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push(null);
    result.push(sorted[i]);
  }
  return result;
}

export function AdminPagination({
  page,
  totalPages,
  totalElements,
  pageSize,
  onPageChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageSizeChange,
  className,
}: {
  page: number;
  totalPages: number;
  totalElements: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  className?: string;
}) {
  const [jumpTo, setJumpTo] = useState("");

  if (totalElements === 0) return null;

  const lastPage = Math.max(totalPages - 1, 0);
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, totalElements);
  const pageNumbers = buildPageNumbers(page, totalPages);

  function submitJump(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(jumpTo);
    if (Number.isInteger(n) && n >= 1 && n <= totalPages) {
      onPageChange(n - 1);
    }
    setJumpTo("");
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-5 py-3 sm:px-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-xs text-muted-foreground">
          Showing <span className="font-medium text-foreground">{from}</span>–
          <span className="font-medium text-foreground">{to}</span> of{" "}
          <span className="font-medium text-foreground">{totalElements.toLocaleString()}</span>
        </p>
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground">Rows per page</label>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className="h-7 w-[68px] px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            disabled={page <= 0}
            onClick={() => onPageChange(0)}
            aria-label="First page"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            disabled={page <= 0}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>

          {pageNumbers.map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={p}
                size="sm"
                variant={p === page ? "default" : "outline"}
                className="h-7 min-w-7 px-2 text-xs"
                onClick={() => onPageChange(p)}
                aria-label={`Page ${p + 1}`}
                aria-current={p === page ? "page" : undefined}
              >
                {p + 1}
              </Button>
            ),
          )}

          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            disabled={page + 1 >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            disabled={page + 1 >= totalPages}
            onClick={() => onPageChange(lastPage)}
            aria-label="Last page"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {totalPages > 7 && (
          <form onSubmit={submitJump} className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground">Go to</label>
            <Input
              type="number"
              min={1}
              max={totalPages}
              value={jumpTo}
              onChange={(e) => setJumpTo(e.target.value)}
              placeholder={String(page + 1)}
              className="h-7 w-16 px-2 text-xs"
            />
          </form>
        )}
      </div>
    </div>
  );
}

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
