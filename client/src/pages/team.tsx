import { useState, useEffect, useCallback } from "react";
import { Users, GitBranch, Loader2, ChevronLeft, ChevronRight, User, Copy, Check, ArrowDownLeft, ArrowDownRight, Share2 } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { shortenAddress } from "@/lib/contract";
import { useToast } from "@/hooks/use-toast";
import type { UserInfo } from "@/hooks/use-web3";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface TeamProps {
  userInfo: UserInfo;
  formatAmount: (val: bigint) => string;
  getDirectReferrals: (offset: number, limit: number) => Promise<{ referrals: string[]; total: number }>;
  account: string;
}

const ITEMS_PER_PAGE = 10;

function TreeNode({ address, label, color }: { address: string; label: string; color: string }) {
  const isEmpty = !address || address === ZERO_ADDRESS;
  return (
    <div
      className={`rounded-xl p-4 w-full text-center transition-all ${isEmpty ? "bg-white/[0.02] border border-dashed border-white/[0.08]" : `glass-card border ${color}`}`}
      data-testid={`card-tree-${label.toLowerCase()}`}
    >
      <div className={`h-8 w-8 mx-auto rounded-lg flex items-center justify-center mb-2 ${isEmpty ? "bg-white/[0.03]" : "bg-white/[0.06]"}`}>
        <User className={`h-4 w-4 ${isEmpty ? "text-muted-foreground/40" : "text-foreground"}`} />
      </div>
      <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
      {isEmpty ? (
        <p className="text-xs text-muted-foreground/50">Empty slot</p>
      ) : (
        <p className="text-xs font-mono gradient-text" data-testid={`text-tree-${label.toLowerCase()}-address`}>
          {shortenAddress(address)}
        </p>
      )}
    </div>
  );
}

export default function TeamPage({ userInfo, formatAmount, getDirectReferrals, account }: TeamProps) {
  const { toast } = useToast();
  const [copiedSide, setCopiedSide] = useState<"left" | "right" | null>(null);
  const [referrals, setReferrals] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const loadReferrals = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      const result = await getDirectReferrals(offset, ITEMS_PER_PAGE);
      setReferrals(result.referrals);
      setTotal(result.total);
    } catch {
      setReferrals([]);
    } finally {
      setLoading(false);
    }
  }, [getDirectReferrals, currentPage]);

  useEffect(() => { loadReferrals(); }, [loadReferrals]);

  const copyLink = (side: "left" | "right") => {
    const link = `${window.location.origin}?ref=${account}&side=${side}`;
    navigator.clipboard.writeText(link);
    setCopiedSide(side);
    toast({ title: "Copied!", description: `${side.charAt(0).toUpperCase() + side.slice(1)} referral link copied.` });
    setTimeout(() => setCopiedSide(null), 2000);
  };

  const shareWhatsApp = (side: "left" | "right") => {
    const link = `${window.location.origin}?ref=${account}&side=${side}`;
    const msg = `Join me on M-Vault — the DeFi MLM ecosystem on BNB Smart Chain! Activate for $130 and earn up to $390 (3×). Use my ${side} referral link: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const leftCount = Number(userInfo.leftSubUsers);
  const rightCount = Number(userInfo.rightSubUsers);
  const directCount = Number(userInfo.directCount);

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      <div className="slide-in">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          <span className="gradient-text">My Team</span>
        </h1>
        <p className="text-sm text-muted-foreground">Your referral network and binary tree</p>
      </div>

      {/* Team Stats */}
      <div className="grid grid-cols-3 gap-3 slide-in" style={{ animationDelay: "0.04s" }}>
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-direct-count">
          <Users className="h-4 w-4 mx-auto text-amber-400 mb-1.5" />
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Directs</p>
          <p className="text-xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-direct-count">{directCount}</p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-left-count">
          <ArrowDownLeft className="h-4 w-4 mx-auto text-blue-400 mb-1.5" />
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Left Team</p>
          <p className="text-xl font-bold text-blue-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-left-count">{leftCount}</p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-right-count">
          <ArrowDownRight className="h-4 w-4 mx-auto text-purple-400 mb-1.5" />
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Right Team</p>
          <p className="text-xl font-bold text-purple-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-right-count">{rightCount}</p>
        </div>
      </div>

      {/* Referral Links */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.05s" }} data-testid="card-referral-links">
        <h2 className="text-sm font-bold mb-3" style={{ fontFamily: "var(--font-display)" }}>
          <span className="gradient-text">Your Referral Links</span>
        </h2>
        <div className="space-y-2">
          {(["left", "right"] as const).map((side) => (
            <div key={side} className="flex items-center gap-2">
              <div className="flex-1 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2 font-mono text-[10px] text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap" data-testid={`text-ref-link-${side}`}>
                {window.location.origin}?ref={account.slice(0, 10)}...&side={side}
              </div>
              <button
                onClick={() => copyLink(side)}
                className={`p-2 rounded-xl transition-all shrink-0 ${copiedSide === side ? "bg-emerald-500/20 border border-emerald-500/30" : "bg-white/[0.04] border border-white/[0.06] hover:bg-amber-500/10"}`}
                data-testid={`button-copy-${side}`}
              >
                {copiedSide === side ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-amber-400" />}
              </button>
              <button
                onClick={() => shareWhatsApp(side)}
                className="p-2 rounded-xl bg-emerald-600/10 border border-emerald-600/20 hover:bg-emerald-600/15 transition-all shrink-0"
                data-testid={`button-share-${side}`}
              >
                <SiWhatsapp className="h-3.5 w-3.5 text-emerald-400" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Binary Tree */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.06s" }} data-testid="card-binary-tree">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="h-9 w-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
            <GitBranch className="h-4 w-4 text-blue-400" />
          </div>
          <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
            <span className="gradient-text">Binary Tree</span>
          </h2>
        </div>

        <div className="flex flex-col items-center gap-4">
          {/* Me */}
          <div className="rounded-xl px-5 py-3 bg-gradient-to-br from-amber-500/20 to-yellow-400/10 border border-amber-500/30 text-center w-full max-w-[180px]" data-testid="card-self-node">
            <div className="h-8 w-8 mx-auto rounded-lg bg-amber-500/20 flex items-center justify-center mb-1.5">
              <User className="h-4 w-4 text-yellow-300" />
            </div>
            <p className="text-xs font-semibold text-yellow-300">You</p>
            <p className="text-[9px] font-mono text-muted-foreground">{shortenAddress(account)}</p>
          </div>

          {/* Connector line */}
          <div className="w-px h-4 bg-white/[0.08]" />

          {/* Children */}
          <div className="grid grid-cols-2 gap-4 w-full">
            <TreeNode address={userInfo.leftChild} label="Left Child" color="border-blue-500/30" />
            <TreeNode address={userInfo.rightChild} label="Right Child" color="border-purple-500/30" />
          </div>

          <div className="grid grid-cols-2 gap-4 w-full text-center">
            <p className="text-[10px] text-muted-foreground">{leftCount} total below</p>
            <p className="text-[10px] text-muted-foreground">{rightCount} total below</p>
          </div>
        </div>
      </div>

      {/* Direct Referrals List */}
      <div className="glass-card rounded-2xl overflow-hidden slide-in" style={{ animationDelay: "0.07s" }} data-testid="card-direct-referrals">
        <div className="p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
                <span className="gradient-text">Direct Referrals</span>
              </h2>
              <p className="text-[10px] text-muted-foreground">{total} total direct{total !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-yellow-300" />
          </div>
        ) : referrals.length === 0 ? (
          <div className="text-center py-10">
            <Users className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No direct referrals yet</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Share your referral links above to invite people</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {referrals.map((addr, idx) => (
              <div key={addr} className="flex items-center justify-between px-5 py-3" data-testid={`row-referral-${idx}`}>
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-lg bg-white/[0.04] flex items-center justify-center">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs font-mono" data-testid={`text-referral-address-${idx}`}>{addr}</p>
                    <p className="text-[9px] text-muted-foreground">Direct referral</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400">
                  #{idx + 1 + (currentPage - 1) * ITEMS_PER_PAGE}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {!loading && total > ITEMS_PER_PAGE && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
            <p className="text-[11px] text-muted-foreground">Page {currentPage} of {totalPages}</p>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} data-testid="button-prev-referrals">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} data-testid="button-next-referrals">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
