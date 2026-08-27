import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useWallet } from "@/lib/wallet";
import { NETWORK } from "@/lib/baskt/config";
import { baskt } from "@/lib/baskt";
import { formatGen, shortAddress } from "@/lib/baskt/format";
import { cn } from "@/lib/utils";
import { Check, Copy, LogOut, Menu, Network, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";

const NAV = [
  { to: "/", label: "Markets" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/activity", label: "Activity" },
  { to: "/create", label: "Create Market" },
  { to: "/how-it-works", label: "How it works" },
] as const;

function NavLinks({ onNavigate, vertical }: { onNavigate?: () => void; vertical?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className={cn("flex gap-1", vertical ? "flex-col" : "items-center")}>
      {NAV.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-elevated font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function WalletButton() {
  const {
    address,
    connected,
    connecting,
    connect,
    disconnect,
    network,
    networkOk,
    switchToBradbury,
  } = useWallet();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (connected)
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("num", !networkOk && "border-warn/50 text-warn")}
            >
              <Wallet className="h-4 w-4" />
              {shortAddress(address!)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 bg-card">
            <DropdownMenuLabel>
              <span className="label-xs">Wallet</span>
              <span className="mt-1 block font-mono text-xs font-normal text-foreground">
                {shortAddress(address!)}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>
              <span className="label-xs">Network</span>
              <span
                className={cn(
                  "mt-1 flex items-center gap-1.5 text-xs font-normal",
                  networkOk ? "text-up" : "text-warn",
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {networkOk ? network : "Wrong network"}
              </span>
            </DropdownMenuLabel>
            {!networkOk && (
              <DropdownMenuItem onSelect={() => void switchToBradbury()}>
                <Network className="h-4 w-4" /> Switch to Baskt network
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => {
                void navigator.clipboard?.writeText(address!);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy address"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setDisconnectOpen(true)}>
              <LogOut className="h-4 w-4" /> Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect wallet?</AlertDialogTitle>
              <AlertDialogDescription>
                Your public market data will stay visible. Wallet-specific data will be cleared from
                this session.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={disconnect}>Disconnect</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  return (
    <Button size="sm" onClick={() => void connect()} disabled={connecting}>
      <Wallet className="h-4 w-4" />
      {connecting ? "Connecting…" : "Connect wallet"}
    </Button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => baskt.get_config(),
    staleTime: 60_000,
  });
  const sources = config.data?.sources.join(" + ") ?? "Settlement sources";
  const minStake = config.data ? formatGen(config.data.minimum_stake) : "GEN minimum";
  const maxStake = config.data ? formatGen(config.data.maximum_stake) : "GEN maximum";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 lg:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground">
              B
            </span>
            <span className="text-[15px] font-semibold tracking-tight">BASKT</span>
          </Link>

          <div className="hidden lg:block">
            <NavLinks />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-up" />
              {NETWORK.name}
            </span>
            <WalletButton />
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64 bg-card p-4">
                <span className="text-sm font-semibold">BASKT</span>
                <div className="mt-6">
                  <NavLinks vertical onNavigate={() => setOpen(false)} />
                </div>
                <p className="mt-6 text-[11px] text-muted-foreground">{NETWORK.name}</p>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-6 lg:py-8">{children}</main>

      <footer className="border-t border-border px-4 py-6 lg:px-6">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>BASKT · Daily ETF UP/DOWN markets on GenLayer</span>
          <span className="num">
            Sources: {sources} · No fees · {minStake}–{maxStake} per wallet
          </span>
        </div>
      </footer>
    </div>
  );
}
