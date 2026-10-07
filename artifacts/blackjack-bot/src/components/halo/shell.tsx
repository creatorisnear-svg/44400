import * as React from "react";
import { Link, useLocation } from "wouter";
import { Activity, ArrowRightLeft, History, Settings2, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBotControl, useSetupState, useStatus } from "@/lib/hooks";
import { Button, Dot, HaloMark } from "./ui";

const NAV = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/accounts", label: "Accounts", icon: Users },
  { href: "/transfer", label: "Transfer", icon: ArrowRightLeft },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

function RunState() {
  const { data: status } = useStatus();
  const running = status?.running ?? false;
  const online = (status?.accounts ?? []).filter((a) => a.connected).length;
  const total = status?.accounts.length ?? 0;

  if (!running) {
    return (
      <span className="inline-flex items-center gap-2 text-[13px] text-fg-3">
        <Dot tone="off" /> Stopped
      </span>
    );
  }
  if (online === 0 && !(status?.accounts ?? []).some((a) => a.status === "connecting")) {
    return (
      <span className="inline-flex items-center gap-2 text-[13px] text-bad">
        <Dot tone="bad" /> No accounts online
      </span>
    );
  }
  if (online === 0) {
    return (
      <span className="inline-flex items-center gap-2 text-[13px] text-fg-2">
        <Dot tone="connecting" /> Connecting
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-fg-2 tabular">
      <Dot tone="ok" />
      <span className="hidden sm:inline">Running ·&nbsp;</span>
      {online} of {total} online
    </span>
  );
}

type Control = ReturnType<typeof useBotControl>;

function StartStop({ control: { start, stop } }: { control: Control }) {
  const { data: status } = useStatus();
  const { ready } = useSetupState();
  const running = status?.running ?? false;

  return running ? (
    <Button size="sm" variant="secondary" busy={stop.isPending} onClick={() => stop.mutate()}>
      Stop
    </Button>
  ) : (
    <Button
      size="sm"
      variant="primary"
      busy={start.isPending}
      disabled={!ready}
      title={ready ? undefined : "Finish setup first"}
      onClick={() => start.mutate()}
    >
      Start
    </Button>
  );
}

function ControlError({ control: { start, stop } }: { control: Control }) {
  const [hidden, setHidden] = React.useState<unknown>(null);
  const err = (start.error ?? stop.error) as Error | null;
  if (!err || hidden === err) return null;
  return (
    <div className="border-b border-bad/30 bg-bad/[0.07]">
      <div className="max-w-[1080px] mx-auto px-4 sm:px-6 py-2.5 flex items-start gap-3 text-[13px]">
        <span className="flex-1 text-fg">{err.message}</span>
        <button className="text-fg-3 hover:text-fg" onClick={() => setHidden(err)} aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const control = useBotControl();
  const { data: status } = useStatus();
  const transferActive = !!status?.fillOrder && !status.fillOrder.done;
  const isActive = (href: string) => (href === "/" ? location === "/" : location.startsWith(href));

  return (
    <div className="min-h-screen bg-canvas text-fg flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="max-w-[1080px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <HaloMark />
            <span className="text-[15px] font-semibold tracking-tight">Halo</span>
          </Link>

          <nav className="hidden md:flex items-stretch self-stretch gap-1">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center px-2.5 text-[13px] font-medium transition-colors",
                  isActive(href) ? "text-fg" : "text-fg-3 hover:text-fg-2",
                )}
              >
                {label}
                {href === "/transfer" && transferActive && <Dot tone="gold" className="ml-1.5" />}
                {isActive(href) && <span className="absolute left-2.5 right-2.5 -bottom-px h-0.5 bg-gold" />}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <RunState />
            <StartStop control={control} />
          </div>
        </div>
      </header>

      <ControlError control={control} />

      <main className="flex-1">
        <div className="max-w-[1080px] mx-auto px-4 sm:px-6 pt-6 pb-32 md:pb-16">{children}</div>
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-canvas/95 backdrop-blur pb-safe">
        <div className="flex">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex-1 flex flex-col items-center justify-center gap-1 h-[60px] text-[11px] font-medium",
                  active ? "text-fg" : "text-fg-3",
                )}
              >
                {active && <span className="absolute top-0 left-4 right-4 h-0.5 bg-gold" />}
                <span className="relative">
                  <Icon className="w-5 h-5" strokeWidth={1.75} />
                  {href === "/transfer" && transferActive && <Dot tone="gold" className="absolute -top-0.5 -right-1" />}
                </span>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
