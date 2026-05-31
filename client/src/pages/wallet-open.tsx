import { useEffect, useState } from "react";
import { ExternalLink, Smartphone } from "lucide-react";
import { Logo } from "@/components/logo";

interface WalletDef {
  name: string;
  emoji: string;
  color: string;
  getLink: (target: string, host: string, ref: string, side: string) => string;
}

const WALLETS: WalletDef[] = [
  {
    name: "MetaMask",
    emoji: "🦊",
    color: "from-orange-500/20 to-amber-500/10 border-orange-500/30 hover:border-orange-400/50",
    getLink: (_t, host, ref, side) =>
      `https://metamask.app.link/dapp/${host}/?ref=${ref}&side=${side}`,
  },
  {
    name: "Trust Wallet",
    emoji: "🛡️",
    color: "from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-400/50",
    getLink: (t) =>
      `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(t)}`,
  },
  {
    name: "TokenPocket",
    emoji: "🟢",
    color: "from-emerald-500/20 to-green-600/10 border-emerald-500/30 hover:border-emerald-400/50",
    getLink: (t) =>
      `tpdapp://url?params=${encodeURIComponent(JSON.stringify({ url: t, chain: "1888", source: "mvault" }))}`,
  },
  {
    name: "OKX Wallet",
    emoji: "⬛",
    color: "from-zinc-500/20 to-zinc-600/10 border-zinc-400/30 hover:border-zinc-300/50",
    getLink: (t) =>
      `okex://main/discover/dapp/open?dapp_url=${encodeURIComponent(t)}`,
  },
  {
    name: "SafePal",
    emoji: "🔷",
    color: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 hover:border-cyan-400/50",
    getLink: (t) =>
      `safepalwallet://safepal.io/dapp?url=${encodeURIComponent(t)}`,
  },
  {
    name: "imToken",
    emoji: "💙",
    color: "from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 hover:border-indigo-400/50",
    getLink: (t) =>
      `imtokenv2://navigate/dapp?url=${encodeURIComponent(t)}`,
  },
  {
    name: "Bitget",
    emoji: "🟡",
    color: "from-yellow-500/20 to-yellow-600/10 border-yellow-500/30 hover:border-yellow-400/50",
    getLink: (t) =>
      `bitkeep://api.bitkeep.com/api/redirect/dapp?url=${encodeURIComponent(t)}`,
  },
  {
    name: "Coin98",
    emoji: "🟠",
    color: "from-amber-500/20 to-yellow-600/10 border-amber-500/30 hover:border-amber-400/50",
    getLink: (t) =>
      `coin98://dapp?url=${encodeURIComponent(t)}`,
  },
];

export default function WalletOpenPage() {
  const params   = new URLSearchParams(window.location.search);
  const ref      = params.get("ref") || "";
  const side     = params.get("side") || "left";
  const host     = window.location.host;
  const origin   = window.location.origin;
  const targetUrl = `${origin}/?ref=${ref}&side=${side}`;

  const [autoOpened, setAutoOpened] = useState(false);
  const [tryingWallet, setTryingWallet] = useState<string | null>(null);

  useEffect(() => {
    const eth = (window as any).ethereum;
    if (eth) {
      // Already inside a wallet browser — jump straight to the app
      window.location.href = targetUrl;
      setAutoOpened(true);
    }
  }, []);

  if (autoOpened) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">Opening M-Vault…</p>
      </div>
    );
  }

  const handleWallet = (wallet: WalletDef) => {
    setTryingWallet(wallet.name);
    const deepLink = wallet.getLink(targetUrl, host, ref, side);
    window.location.href = deepLink;
    // After 2.5s, if still on page the app wasn't installed
    setTimeout(() => setTryingWallet(null), 2500);
  };

  const openInBrowser = () => {
    window.location.href = targetUrl;
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-[-15%] left-[-10%] w-[400px] h-[400px] rounded-full bg-amber-600/[0.07] blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[350px] h-[350px] rounded-full bg-yellow-600/[0.05] blur-[140px] pointer-events-none" />

      <div className="w-full max-w-sm space-y-6 relative z-10 slide-in">

        {/* Logo */}
        <div className="flex justify-center floating">
          <Logo size="lg" />
        </div>

        {/* Card */}
        <div className="premium-card rounded-2xl p-6 space-y-5">
          <div className="text-center space-y-1.5">
            <h1 className="text-lg font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}>
              You've been invited!
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Open M-Vault inside your crypto wallet's browser so it can connect automatically.
            </p>
          </div>

          {/* Wallet grid */}
          <div className="grid grid-cols-2 gap-2">
            {WALLETS.map((w) => (
              <button
                key={w.name}
                onClick={() => handleWallet(w)}
                disabled={tryingWallet !== null}
                className={`flex items-center gap-2.5 p-3 rounded-xl bg-gradient-to-br border transition-all text-left group disabled:opacity-50 ${w.color}`}
                data-testid={`button-open-${w.name.toLowerCase().replace(/\s/g, "-")}`}
              >
                <span className="text-xl leading-none">{w.emoji}</span>
                <span className="text-xs font-semibold text-foreground truncate">{w.name}</span>
              </button>
            ))}
          </div>

          {tryingWallet && (
            <p className="text-[11px] text-center text-amber-400/80 animate-pulse">
              Opening {tryingWallet}…
            </p>
          )}

          {/* Divider */}
          <div className="relative flex items-center gap-3">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {/* Fallback */}
          <button
            onClick={openInBrowser}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] transition-all text-sm text-muted-foreground hover:text-foreground"
            data-testid="button-open-browser"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Continue in browser
          </button>

          <div className="flex items-center justify-center gap-1.5">
            <Smartphone className="h-3 w-3 text-muted-foreground/40" />
            <p className="text-[10px] text-muted-foreground/40 text-center">
              Wallet browser keeps you connected automatically
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
