import { useState, useEffect, useCallback, useRef } from "react";
import {
  Users, GitBranch, Loader2, ChevronLeft, ChevronRight,
  User, Copy, Check, ArrowDownLeft, ArrowDownRight, Layers,
  AlertCircle, Search, ArrowLeft, Home, UserPlus, BarChart2,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { shortenAddress, getMvaultContract } from "@/lib/contract";
import { useToast } from "@/hooks/use-toast";
import type { UserInfo } from "@/hooks/use-web3";
import { ethers } from "ethers";
import { useLocation } from "wouter";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ITEMS_PER_PAGE = 10;
const MAX_LEVEL_NODES = 200;
const MAX_LEVELS = 10;

interface TeamProps {
  userInfo: UserInfo;
  formatAmount: (val: bigint) => string;
  getDirectReferrals: (offset: number, limit: number) => Promise<{ referrals: string[]; total: number }>;
  account: string;
}

type Tab = "binary" | "levels" | "directs";

interface MemberMeta {
  userId: string;
  name: string;
}

interface BinaryNodeInfo {
  address: string;
  leftChild: string;
  rightChild: string;
  displayName: string;
  leftSubUsers: bigint;
  rightSubUsers: bigint;
}

interface TreeNodeProps {
  address: string;
  label: string;
  color: string;
  isLeft: boolean;
  meta?: MemberMeta;
  onDrillDown?: (addr: string) => void;
  loading?: boolean;
}

function TreeNode({ address, label, color, meta, onDrillDown, loading }: TreeNodeProps) {
  const isEmpty = !address || address === ZERO_ADDRESS;
  return (
    <button
      disabled={isEmpty || loading}
      onClick={() => !isEmpty && onDrillDown?.(address)}
      className={`rounded-xl p-4 w-full text-center transition-all group ${
        isEmpty
          ? "bg-white/[0.02] border border-dashed border-white/[0.08] cursor-default"
          : `glass-card border ${color} hover:opacity-80 active:scale-[0.98] cursor-pointer`
      }`}
      data-testid={`card-tree-${label.toLowerCase().replace(" ", "-")}`}
    >
      <div className={`h-8 w-8 mx-auto rounded-lg flex items-center justify-center mb-2 ${isEmpty ? "bg-white/[0.03]" : "bg-white/[0.06]"}`}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
        ) : (
          <User className={`h-4 w-4 ${isEmpty ? "text-muted-foreground/40" : "text-foreground"}`} />
        )}
      </div>
      <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
      {isEmpty ? (
        <p className="text-xs text-muted-foreground/50">Empty slot</p>
      ) : meta ? (
        <>
          <p className="text-xs font-semibold text-foreground truncate">{meta.name || shortenAddress(address)}</p>
          <p className="text-[9px] text-muted-foreground/60">ID #{meta.userId}</p>
          <p className="text-[9px] text-muted-foreground/50 mt-0.5 group-hover:text-amber-400/60 transition-colors">tap to expand</p>
        </>
      ) : (
        <>
          <p className="text-xs font-mono gradient-text">{shortenAddress(address)}</p>
          <p className="text-[9px] text-muted-foreground/50 mt-1 group-hover:text-amber-400/60 transition-colors">tap to expand</p>
        </>
      )}
    </button>
  );
}

export default function TeamPage({ userInfo, formatAmount, getDirectReferrals, account }: TeamProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // ── tabs ────────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>("binary");

  // ── copy ────────────────────────────────────────────────────────────────────
  const [copiedSide, setCopiedSide] = useState<"left" | "right" | null>(null);

  // ── directs ─────────────────────────────────────────────────────────────────
  const [referrals,    setReferrals]    = useState<string[]>([]);
  const [total,        setTotal]        = useState(0);
  const [loadingDirec, setLoadingDirec] = useState(false);
  const [currentPage,  setCurrentPage]  = useState(1);

  // ── level tree ──────────────────────────────────────────────────────────────
  const [selectedLevel,  setSelectedLevel]  = useState(1);
  const [levelMembers,   setLevelMembers]   = useState<string[]>([]);
  const [levelLoading,   setLevelLoading]   = useState(false);
  const [levelLoaded,    setLevelLoaded]    = useState<number | null>(null);
  const [levelLevelPage, setLevelLevelPage] = useState(1);
  const LEVEL_PER_PAGE = 20;

  // ── member meta cache ───────────────────────────────────────────────────────
  const memberMetaCache = useRef<Map<string, MemberMeta>>(new Map());
  const [metaVersion, setMetaVersion] = useState(0); // bump to force re-render

  const fetchMembersMeta = useCallback(async (addresses: string[]) => {
    const toFetch = addresses.filter(a => a && a !== ZERO_ADDRESS && !memberMetaCache.current.has(a));
    if (toFetch.length === 0) return;
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const contract = getMvaultContract(provider);
      await Promise.all(toFetch.map(async (addr) => {
        try {
          const [info, profile] = await Promise.all([
            contract.getUserInfo(addr),
            contract.getProfile(addr),
          ]);
          memberMetaCache.current.set(addr, {
            userId: String(info[0] ?? "?"),
            name: profile[0] || profile.displayName || "",
          });
        } catch {
          memberMetaCache.current.set(addr, { userId: "?", name: "" });
        }
      }));
      setMetaVersion(v => v + 1);
    } catch {}
  }, []);

  // ── Binary drill-down ───────────────────────────────────────────────────────
  const [viewStack, setViewStack] = useState<BinaryNodeInfo[]>([]);
  const [drillLoading, setDrillLoading] = useState<"left" | "right" | null>(null);

  const loadNodeInfo = useCallback(async (addr: string): Promise<BinaryNodeInfo | null> => {
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const contract = getMvaultContract(provider);
      const info = await contract.getUserInfo(addr);
      return {
        address: addr,
        leftChild: info[6] ?? ZERO_ADDRESS,
        rightChild: info[7] ?? ZERO_ADDRESS,
        displayName: info.displayName ?? "",
        leftSubUsers: info[8] ?? 0n,
        rightSubUsers: info[9] ?? 0n,
      };
    } catch { return null; }
  }, []);

  // Initialise binary view with the logged-in user's info
  useEffect(() => {
    if (tab !== "binary" || viewStack.length > 0) return;
    const root: BinaryNodeInfo = {
      address: account,
      leftChild: userInfo.leftChild,
      rightChild: userInfo.rightChild,
      displayName: "",
      leftSubUsers: userInfo.leftSubUsers,
      rightSubUsers: userInfo.rightSubUsers,
    };
    setViewStack([root]);
  }, [tab, account, userInfo, viewStack.length]);

  // Fetch meta for current binary node's children
  useEffect(() => {
    if (!viewStack.length) return;
    const node = viewStack[viewStack.length - 1];
    fetchMembersMeta([node.leftChild, node.rightChild]);
  }, [viewStack, fetchMembersMeta]);

  const handleDrillDown = useCallback(async (addr: string, side: "left" | "right") => {
    setDrillLoading(side);
    const nodeInfo = await loadNodeInfo(addr);
    setDrillLoading(null);
    if (nodeInfo) setViewStack(prev => [...prev, nodeInfo]);
  }, [loadNodeInfo]);

  const handleBack = useCallback(() => {
    setViewStack(prev => prev.slice(0, -1));
  }, []);

  const currentNode = viewStack[viewStack.length - 1] ?? null;
  const isAtRoot = viewStack.length <= 1;

  // ── Fetch meta when level members change ─────────────────────────────────────
  useEffect(() => {
    if (levelMembers.length > 0) fetchMembersMeta(levelMembers);
  }, [levelMembers, fetchMembersMeta]);

  // ── Fetch meta when referrals change ────────────────────────────────────────
  useEffect(() => {
    if (referrals.length > 0) fetchMembersMeta(referrals);
  }, [referrals, fetchMembersMeta]);

  // ── BFS level traversal ─────────────────────────────────────────────────────
  const loadLevelMembers = async () => {
    if (!account) return;
    setLevelLoading(true);
    setLevelMembers([]);
    setLevelLevelPage(1);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const contract = getMvaultContract(provider);

      let currentDepth: string[] = [account];
      for (let d = 0; d < selectedLevel; d++) {
        if (currentDepth.length === 0) break;
        if (currentDepth.length > MAX_LEVEL_NODES) {
          toast({ title: "Level too large", description: `Too many nodes (>${MAX_LEVEL_NODES}). Showing partial results.`, variant: "destructive" });
          break;
        }
        const childResults = await Promise.all(
          currentDepth.map(async (addr) => {
            try {
              const info = await contract.getUserInfo(addr);
              const left:  string = info[6];
              const right: string = info[7];
              const children: string[] = [];
              if (left  && left  !== ZERO_ADDRESS) children.push(left);
              if (right && right !== ZERO_ADDRESS) children.push(right);
              return children;
            } catch { return []; }
          })
        );
        currentDepth = childResults.flat().slice(0, MAX_LEVEL_NODES);
      }
      setLevelMembers(currentDepth);
      setLevelLoaded(selectedLevel);
    } catch (e: any) {
      toast({ title: "Error loading level", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setLevelLoading(false);
    }
  };

  const loadReferrals = useCallback(async () => {
    setLoadingDirec(true);
    try {
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      const result = await getDirectReferrals(offset, ITEMS_PER_PAGE);
      setReferrals(result.referrals);
      setTotal(result.total);
    } catch {
      setReferrals([]);
    } finally {
      setLoadingDirec(false);
    }
  }, [getDirectReferrals, currentPage]);

  useEffect(() => {
    if (tab === "directs") loadReferrals();
  }, [loadReferrals, tab]);

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

  const totalPages   = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const levelPages   = Math.max(1, Math.ceil(levelMembers.length / LEVEL_PER_PAGE));
  const levelSlice   = levelMembers.slice((levelLevelPage - 1) * LEVEL_PER_PAGE, levelLevelPage * LEVEL_PER_PAGE);
  const leftCount    = Number(userInfo.leftSubUsers);
  const rightCount   = Number(userInfo.rightSubUsers);
  const directCount  = Number(userInfo.directCount);

  const getMeta = (addr: string) => memberMetaCache.current.get(addr);

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">

      {/* Header */}
      <div className="slide-in">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          <span className="gradient-text">My Team</span>
        </h1>
        <p className="text-sm text-muted-foreground">Your referral network and binary tree</p>
      </div>

      {/* Stats */}
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

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 slide-in" style={{ animationDelay: "0.045s" }}>
        <button
          onClick={() => setLocation("/deep-placement")}
          className="glass-card rounded-xl p-4 text-left hover:bg-white/[0.04] transition-all group"
          data-testid="button-quick-deep-placement"
        >
          <UserPlus className="h-5 w-5 text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
          <p className="text-sm font-semibold">Deep Placement</p>
          <p className="text-[10px] text-muted-foreground">Place a member in a specific tree position</p>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-amber-400/70">
            <span>Open</span><ChevronRight className="h-3 w-3" />
          </div>
        </button>
        <button
          onClick={() => setLocation("/binary")}
          className="glass-card rounded-xl p-4 text-left hover:bg-white/[0.04] transition-all group"
          data-testid="button-quick-binary-details"
        >
          <BarChart2 className="h-5 w-5 text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
          <p className="text-sm font-semibold">Binary Income</p>
          <p className="text-[10px] text-muted-foreground">View your binary pool & pair details</p>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-blue-400/70">
            <span>Open</span><ChevronRight className="h-3 w-3" />
          </div>
        </button>
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
              <button onClick={() => copyLink(side)}
                className={`p-2 rounded-xl transition-all shrink-0 ${copiedSide === side ? "bg-emerald-500/20 border border-emerald-500/30" : "bg-white/[0.04] border border-white/[0.06] hover:bg-amber-500/10"}`}
                data-testid={`button-copy-${side}`}>
                {copiedSide === side ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-amber-400" />}
              </button>
              <button onClick={() => shareWhatsApp(side)}
                className="p-2 rounded-xl bg-emerald-600/10 border border-emerald-600/20 hover:bg-emerald-600/15 transition-all shrink-0"
                data-testid={`button-share-${side}`}>
                <SiWhatsapp className="h-3.5 w-3.5 text-emerald-400" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] slide-in" style={{ animationDelay: "0.055s" }}>
        {([
          { id: "binary",  icon: GitBranch, label: "Binary Tree" },
          { id: "levels",  icon: Layers,    label: "Level View"  },
          { id: "directs", icon: Users,     label: "Directs"     },
        ] as const).map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all ${
              tab === id
                ? "bg-gradient-to-r from-amber-500/20 to-yellow-400/10 border border-amber-500/25 text-amber-300"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-${id}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ── Binary Tree tab ─────────────────────────────────────────────────── */}
      {tab === "binary" && currentNode && (
        <div className="glass-card rounded-2xl overflow-hidden slide-in" data-testid="card-binary-tree">
          {/* Header with back nav */}
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.05]">
            <div className="flex items-center gap-1 flex-1 overflow-hidden">
              <button
                onClick={() => setViewStack(prev => prev.slice(0, 1))}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-amber-400 transition-colors shrink-0"
                data-testid="button-binary-home"
              >
                <Home className="h-3 w-3" /> Root
              </button>
              {viewStack.slice(1).map((node, idx) => (
                <div key={node.address} className="flex items-center gap-1 overflow-hidden">
                  <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                  <button
                    onClick={() => setViewStack(prev => prev.slice(0, idx + 2))}
                    className={`text-[10px] truncate max-w-[80px] transition-colors ${idx === viewStack.length - 2 ? "text-amber-400 font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                    data-testid={`button-breadcrumb-${idx}`}
                  >
                    {getMeta(node.address)?.name || getMeta(node.address)?.userId && `#${getMeta(node.address)?.userId}` || shortenAddress(node.address)}
                  </button>
                </div>
              ))}
            </div>
            {!isAtRoot && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] shrink-0"
                data-testid="button-binary-back"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
            )}
          </div>

          <div className="p-5">
            <div className="flex flex-col items-center gap-4">
              {/* Current node */}
              <div className={`rounded-xl px-5 py-3 text-center w-full max-w-[220px] ${
                isAtRoot
                  ? "bg-gradient-to-br from-amber-500/20 to-yellow-400/10 border border-amber-500/30"
                  : "bg-gradient-to-br from-violet-500/20 to-blue-400/10 border border-violet-500/30"
              }`} data-testid="card-self-node">
                <div className={`h-8 w-8 mx-auto rounded-lg flex items-center justify-center mb-1.5 ${
                  isAtRoot ? "bg-amber-500/20" : "bg-violet-500/20"
                }`}>
                  <User className={`h-4 w-4 ${isAtRoot ? "text-yellow-300" : "text-violet-300"}`} />
                </div>
                {isAtRoot ? (
                  <>
                    <p className="text-xs font-semibold text-yellow-300">You</p>
                    <p className="text-[9px] font-mono text-muted-foreground mt-0.5">{shortenAddress(currentNode.address)}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-violet-300">
                      {getMeta(currentNode.address)?.name || shortenAddress(currentNode.address)}
                    </p>
                    {getMeta(currentNode.address)?.userId && (
                      <p className="text-[9px] text-violet-300/60">ID #{getMeta(currentNode.address)?.userId}</p>
                    )}
                  </>
                )}
                <div className="flex items-center justify-center gap-3 mt-1.5">
                  <span className="text-[9px] text-blue-400/70">{String(currentNode.leftSubUsers || 0n)} left</span>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-[9px] text-purple-400/70">{String(currentNode.rightSubUsers || 0n)} right</span>
                </div>
              </div>

              {/* Connector */}
              <div className="flex items-start w-full max-w-[300px] relative">
                <div className="absolute left-1/4 right-1/4 top-0 h-px bg-white/[0.08]" />
                <div className="absolute left-1/4 top-0 w-px h-3 bg-white/[0.08]" />
                <div className="absolute right-1/4 top-0 w-px h-3 bg-white/[0.08]" />
              </div>

              {/* Children */}
              <div className="grid grid-cols-2 gap-3 w-full">
                <TreeNode
                  address={currentNode.leftChild}
                  label="Left Child"
                  color="border-blue-500/30"
                  isLeft={true}
                  meta={getMeta(currentNode.leftChild)}
                  loading={drillLoading === "left"}
                  onDrillDown={(addr) => handleDrillDown(addr, "left")}
                />
                <TreeNode
                  address={currentNode.rightChild}
                  label="Right Child"
                  color="border-purple-500/30"
                  isLeft={false}
                  meta={getMeta(currentNode.rightChild)}
                  loading={drillLoading === "right"}
                  onDrillDown={(addr) => handleDrillDown(addr, "right")}
                />
              </div>

              {/* Depth indicator */}
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                <GitBranch className="h-3 w-3" />
                <span>Depth {viewStack.length - 1}</span>
                {(currentNode.leftChild === ZERO_ADDRESS && currentNode.rightChild === ZERO_ADDRESS) && (
                  <span className="text-amber-400/50">· Leaf node</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Level View tab ──────────────────────────────────────────────────── */}
      {tab === "levels" && (
        <div className="space-y-4 slide-in">
          <div className="glass-card rounded-2xl p-5" data-testid="card-level-selector">
            <h2 className="text-sm font-bold mb-1" style={{ fontFamily: "var(--font-display)" }}>
              <span className="gradient-text">Level View</span>
            </h2>
            <p className="text-xs text-muted-foreground mb-4">Select a level to see all team members at that depth.</p>

            {/* Level pills — only 10 levels */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {Array.from({ length: MAX_LEVELS }, (_, i) => i + 1).map((lvl) => (
                <button key={lvl} onClick={() => { setSelectedLevel(lvl); setLevelLoaded(null); }}
                  className={`h-8 w-8 rounded-lg text-xs font-bold transition-all ${
                    selectedLevel === lvl
                      ? "bg-gradient-to-br from-amber-500/30 to-yellow-400/20 border border-amber-400/40 text-amber-300"
                      : "bg-white/[0.03] border border-white/[0.06] text-muted-foreground hover:text-foreground hover:border-white/[0.12]"
                  }`}
                  data-testid={`button-level-${lvl}`}>
                  {lvl}
                </button>
              ))}
            </div>

            {selectedLevel > 8 && (
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/8 border border-amber-500/15 mb-4">
                <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-400/90">Level {selectedLevel} may have many slots — loading may take a moment.</p>
              </div>
            )}

            <button onClick={loadLevelMembers} disabled={levelLoading}
              className="w-full glow-button text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              data-testid="button-load-level">
              {levelLoading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading Level {selectedLevel}…</>
                : <><Search className="h-4 w-4" /> Load Level {selectedLevel}</>
              }
            </button>
          </div>

          {/* Level results */}
          {levelLoaded !== null && !levelLoading && (
            <div className="glass-card rounded-2xl overflow-hidden" data-testid="card-level-results">
              <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
                    Level <span className="gradient-text">{levelLoaded}</span> Members
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {levelMembers.length === 0 ? "No members at this level yet" : `${levelMembers.length} member${levelMembers.length !== 1 ? "s" : ""}${levelMembers.length >= MAX_LEVEL_NODES ? " (capped)" : ""}`}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                  Depth {levelLoaded}
                </Badge>
              </div>

              {levelMembers.length === 0 ? (
                <div className="text-center py-10">
                  <Layers className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No members at level {levelLoaded}</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">Your tree hasn't grown this deep yet</p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-white/[0.04]">
                    {levelSlice.map((addr, idx) => {
                      const globalIdx = (levelLevelPage - 1) * LEVEL_PER_PAGE + idx + 1;
                      const meta = getMeta(addr);
                      return (
                        <div key={addr} className="flex items-center justify-between px-5 py-3" data-testid={`row-level-member-${globalIdx}`}>
                          <div className="flex items-center gap-3">
                            <div className="h-7 w-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                              <User className="h-3.5 w-3.5 text-amber-400" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold" data-testid={`text-level-name-${globalIdx}`}>
                                {meta?.name || shortenAddress(addr)}
                              </p>
                              <p className="text-[9px] text-muted-foreground">
                                {meta?.userId ? `ID #${meta.userId} · ` : ""}{`Level ${levelLoaded} · #${globalIdx}`}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[9px] border-amber-500/20 text-amber-400/70 shrink-0">
                            #{globalIdx}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>

                  {levelMembers.length > LEVEL_PER_PAGE && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
                      <p className="text-[11px] text-muted-foreground">Page {levelLevelPage} of {levelPages}</p>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => setLevelLevelPage(p => Math.max(1, p - 1))}
                          disabled={levelLevelPage <= 1}
                          data-testid="button-prev-level">
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => setLevelLevelPage(p => Math.min(levelPages, p + 1))}
                          disabled={levelLevelPage >= levelPages}
                          data-testid="button-next-level">
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Directs tab ─────────────────────────────────────────────────────── */}
      {tab === "directs" && (
        <div className="glass-card rounded-2xl overflow-hidden slide-in" data-testid="card-direct-referrals">
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

          {loadingDirec ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-yellow-300" />
            </div>
          ) : referrals.length === 0 ? (
            <div className="text-center py-10">
              <Users className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No direct referrals yet</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">Share your referral links to invite people</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {referrals.map((addr, idx) => {
                const meta = getMeta(addr);
                return (
                  <div key={addr} className="flex items-center justify-between px-5 py-3" data-testid={`row-referral-${idx}`}>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500/15 to-yellow-400/5 border border-amber-500/20 flex items-center justify-center shrink-0">
                        {meta?.name ? (
                          <span className="text-[10px] font-bold text-amber-400">{meta.name[0].toUpperCase()}</span>
                        ) : (
                          <User className="h-3.5 w-3.5 text-amber-400/60" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold" data-testid={`text-referral-name-${idx}`}>
                          {meta?.name || shortenAddress(addr)}
                        </p>
                        <p className="text-[9px] text-muted-foreground">
                          {meta?.userId ? `ID #${meta.userId} · ` : ""}Direct referral
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400">
                      #{idx + 1 + (currentPage - 1) * ITEMS_PER_PAGE}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}

          {!loadingDirec && total > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
              <p className="text-[11px] text-muted-foreground">Page {currentPage} of {totalPages}</p>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  data-testid="button-prev-referrals">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  data-testid="button-next-referrals">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
