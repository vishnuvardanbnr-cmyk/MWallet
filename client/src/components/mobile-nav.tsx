import { useLocation } from "wouter";
import { LayoutDashboard, DollarSign, Wallet, Users, ArrowLeftRight } from "lucide-react";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Income", url: "/income", icon: DollarSign },
  { title: "Wallet", url: "/wallet", icon: Wallet },
  { title: "Team", url: "/team", icon: Users },
  { title: "Txns", url: "/transactions", icon: ArrowLeftRight },
];

export function MobileNav() {
  const [location, setLocation] = useLocation();

  const isActive = (url: string) => {
    if (url === "/") return location === "/";
    return location.startsWith(url);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-white/[0.06] backdrop-blur-2xl bg-[#060a13]/95" data-testid="nav-mobile-bottom">
      <div className="flex items-center justify-around px-1 py-1 safe-area-bottom">
        {navItems.map((item) => {
          const active = isActive(item.url);
          return (
            <button
              key={item.url}
              onClick={() => setLocation(item.url)}
              className={`flex flex-col items-center gap-0.5 py-2 px-3.5 rounded-xl transition-all duration-300 ${
                active ? "" : "text-muted-foreground/60"
              }`}
              data-testid={`nav-mobile-${item.title.toLowerCase()}`}
            >
              <div className={`relative p-1.5 rounded-xl transition-all duration-300 ${active ? "bg-gradient-to-br from-yellow-600/20 to-amber-400/10" : ""}`}>
                <item.icon className={`h-5 w-5 transition-all duration-300 ${active ? "text-yellow-300" : ""}`} />
                {active && (
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-300" />
                )}
              </div>
              <span className={`text-[10px] font-medium transition-all duration-300 ${active ? "gradient-text" : ""}`} style={{ fontFamily: 'var(--font-display)' }}>
                {item.title}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
