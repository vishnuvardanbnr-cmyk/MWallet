import { useLocation, Link } from "wouter";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { LayoutDashboard, DollarSign, Wallet, Users, ArrowLeftRight, UserCircle, HelpCircle, LogOut, Copy, GitBranch, ShoppingBag, ArrowDownUp, Coins, BadgeDollarSign, TrendingDown, RefreshCw } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { shortenAddress } from "@/lib/contract";
import { useToast } from "@/hooks/use-toast";

const menuItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Income", url: "/income", icon: DollarSign },
  { title: "Wallet", url: "/wallet", icon: Wallet },
  { title: "Team", url: "/team", icon: Users },
  { title: "Deep Placement", url: "/deep-placement", icon: GitBranch },
  { title: "BTC Swap", url: "/swap", icon: ArrowDownUp },
  { title: "Sell MVT", url: "/sell-tokens", icon: TrendingDown },
  { title: "Paid Staking", url: "/paid-staking", icon: Coins },
  { title: "MUSDT Staking", url: "/musdt-staking", icon: BadgeDollarSign },
  { title: "Store", url: "/store", icon: ShoppingBag },
  { title: "Transactions", url: "/transactions", icon: ArrowLeftRight },
  { title: "Profile", url: "/profile", icon: UserCircle },
  { title: "Support", url: "/support", icon: HelpCircle },
];

interface AppSidebarProps {
  account: string;
  userAddress: string;
  disconnect: () => void;
}

export function AppSidebar({ account, userAddress, disconnect }: AppSidebarProps) {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { isMobile, setOpenMobile } = useSidebar();

  const copyReferralLink = (side: "left" | "right") => {
    const link = `${window.location.origin}?ref=${userAddress}&side=${side}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Copied!", description: `${side.charAt(0).toUpperCase() + side.slice(1)} referral link copied to clipboard.` });
  };

  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-2 border-b border-white/[0.06]">
        <Logo size="sm" />
        <div className="mt-2 rounded-lg px-2.5 py-2 space-y-1.5 bg-gradient-to-br from-yellow-600/8 to-amber-400/5 border border-white/[0.06]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Wallet</p>
            <p className="text-[10px] font-mono text-amber-300/80" data-testid="text-wallet-address">{shortenAddress(account)}</p>
          </div>
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] border-white/[0.08] bg-white/[0.02] hover:bg-yellow-600/10 hover:border-yellow-600/20 transition-all" onClick={() => copyReferralLink("left")} data-testid="button-copy-left-link">
            <Copy className="w-3 h-3" /> Left
          </Button>
          <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] border-white/[0.08] bg-white/[0.02] hover:bg-yellow-600/10 hover:border-yellow-600/20 transition-all" onClick={() => copyReferralLink("right")} data-testid="button-copy-right-link">
            <Copy className="w-3 h-3" /> Right
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    isActive={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, '-')}`}
                    onClick={() => {
                      setLocation(item.url);
                      if (isMobile) setOpenMobile(false);
                    }}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-white/[0.06]">
        <Button variant="outline" size="sm" className="w-full border-white/[0.08] bg-white/[0.02] hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-all" onClick={disconnect} data-testid="button-disconnect">
          <LogOut className="w-4 h-4" /> Disconnect
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
