import * as React from "react";
import { Link, useLocation } from "wouter";
import { Activity, ArrowRightLeft, History, Settings2, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBotControl, useSetupState, useStatus } from "@/lib/hooks";
import { Button, Dot, HaloMark } from "./ui";

// Pages of the Nuke scraper tab. The Join servers tab is the single /join page.
const NAV = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/accounts", label: "Accounts", icon: Users },
  { href: "/transfer", label: "Transfer", icon: ArrowRightLeft },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

const isJoinPath = (path: string) => path === "/join" || path.startsWith("/join/");

/**
 * The top-level tabs. Switching only changes the view: the nuke watcher and
 * any server joining keep running on the server either way.
 */
function ToolTabs({ nukeHref, className }: { nukeHref: string; className?: string }) {
  const [location] = useLocation();
  const { data: status } = useStatus();
  const onJoin = isJoinPath(location);
  const joining = !!status?.joinJob && !status.joinJob.done;
  const tabs = [
    { href: nukeHref, label: "Nuke scraper", active: !onJoin, dot: status?.running ? "ok" : null },
    { href: "/join", label: "Join servers", active: onJoin, dot: joining ? "halo" : null },
  ];

  return (
    <div className={cn("flex rounded-md border border-line-strong p-0.5 bg-canvas", className)} role="tablist">
      {tabs.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          role="tab"
          aria-selected={t.active}
          className={cn(
            "flex-1 md:flex-none inline-flex items-center justify-center gap-2 h-8 px-3.5 rounded-[5px] text-[13px] font-medium whitespace-nowrap transition-colors",
            t.active ? "bg-hover text-fg" : "text-fg-3 hover:text-fg-2",
          )}
        >
          {t.label}
          {t.dot && <Dot tone={t.dot} />}
        </Link>
      ))}
    </div>
  );
}

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
  const onJoin = isJoinPath(location);

  // The Nuke scraper tab goes back to whichever of its pages was open last.
  const lastNukePage = React.useRef("/");
  if (!onJoin && NAV.some((n) => isActive(n.href))) lastNukePage.current = location;

  return (
    <div className="min-h-screen bg-canvas text-fg flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="max-w-[1080px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <HaloMark />
            <span className="text-[15px] font-semibold tracking-tight">Halo</span>
          </Link>

          <ToolTabs nukeHref={lastNukePage.current} className="hidden md:flex" />

          <div className="ml-auto flex items-center gap-4">
            <RunState />
            <StartStop control={control} />
          </div>
        </div>

        <div className="md:hidden px-4 pb-2.5">
          <ToolTabs nukeHref={lastNukePage.current} />
        </div>

        {!onJoin && (
          <nav className="hidden md:block border-t border-line">
            <div className="max-w-[1080px] mx-auto px-4 sm:px-6 h-11 flex items-stretch gap-1">
              {NAV.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "relative flex items-center px-2.5 first:-ml-2.5 text-[13px] font-medium transition-colors",
                    isActive(href) ? "text-fg" : "text-fg-3 hover:text-fg-2",
                  )}
                >
                  {label}
                  {href === "/transfer" && transferActive && <Dot tone="halo" className="ml-1.5" />}
                  {isActive(href) && <span className="absolute left-2.5 right-2.5 -bottom-px h-0.5 bg-halo" />}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>

      <ControlError control={control} />

      <main className="flex-1">
        <div className={cn("max-w-[1080px] mx-auto px-4 sm:px-6 pt-6 md:pb-16", onJoin ? "pb-16" : "pb-32")}>{children}</div>
      </main>

      <nav className={cn("md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-canvas/95 backdrop-blur pb-safe", onJoin && "hidden")}>
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
                {active && <span className="absolute top-0 left-4 right-4 h-0.5 bg-halo" />}
                <span className="relative">
                  <Icon className="w-5 h-5" strokeWidth={1.75} />
                  {href === "/transfer" && transferActive && <Dot tone="halo" className="absolute -top-0.5 -right-1" />}
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
