import { useEffect, useState, useRef } from "react";
import { ExternalLink, Smartphone, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { Logo } from "@/components/logo";

// ── Wallet definitions ────────────────────────────────────────────────────────
interface WalletDef {
  id: string;
  name: string;
  emoji: string;
  logo?: string;
  cardCls: string;
  /** Detect if this wallet injected window.ethereum */
  detect: (eth: any) => boolean;
  getLink: (target: string, host: string, ref: string, side: string) => string;
  iosStore?: string;
  androidStore?: string;
}

const WALLETS: WalletDef[] = [
  {
    id: "mwallet",
    name: "MWallet",
    emoji: "🟡",
    cardCls: "border-amber-400/50 bg-amber-500/15",
    detect: (e) => !!(e?.isMWallet || e?.isMChainWallet),
    getLink: (t) => `mchain-wallet://dapp?url=${encodeURIComponent(t)}`,
  },
  {
    id: "metamask",
    name: "MetaMask",
    emoji: "🦊",
    logo: "/metamask-logo.svg",
    cardCls: "border-orange-500/40 bg-orange-500/10",
    detect: (e) => !!e?.isMetaMask && !e?.isBraveWallet && !e?.isTokenPocket,
    getLink: (_t, host, ref, side) =>
      `https://metamask.app.link/dapp/${host}/?ref=${ref}&side=${side}`,
    iosStore:     "https://apps.apple.com/app/metamask/id1438144202",
    androidStore: "https://play.google.com/store/apps/details?id=io.metamask",
  },
  {
    id: "trustwallet",
    name: "Trust Wallet",
    emoji: "🛡️",
    logo: "/trustwallet-logo.svg",
    cardCls: "border-blue-500/40 bg-blue-500/10",
    detect: (e) => !!(e?.isTrust || e?.isTrustWallet),
    getLink: (t) =>
      `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(t)}`,
    iosStore:     "https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409",
    androidStore: "https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp",
  },
  {
    id: "tokenpocket",
    name: "TokenPocket",
    emoji: "💚",
    logo: "/tokenpocket-logo.svg",
    cardCls: "border-emerald-500/40 bg-emerald-500/10",
    detect: (e) => !!e?.isTokenPocket,
    getLink: (t) =>
      `tpdapp://url?params=${encodeURIComponent(JSON.stringify({ url: t, source: "mvault" }))}`,
    iosStore:     "https://apps.apple.com/app/tokenpocket-crypto-btc-wallet/id1436028697",
    androidStore: "https://play.google.com/store/apps/details?id=vip.mytokenpocket",
  },
  {
    id: "safepal",
    name: "SafePal",
    emoji: "🔷",
    logo: "/safepal-logo.svg",
    cardCls: "border-cyan-500/40 bg-cyan-500/10",
    detect: (e) => !!e?.isSafePal,
    getLink: (t) =>
      `safepalwallet://safepal.io/dapp?url=${encodeURIComponent(t)}`,
    iosStore:     "https://apps.apple.com/app/safepal-crypto-defi-wallet/id1548297139",
    androidStore: "https://play.google.com/store/apps/details?id=io.safepal.wallet",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function isAndroid() { return /android/i.test(navigator.userAgent); }
function isIOS()     { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function isMobile()  { return isAndroid() || isIOS(); }

// ── Component ─────────────────────────────────────────────────────────────────
export default function WalletOpenPage() {
  const params    = new URLSearchParams(window.location.search);
  const ref       = params.get("ref") || "";
  const side      = params.get("side") || "left";
  const host      = window.location.host;
  const origin    = window.location.origin;
  const targetUrl = `${origin}/?ref=${ref}&side=${side}`;

  const [autoOpened,     setAutoOpened]     = useState(false);
  const [detectedWallet, setDetectedWallet] = useState<string | null>(null);
  const [eip6963Names,   setEip6963Names]   = useState<string[]>([]);
  const [tryingId,       setTryingId]       = useState<string | null>(null);
  const [notInstalled,   setNotInstalled]   = useState<string | null>(null);
  const [mwalletInstall, setMwalletInstall] = useState<{ url: string; linkType: string } | null>(null);
  const visTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch admin-configured MWallet download URL
  useEffect(() => {
    fetch("/api/settings/mwallet-url")
      .then(r => r.json())
      .then(data => { if (data.url) setMwalletInstall(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const eth = (window as any).ethereum;

    // ── Already inside a wallet browser ──
    if (eth) {
      // Find which wallet we're in
      const matched = WALLETS.find(w => w.detect(eth));
      if (matched) setDetectedWallet(matched.id);
      // Auto-redirect after a short flash so user sees the detected wallet
      setTimeout(() => {
        window.location.href = targetUrl;
        setAutoOpened(true);
      }, 800);
      return;
    }

    // ── EIP-6963 multi-provider discovery ──
    const handler = (event: Event) => {
      const { info } = (event as CustomEvent).detail ?? {};
      if (info?.name) setEip6963Names(prev => [...new Set([...prev, info.name])]);
    };
    window.addEventListener("eip6963:announceProvider", handler as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", handler as EventListener);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Try deep link + page-visibility detection ────────────────────────────
  const handleWallet = (w: WalletDef) => {
    setNotInstalled(null);
    setTryingId(w.id);

    const deepLink = w.getLink(targetUrl, host, ref, side);
    window.location.href = deepLink;

    // If deep link worked the page goes to background — visible = false
    const onVisibility = () => {
      if (document.hidden) {
        if (visTimer.current) clearTimeout(visTimer.current);
        setTryingId(null);
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // After 4s still visible → app not installed
    visTimer.current = setTimeout(() => {
      document.removeEventListener("visibilitychange", onVisibility);
      setTryingId(null);
      setNotInstalled(w.id);
    }, 4000);
  };

  const openInBrowser = () => { window.location.href = targetUrl; };

  const getStoreLink = (w: WalletDef) => {
    if (w.id === "mwallet") return mwalletInstall?.url ?? undefined;
    return isIOS() ? w.iosStore : isAndroid() ? w.androidStore : undefined;
  };

  // ── Auto-redirecting splash ──────────────────────────────────────────────
  if (autoOpened) {
    const dw = WALLETS.find(w => w.id === detectedWallet);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        {dw && <span className="text-5xl">{dw.emoji}</span>}
        <p className="text-sm text-muted-foreground animate-pulse">
          {dw ? `Opening in ${dw.name}…` : "Opening M-Wallet…"}
        </p>
      </div>
    );
  }

  // Which wallets are "confirmed detected" via ethereum flags or eip6963
  const confirmedIds = new Set<string>(
    eip6963Names.length > 0
      ? WALLETS.filter(w => eip6963Names.some(n => n.toLowerCase().includes(w.name.toLowerCase().split(" ")[0]))).map(w => w.id)
      : []
  );

  // Sort: detected wallets first, then rest
  const sorted = [
    ...WALLETS.filter(w => confirmedIds.has(w.id)),
    ...WALLETS.filter(w => !confirmedIds.has(w.id)),
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-5 relative overflow-hidden">
      <div className="absolute top-[-15%] left-[-10%] w-[400px] h-[400px] rounded-full bg-amber-600/[0.07] blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[350px] h-[350px] rounded-full bg-yellow-600/[0.05] blur-[140px] pointer-events-none" />

      <div className="w-full max-w-sm space-y-5 relative z-10 slide-in">

        {/* Logo */}
        <div className="flex justify-center floating">
          <Logo size="lg" />
        </div>

        {/* Card */}
        <div className="premium-card rounded-2xl p-5 space-y-5">
          <div className="text-center space-y-1">
            <h1 className="text-base font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}>
              You've been invited to M-Wallet
            </h1>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Tap your wallet app to open the link inside its browser — it connects automatically.
            </p>
          </div>

          {/* Detected badge */}
          {confirmedIds.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <p className="text-[11px] text-emerald-400">
                {confirmedIds.size} wallet{confirmedIds.size > 1 ? "s" : ""} detected on this device
              </p>
            </div>
          )}

          {/* MWallet — full width, preferred */}
          {(() => {
            const w = WALLETS.find(x => x.id === "mwallet")!;
            const isTrying = tryingId === w.id;
            const isFailed = notInstalled === w.id;
            return (
              <div className="space-y-1">
                <button
                  onClick={() => handleWallet(w)}
                  disabled={tryingId !== null}
                  className="relative w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-cyan-400/40 bg-gradient-to-r from-[#0d1b2e] to-[#0a2233] hover:from-[#0f2035] hover:to-[#0c2840] transition-all disabled:opacity-60"
                  data-testid="button-open-mwallet"
                >
                  <img src="/mwallet-logo.png" alt="MWallet" className="w-9 h-9 rounded-xl object-cover shrink-0" />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-white">MWallet</p>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 uppercase tracking-wide">
                        Preferred
                      </span>
                      {isTrying && <span className="text-[9px] text-amber-400 animate-pulse">Opening…</span>}
                    </div>
                    <p className="text-[10px] text-cyan-400/70 mt-0.5">MChain native wallet</p>
                  </div>
                  <div className="shrink-0 text-cyan-400/50 text-xs">→</div>
                </button>
                {isFailed && (
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 text-red-400" />
                      <p className="text-[10px] text-red-400">Not installed</p>
                    </div>
                    {getStoreLink(w) && (
                      <a href={getStoreLink(w)} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300">
                        <Download className="h-2.5 w-2.5" />
                        Install
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Other wallets — 2-col grid */}
          <div className="grid grid-cols-2 gap-2">
            {WALLETS.filter(w => w.id !== "mwallet").map((w) => {
              const isConfirmed = confirmedIds.has(w.id);
              const isTrying    = tryingId === w.id;
              const isFailed    = notInstalled === w.id;
              return (
                <div key={w.id} className="space-y-1">
                  <button
                    onClick={() => handleWallet(w)}
                    disabled={tryingId !== null}
                    className={`relative w-full flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left disabled:opacity-60 ${
                      isConfirmed ? `${w.cardCls} ring-1 ring-inset ring-emerald-500/30` :
                      isFailed    ? "border-red-500/30 bg-red-500/5" :
                                    `${w.cardCls} hover:opacity-90`
                    }`}
                    data-testid={`button-open-${w.id}`}
                  >
                    {w.logo
                      ? <img src={w.logo} alt={w.name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      : <span className="text-xl leading-none">{w.emoji}</span>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{w.name}</p>
                      {isConfirmed && <p className="text-[9px] text-emerald-400">Detected ✓</p>}
                      {isTrying   && <p className="text-[9px] text-amber-400 animate-pulse">Opening…</p>}
                    </div>
                  </button>
                  {isFailed && (
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 text-red-400" />
                        <p className="text-[10px] text-red-400">Not installed</p>
                      </div>
                      {getStoreLink(w) && (
                        <a href={getStoreLink(w)} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300">
                          <Download className="h-2.5 w-2.5" />
                          Install
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Divider */}
          <div className="relative flex items-center gap-3">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          <button
            onClick={openInBrowser}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] transition-all text-xs text-muted-foreground hover:text-foreground"
            data-testid="button-open-browser"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Continue in browser
          </button>

          <div className="flex items-center justify-center gap-1.5">
            <Smartphone className="h-3 w-3 text-muted-foreground/40" />
            <p className="text-[10px] text-muted-foreground/40 text-center">
              {isMobile() ? "Wallet browser connects automatically" : "Open on mobile for wallet deep-link"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
