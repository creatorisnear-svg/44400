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
import Login from "@/pages/login";
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
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  const [authed, setAuthed] = useState(() => !!getToken());

  if (!authed) {
    return <Login onAuth={() => setAuthed(true)} />;
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
