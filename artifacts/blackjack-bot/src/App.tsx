import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Shell from "@/components/halo/shell";
import NotFound from "@/pages/not-found";
import Overview from "@/pages/overview";
import Accounts from "@/pages/accounts";
import Transfer from "@/pages/transfer";
import History from "@/pages/history";
import Settings from "@/pages/settings";
import JoinServers from "@/pages/join";
import Login from "@/pages/login";
import Home from "@/pages/home";
import { getToken } from "@/lib/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 0 },
  },
});

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Overview} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/transfer" component={Transfer} />
        <Route path="/history" component={History} />
        <Route path="/settings" component={Settings} />
        <Route path="/join" component={JoinServers} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

// The home page shows once per visit; a reload inside the dashboard stays there.
const ENTERED_KEY = "halo.entered";

function readEntered() {
  try {
    return sessionStorage.getItem(ENTERED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeEntered(v: boolean) {
  try {
    if (v) sessionStorage.setItem(ENTERED_KEY, "1");
    else sessionStorage.removeItem(ENTERED_KEY);
  } catch {
    // Storage blocked: the home page just shows again next time.
  }
}

function App() {
  const [authed, setAuthed] = useState(() => !!getToken());
  const [entered, setEntered] = useState(readEntered);

  const enter = (v: boolean) => {
    writeEntered(v);
    setEntered(v);
  };

  if (!entered) {
    return <Home signedIn={authed} onEnter={() => enter(true)} />;
  }

  if (!authed) {
    return <Login onAuth={() => setAuthed(true)} onBack={() => enter(false)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
