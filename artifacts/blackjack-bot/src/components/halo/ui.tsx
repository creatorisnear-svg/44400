import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/lib/hooks";

export function HaloMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <circle cx="12" cy="12" r="7.5" stroke="var(--color-halo)" strokeWidth="2.75" />
    </svg>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-halo text-[#151515] hover:bg-halo-strong disabled:hover:bg-halo",
  secondary: "bg-raised text-fg border border-line-strong hover:bg-hover",
  ghost: "text-fg-2 hover:text-fg hover:bg-raised",
  danger: "text-bad border border-bad/35 hover:bg-bad/10",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-3.5 text-[13px]",
  lg: "h-11 px-4 text-sm",
};

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    busy?: boolean;
  }
>(({ variant = "secondary", size = "md", busy, className, children, disabled, ...props }, ref) => (
  <button
    ref={ref}
    disabled={disabled || busy}
    className={cn(
      "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-halo/60",
      "disabled:opacity-45 disabled:cursor-not-allowed",
      variants[variant],
      sizes[size],
      className,
    )}
    {...props}
  >
    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
    {children}
  </button>
));
Button.displayName = "Button";

const fieldBase =
  "w-full rounded-md bg-canvas border border-line-strong text-fg placeholder:text-fg-3 " +
  "focus:outline-none focus:border-halo/70 transition-colors disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, "h-10 px-3 text-sm", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn(fieldBase, "h-10 pl-3 pr-9 text-sm cursor-pointer", className)} {...props} />
  ),
);
Select.displayName = "Select";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldBase, "px-3 py-2.5 text-sm resize-y", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-fg-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-bad">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-fg-3 leading-relaxed">{hint}</p>
      ) : null}
    </div>
  );
}

export function Panel({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-lg border border-line bg-panel", className)} {...props}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {sub && <p className="mt-1 text-[13px] text-fg-2">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

const statusText: Record<ConnectionStatus, string> = {
  connected: "Online",
  connecting: "Connecting",
  disconnected: "Offline",
  error: "Problem",
};

const dotColor: Record<string, string> = {
  connected: "bg-ok",
  connecting: "bg-halo animate-pulse",
  disconnected: "bg-fg-3",
  error: "bg-bad",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  halo: "bg-halo",
  off: "bg-fg-3",
};

export function Dot({ tone, className }: { tone: string; className?: string }) {
  return <span className={cn("inline-block w-[7px] h-[7px] rounded-full shrink-0", dotColor[tone] ?? "bg-fg-3", className)} />;
}

export function ConnectionLabel({ status, enabled = true }: { status: ConnectionStatus; enabled?: boolean }) {
  if (!enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-3">
        <Dot tone="off" /> Turned off
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px]", status === "connected" ? "text-fg-2" : status === "error" ? "text-bad" : "text-fg-3")}>
      <Dot tone={status} /> {statusText[status]}
    </span>
  );
}

export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "ok" | "bad" | "warn";
  children: React.ReactNode;
  className?: string;
}) {
  const rule = { info: "border-line-strong", ok: "border-ok", bad: "border-bad", warn: "border-warn" }[tone];
  const text = { info: "text-fg-2", ok: "text-fg", bad: "text-fg", warn: "text-fg" }[tone];
  return (
    <div className={cn("border-l-2 pl-3 py-1 text-[13px] leading-relaxed", rule, text, className)}>{children}</div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: NoInfer<T>; label: React.ReactNode }[];
  onChange: (v: NoInfer<T>) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-md border border-line-strong p-0.5 bg-canvas", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 px-3 rounded-[5px] text-[13px] font-medium transition-colors",
            value === o.value ? "bg-hover text-fg" : "text-fg-3 hover:text-fg-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-45",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-halo/60",
        checked ? "bg-halo" : "bg-line-strong",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full transition-transform",
          checked ? "translate-x-[18px] bg-[#151515]" : "translate-x-0.5 bg-fg-2",
        )}
      />
    </button>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-[13px] text-fg-3">
      <Loader2 className="w-4 h-4 animate-spin" /> {label}
    </div>
  );
}

/** Label/value pair used in the figures strip. */
export function Figure({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "halo" | "ok" }) {
  return (
    <div className="bg-panel px-4 py-3.5 min-w-0">
      <div className="text-[12px] text-fg-3">{label}</div>
      <div className={cn("mt-1 text-[22px] leading-tight font-semibold tabular tracking-tight truncate", tone === "halo" ? "text-halo" : tone === "ok" ? "text-ok" : "text-fg")}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[12px] text-fg-3 truncate">{sub}</div>}
    </div>
  );
}
