import { useEffect, useState } from "react";
import { Button, Dot, HaloMark } from "@/components/halo/ui";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const TOOLS = [
  {
    n: "01",
    name: "Nuke scraper",
    text: "Watches the servers you pick and has every account claim each nuke the moment it drops.",
  },
  {
    n: "02",
    name: "Join servers",
    text: "Paste invite links and your accounts join them at a careful pace, one after another.",
  },
  {
    n: "03",
    name: "Transfer",
    text: "Sends the points from every account to one place, by hand or automatically.",
  },
];

/** The first screen when Halo opens. The dashboard is one click away. */
export default function Home({ signedIn, onEnter }: { signedIn: boolean; onEnter: () => void }) {
  const [server, setServer] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    fetch(`${BASE}/api/auth/status`)
      .then((r) => setServer(r.ok ? "online" : "offline"))
      .catch(() => setServer("offline"));
  }, []);

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="mx-auto w-full max-w-5xl px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <HaloMark size={24} />
          <span className="text-[15px] font-semibold tracking-tight">Halo</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onEnter}>
          {signedIn ? "Dashboard" : "Sign in"}
        </Button>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6">
        <section className="pt-14 pb-16 sm:pt-24 sm:pb-24 grid md:grid-cols-[minmax(0,1fr)_280px] gap-12 items-center">
          <div>
            <h1 className="text-[34px] sm:text-[48px] leading-[1.05] font-semibold tracking-tight max-w-[14ch]">
              Every nuke. Every account.
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-fg-2 max-w-[46ch]">
              Halo runs your Discord accounts on your own server, claims nukes the second they drop, and moves the
              points where you want them.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Button variant="primary" size="lg" className="px-6" onClick={onEnter}>
                Open dashboard
              </Button>
              <span className="inline-flex items-center gap-2 text-[13px] text-fg-3">
                <Dot tone={server === "online" ? "ok" : server === "offline" ? "bad" : "off"} />
                {server === "online" ? "Server online" : server === "offline" ? "Can't reach the server" : "Checking server"}
              </span>
            </div>
          </div>

          <div className="hidden md:flex justify-center" aria-hidden>
            <svg width="240" height="240" viewBox="0 0 240 240" fill="none">
              <circle cx="120" cy="120" r="96" stroke="var(--color-line-strong)" strokeWidth="1" />
              <circle cx="120" cy="120" r="74" stroke="var(--color-halo)" strokeWidth="14" />
              <circle cx="120" cy="120" r="52" stroke="var(--color-line)" strokeWidth="1" />
            </svg>
          </div>
        </section>

        <section className="border-t border-line grid md:grid-cols-3">
          {TOOLS.map((t, i) => (
            <div key={t.n} className={"py-7 md:pr-8 " + (i > 0 ? "border-t md:border-t-0 md:border-l border-line md:pl-8" : "")}>
              <div className="text-[12px] tabular text-halo">{t.n}</div>
              <h2 className="mt-2 text-[15px] font-semibold">{t.name}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{t.text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <div className="py-6 border-t border-line text-[12px] text-fg-3">Runs on your server. Account tokens never leave it.</div>
      </footer>
    </div>
  );
}
