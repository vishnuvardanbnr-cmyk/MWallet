import { useState, useEffect, useCallback } from "react";
import { Users, GitBranch, Loader2, ChevronLeft, ChevronRight, User, Copy, Share2, Check, ArrowUp } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { shortenAddress, PACKAGE_NAMES } from "@/lib/contract";
import type { UserInfo, BinaryInfo } from "@/hooks/use-web3";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, MLM_ABI } from "@/lib/contract";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const PKG_COLORS: Record<number, { text: string; bg: string; border: string }> = {
  1: { text: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20" },
  2: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  3: { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  4: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  5: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
};

interface TeamProps {
  userInfo: UserInfo;
  binaryInfo: BinaryInfo;
  formatAmount: (val: bigint) => string;
  getDirectReferrals: (offset: number, limit: number) => Promise<{ referrals: string[]; total: number }>;
  account: string;
}

function TreeNode({ address, label, color, packageLevel, onClick }: { address: string; label: string; color: string; packageLevel?: number; onClick?: () => void }) {
  const isEmpty = !address || address === ZERO_ADDRESS;
  const pkgName = packageLevel !== undefined ? (PACKAGE_NAMES[packageLevel] || "None") : null;
  const pkgColor = packageLevel !== undefined ? (PKG_COLORS[packageLevel] || { text: "text-muted-foreground", border: "border-white/[0.08]" }) : null;
  return (
    <div
      className={`rounded-xl p-4 w-full text-center transition-all ${isEmpty ? "bg-white/[0.02] border border-dashed border-white/[0.08]" : `glass-card border ${color} ${onClick ? "cursor-pointer hover:scale-[1.02] active:scale-[0.98]" : ""}`}`}
      onClick={!isEmpty && onClick ? onClick : undefined}
      data-testid={`card-tree-${label.toLowerCase()}`}
    >
      <div className={`h-8 w-8 mx-auto rounded-lg flex items-center justify-center mb-2 ${isEmpty ? "bg-white/[0.03]" : color.replace("border-", "bg-").replace("/10", "/15")}`}>
        <User className={`h-4 w-4 ${isEmpty ? "text-muted-foreground/40" : color.replace("border-", "text-").replace("/10", "")}`} />
      </div>
      <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
      {isEmpty ? (
        <p className="text-xs text-muted-foreground/50">Empty slot</p>
      ) : (
        <>
          <p className="text-xs font-mono gradient-text" data-testid={`text-tree-${label.toLowerCase()}-address`}>
            {shortenAddress(address)}
          </p>
          {pkgName && (
            <Badge variant="outline" className={`text-[10px] mt-1.5 ${pkgColor?.text} ${pkgColor?.border}`}>
              {pkgName}
            </Badge>
          )}
        </>
      )}
    </div>
  );
}

interface TreeViewNode {
  address: string;
  leftChild: string;
  rightChild: string;
  packageLevel: number;
  userId: bigint;
}

export default function Team({ userInfo, binaryInfo, formatAmount, getDirectReferrals, account }: TeamProps) {
  const [referrals, setReferrals] = useState<string[]>([]);
  const [referralPackages, setReferralPackages] = useState<Record<string, number>>({});
  const [childPackages, setChildPackages] = useState<Record<string, number>>({});
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [copiedSide, setCopiedSide] = useState<string | null>(null);
  const [treeNode, setTreeNode] = useState<TreeViewNode | null>(null);
  const [treeChildPkgs, setTreeChildPkgs] = useState<Record<string, number>>({});
  const [treeHistory, setTreeHistory] = useState<string[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const PAGE_SIZE = 10;

  const fetchNodeInfo = useCallback(async (addr: string): Promise<TreeViewNode | null> => {
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, MLM_ABI, provider);
      const info = await contract.getUserInfo(addr);
      return {
        address: addr,
        leftChild: info[3],
        rightChild: info[4],
        packageLevel: Number(info[6]),
        userId: info[0],
      };
    } catch {
      return null;
    }
  }, []);

  const navigateToNode = useCallback(async (addr: string, pushHistory: boolean = true) => {
    if (!addr || addr === ZERO_ADDRESS) return;
    setTreeLoading(true);
    const node = await fetchNodeInfo(addr);
    if (node) {
      if (pushHistory && treeNode) {
        setTreeHistory(prev => [...prev, treeNode.address]);
      }
      setTreeNode(node);
      const children = [node.leftChild, node.rightChild].filter(a => a && a !== ZERO_ADDRESS);
      if (children.length > 0) {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, MLM_ABI, provider);
        const pkgs: Record<string, number> = {};
        for (const child of children) {
          try {
            const childInfo = await contract.getUserInfo(child);
            pkgs[child] = Number(childInfo[6]);
          } catch {}
        }
        setTreeChildPkgs(pkgs);
      } else {
        setTreeChildPkgs({});
      }
    }
    setTreeLoading(false);
  }, [fetchNodeInfo, treeNode]);

  const navigateUp = useCallback(() => {
    if (treeHistory.length === 0) {
      setTreeNode(null);
      setTreeChildPkgs({});
      setTreeHistory([]);
      return;
    }
    const prev = treeHistory[treeHistory.length - 1];
    setTreeHistory(h => h.slice(0, -1));
    navigateToNode(prev, false);
  }, [treeHistory, navigateToNode]);
  const totalPages = Math.ceil(totalReferrals / PAGE_SIZE);

  useEffect(() => {
    const children = [userInfo.leftChild, userInfo.rightChild].filter(a => a && a !== ZERO_ADDRESS);
    if (children.length === 0) return;
    (async () => {
      try {
        if (!(window as any).ethereum) return;
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, MLM_ABI, provider);
        const pkgMap: Record<string, number> = {};
        await Promise.all(children.map(async (addr) => {
          try {
            const info = await contract.getUserInfo(addr);
            pkgMap[addr] = Number(info[6]);
          } catch {}
        }));
        setChildPackages(pkgMap);
      } catch {}
    })();
  }, [userInfo.leftChild, userInfo.rightChild]);

  const fetchReferralPackages = useCallback(async (addresses: string[]) => {
    try {
      if (!(window as any).ethereum) return;
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, MLM_ABI, provider);
      const pkgMap: Record<string, number> = {};
      await Promise.all(addresses.map(async (addr) => {
        try {
          const info = await contract.getUserInfo(addr);
          pkgMap[addr] = Number(info[6]);
        } catch {}
      }));
      setReferralPackages(prev => ({ ...prev, ...pkgMap }));
    } catch {}
  }, []);

  const loadReferrals = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const result = await getDirectReferrals(page * PAGE_SIZE, PAGE_SIZE);
      setReferrals(result.referrals);
      setTotalReferrals(result.total);
      setCurrentPage(page);
      fetchReferralPackages(result.referrals);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [getDirectReferrals, fetchReferralPackages]);

  useEffect(() => {
    loadReferrals(0);
  }, [loadReferrals]);

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      <div className="slide-in">
        <h1 className="text-2xl font-bold" data-testid="text-team-title" style={{ fontFamily: 'var(--font-display)' }}>
          <span className="gradient-text">Team & Network</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Your binary tree structure and direct referrals</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="glass-card rounded-2xl p-4 slide-in" style={{ animationDelay: '0.05s' }}>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Direct Referrals</p>
          <p className="text-2xl font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }}>{userInfo.directReferralCount.toString()}</p>
        </div>
        <div className="glass-card rounded-2xl p-4 slide-in" style={{ animationDelay: '0.1s' }}>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Left Business</p>
          <p className="text-2xl font-bold text-amber-400" data-testid="text-team-left-business" style={{ fontFamily: 'var(--font-display)' }}>${formatAmount(binaryInfo.leftBusiness)}</p>
        </div>
        <div className="glass-card rounded-2xl p-4 slide-in" style={{ animationDelay: '0.15s' }}>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Right Business</p>
          <p className="text-2xl font-bold text-cyan-400" data-testid="text-team-right-business" style={{ fontFamily: 'var(--font-display)' }}>${formatAmount(binaryInfo.rightBusiness)}</p>
        </div>
        <div className="glass-card rounded-2xl p-4 slide-in" style={{ animationDelay: '0.2s' }}>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Today's Binary</p>
          <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>${formatAmount(binaryInfo.todayBinaryIncome)}</p>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: '0.22s' }} data-testid="card-referral-links">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <Share2 className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="gradient-text">Referral Links</span>
            </h2>
            <p className="text-xs text-muted-foreground">Share your links to grow your left and right teams</p>
          </div>
        </div>
        <div className="space-y-3">
          {(["left", "right"] as const).map((side) => {
            const link = `${window.location.origin}?ref=${userInfo.userId.toString()}&side=${side}`;
            const isCopied = copiedSide === side;
            const isLeft = side === "left";
            const whatsappMsg = encodeURIComponent(`Join MVault with my ${side} team referral link:\n${link}`);
            return (
              <div key={side} className={`rounded-xl p-3 ${isLeft ? "bg-amber-500/[0.04] border border-amber-500/10" : "bg-cyan-500/[0.04] border border-cyan-500/10"}`} data-testid={`card-referral-${side}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-xs font-bold uppercase tracking-wider ${isLeft ? "text-amber-400" : "text-cyan-400"}`}>{side} Team Link</p>
                </div>
                <div className="flex items-center gap-1.5 bg-black/20 rounded-lg px-3 py-2 mb-2">
                  <p className="text-[11px] font-mono text-muted-foreground truncate flex-1" data-testid={`text-referral-link-${side}`}>{link}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className={`flex-1 text-[11px] ${isLeft ? "border-amber-500/20 hover:bg-amber-500/10" : "border-cyan-500/20 hover:bg-cyan-500/10"}`}
                    onClick={() => {
                      navigator.clipboard.writeText(link);
                      setCopiedSide(side);
                      setTimeout(() => setCopiedSide(null), 2000);
                    }}
                    data-testid={`button-copy-${side}-link`}
                  >
                    {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {isCopied ? "Copied!" : "Copy Link"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-[11px] border-emerald-500/20 hover:bg-emerald-500/10 text-emerald-400"
                    onClick={() => window.open(`https://wa.me/?text=${whatsappMsg}`, '_blank')}
                    data-testid={`button-whatsapp-${side}`}
                  >
                    <SiWhatsapp className="w-3.5 h-3.5" />
                    WhatsApp
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6 slide-in" style={{ animationDelay: '0.25s' }} data-testid="card-binary-tree">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
              <GitBranch className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                <span className="gradient-text">Binary Tree</span>
              </h2>
              <p className="text-xs text-muted-foreground">{treeNode ? "Viewing downline" : "Your placement structure"}</p>
            </div>
          </div>
          {treeNode && (
            <Button variant="outline" size="sm" onClick={navigateUp} className="border-purple-500/20 text-xs" data-testid="button-tree-back">
              <ArrowUp className="h-3 w-3 mr-1" /> Back
            </Button>
          )}
        </div>

        {treeLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="glass-card rounded-xl p-4 w-44 text-center neon-border mb-2" data-testid="card-tree-current">
              <div className="h-10 w-10 mx-auto rounded-xl bg-purple-500/15 flex items-center justify-center mb-2">
                <User className="h-5 w-5 text-purple-400" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">{treeNode ? "Viewing" : "You"}</p>
              <p className="text-xs font-mono gradient-text" data-testid="text-tree-current-address">{shortenAddress(treeNode ? treeNode.address : account)}</p>
              <Badge variant="outline" className="text-[10px] mt-1.5 border-purple-500/30">
                ID: {(treeNode ? treeNode.userId : userInfo.userId).toString()}
              </Badge>
              {treeNode && (
                <Badge variant="outline" className={`text-[10px] mt-1 ${(PKG_COLORS[treeNode.packageLevel] || {}).text || ""} ${(PKG_COLORS[treeNode.packageLevel] || {}).border || ""}`}>
                  {PACKAGE_NAMES[treeNode.packageLevel] || "None"}
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-center w-full max-w-xs relative h-8">
              <div className="absolute w-px h-4 top-0 bg-gradient-to-b from-purple-500/40 to-transparent left-1/2 -translate-x-1/2" />
              <div className="absolute top-4 left-1/4 right-1/4 h-px bg-gradient-to-r from-amber-500/30 via-purple-500/30 to-cyan-500/30" />
              <div className="absolute w-px h-4 bottom-0 bg-gradient-to-b from-transparent to-amber-500/30 left-1/4" />
              <div className="absolute w-px h-4 bottom-0 bg-gradient-to-b from-transparent to-cyan-500/30 right-1/4" />
            </div>

            <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
              {(() => {
                const currentLeft = treeNode ? treeNode.leftChild : userInfo.leftChild;
                const currentRight = treeNode ? treeNode.rightChild : userInfo.rightChild;
                const pkgs = treeNode ? treeChildPkgs : childPackages;
                return (
                  <>
                    <TreeNode
                      address={currentLeft}
                      label="Left"
                      color="border-amber-500/10"
                      packageLevel={pkgs[currentLeft]}
                      onClick={() => navigateToNode(currentLeft)}
                    />
                    <TreeNode
                      address={currentRight}
                      label="Right"
                      color="border-cyan-500/10"
                      packageLevel={pkgs[currentRight]}
                      onClick={() => navigateToNode(currentRight)}
                    />
                  </>
                );
              })()}
            </div>
            {treeNode && (
              <p className="text-[10px] text-muted-foreground mt-3">Tap a child node to navigate deeper</p>
            )}
          </div>
        )}

        <div className="h-px bg-gradient-to-r from-transparent via-purple-500/15 to-transparent my-5" />

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-xl bg-amber-500/[0.04] border border-amber-500/10 text-center">
            <p className="text-xs text-muted-foreground mb-1">Left Carry Forward</p>
            <p className="text-sm font-bold text-amber-400" style={{ fontFamily: 'var(--font-display)' }}>${formatAmount(binaryInfo.carryLeft)}</p>
          </div>
          <div className="p-3 rounded-xl bg-cyan-500/[0.04] border border-cyan-500/10 text-center">
            <p className="text-xs text-muted-foreground mb-1">Right Carry Forward</p>
            <p className="text-sm font-bold text-cyan-400" style={{ fontFamily: 'var(--font-display)' }}>${formatAmount(binaryInfo.carryRight)}</p>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6 slide-in" style={{ animationDelay: '0.3s' }} data-testid="card-direct-referrals-list">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-cyan-500/15 flex items-center justify-center">
              <Users className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                <span className="gradient-text">Direct Referrals</span>
              </h2>
              <p className="text-xs text-muted-foreground">{totalReferrals} total referrals</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
          </div>
        ) : referrals.length > 0 ? (
          <div className="space-y-2">
            {referrals.map((addr, index) => {
              const pkg = referralPackages[addr] || 0;
              const pkgName = PACKAGE_NAMES[pkg] || "None";
              const pkgColor = PKG_COLORS[pkg] || { text: "text-muted-foreground", bg: "bg-white/[0.05]", border: "border-white/[0.08]" };
              return (
                <div key={index} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]" data-testid={`row-referral-${index}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-purple-400">{currentPage * PAGE_SIZE + index + 1}</span>
                    </div>
                    <span className="font-mono text-sm gradient-text">{shortenAddress(addr)}</span>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${pkgColor.text} ${pkgColor.border}`} data-testid={`badge-referral-pkg-${index}`}>
                    {pkgName}
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10">
            <div className="h-12 w-12 mx-auto rounded-xl bg-white/[0.03] flex items-center justify-center mb-3">
              <Users className="h-6 w-6 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-no-referrals">No direct referrals yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Share your referral link to get started</p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-purple-500/10">
            <Button variant="outline" size="sm" onClick={() => loadReferrals(currentPage - 1)} disabled={currentPage === 0 || loading} className="border-purple-500/20" data-testid="button-prev-page">
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span className="text-xs text-muted-foreground" data-testid="text-page-info">Page {currentPage + 1} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => loadReferrals(currentPage + 1)} disabled={currentPage >= totalPages - 1 || loading} className="border-purple-500/20" data-testid="button-next-page">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
