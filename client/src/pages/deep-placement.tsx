import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { Loader2, CheckCircle, Copy, ChevronRight, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getContract, shortenAddress } from "@/lib/contract";
import type { UserInfo } from "@/hooks/use-web3";

interface TreeNode {
  address: string;
  userId: string;
  displayName: string;
  leftChild: string;
  rightChild: string;
  userPackage: number;
  hasLeftSlot: boolean;
  hasRightSlot: boolean;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const PKG_NAMES = ["None", "Starter", "Basic", "Standard", "Premium", "VIP"];

interface DeepPlacementPageProps {
  userInfo: UserInfo;
  account: string;
}

export default function DeepPlacementPage({ userInfo, account }: DeepPlacementPageProps) {
  const [side, setSide] = useState<"left" | "right">("left");
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [placement, setPlacement] = useState<"left" | "right">("left");
  const [link, setLink] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [linkTimer, setLinkTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const loadTree = useCallback(async (rootAddr: string, _side: string) => {
    if (!rootAddr || rootAddr === ZERO_ADDRESS) {
      setTree([]);
      return;
    }
    setLoading(true);
    setTree([]);
    setSelected(null);
    try {
      const prov = new ethers.BrowserProvider((window as any).ethereum);
      const con = getContract(prov);
      const queue = [rootAddr];
      const result: TreeNode[] = [];

      while (queue.length > 0 && result.length < 200) {
        const addr = queue.shift()!;
        if (!addr || addr === ZERO_ADDRESS) continue;
        try {
          const info = await con.getUserInfo(addr);
          let name = shortenAddress(addr);
          try {
            const pr = await con.getProfile(addr);
            if (pr[4] && pr[0]) name = pr[0];
          } catch {}

          const node: TreeNode = {
            address: addr,
            userId: info[0].toString(),
            displayName: name,
            leftChild: info[3],
            rightChild: info[4],
            userPackage: Number(info[6]),
            hasLeftSlot: info[3] === ZERO_ADDRESS,
            hasRightSlot: info[4] === ZERO_ADDRESS,
          };
          result.push(node);

          if (info[3] && info[3] !== ZERO_ADDRESS) queue.push(info[3]);
          if (info[4] && info[4] !== ZERO_ADDRESS) queue.push(info[4]);
        } catch (err) {
          console.error("Error loading node:", addr, err);
        }
      }
      setTree(result);
    } catch (err) {
      console.error("Tree load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userInfo) return;
    const child = side === "left" ? userInfo.leftChild : userInfo.rightChild;
    loadTree(child, side);
  }, [side, userInfo, loadTree]);

  const genLink = () => {
    if (!selected) return;
    const newLink = `${window.location.origin}?ref=${userInfo.userId}&parent=${selected.userId}&side=${placement}`;
    setLink(newLink);
    setShowLink(true);
    navigator.clipboard.writeText(newLink);
    if (linkTimer) clearTimeout(linkTimer);
    const timer = setTimeout(() => {
      setShowLink(false);
      setLink("");
    }, 15000);
    setLinkTimer(timer);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      <div className="slide-in">
        <h1 className="text-2xl font-bold" data-testid="text-dp-title" style={{ fontFamily: "var(--font-display)" }}>
          <span className="gradient-text">Deep Placement</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Create custom referral links to place new members deep in your tree</p>
      </div>

      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.05s" }}>
        <p className="text-sm font-medium mb-3">Select Tree Side</p>
        <div className="flex gap-2">
          <Button variant={side === "left" ? "default" : "outline"} onClick={() => setSide("left")} data-testid="button-dp-left-tree">
            Left Tree
          </Button>
          <Button variant={side === "right" ? "default" : "outline"} onClick={() => setSide("right")} data-testid="button-dp-right-tree">
            Right Tree
          </Button>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.1s" }}>
        <p className="text-sm font-medium mb-3">Select a Node for Placement</p>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
          </div>
        ) : tree.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No nodes found on the {side} side</p>
            <p className="text-xs text-muted-foreground/60 mt-1">This side of your tree is empty — new members can be placed directly here</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {tree.map((node) => {
              const isSelected = selected?.address === node.address;
              const hasSlots = node.hasLeftSlot || node.hasRightSlot;
              return (
                <button
                  key={node.address}
                  onClick={() => hasSlots ? setSelected(node) : null}
                  disabled={!hasSlots}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    isSelected
                      ? "border-purple-500/50 bg-purple-500/10"
                      : hasSlots
                        ? "border-white/[0.06] bg-white/[0.02] hover:border-purple-500/20"
                        : "border-white/[0.04] bg-white/[0.01] opacity-50"
                  }`}
                  data-testid={`button-dp-node-${node.userId}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold ${isSelected ? "bg-purple-500/20 text-purple-400" : "bg-white/[0.05] text-muted-foreground"}`}>
                        {node.userId}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{node.displayName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {PKG_NAMES[node.userPackage] || "Unknown"} • ID: {node.userId}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {node.hasLeftSlot && (
                        <Badge variant="outline" className="text-[9px] border-emerald-500/20 text-emerald-400">L Open</Badge>
                      )}
                      {node.hasRightSlot && (
                        <Badge variant="outline" className="text-[9px] border-cyan-500/20 text-cyan-400">R Open</Badge>
                      )}
                      {!hasSlots && (
                        <Badge variant="outline" className="text-[9px] border-muted-foreground/20 text-muted-foreground">Full</Badge>
                      )}
                      {isSelected && <CheckCircle className="h-4 w-4 text-purple-400" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.15s" }}>
          <p className="text-sm font-medium mb-3">Placement Options</p>
          <div className="flex items-center gap-3 mb-4">
            <p className="text-xs text-muted-foreground">Place under <span className="font-bold text-foreground">{selected.displayName}</span> (ID: {selected.userId})</p>
          </div>
          <div className="flex gap-2 mb-4">
            <Button
              variant={placement === "left" ? "default" : "outline"}
              size="sm"
              onClick={() => setPlacement("left")}
              disabled={!selected.hasLeftSlot}
              data-testid="button-dp-place-left"
            >
              Left
            </Button>
            <Button
              variant={placement === "right" ? "default" : "outline"}
              size="sm"
              onClick={() => setPlacement("right")}
              disabled={!selected.hasRightSlot}
              data-testid="button-dp-place-right"
            >
              Right
            </Button>
          </div>
          <Button
            onClick={genLink}
            disabled={(placement === "left" && !selected.hasLeftSlot) || (placement === "right" && !selected.hasRightSlot)}
            className="w-full"
            data-testid="button-dp-generate"
          >
            Generate Deep Placement Link
          </Button>

          {showLink && link && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Link2 className="h-4 w-4 text-emerald-400" />
                <p className="text-xs font-medium text-emerald-400">Link Generated & Copied!</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground break-all flex-1">{link}</p>
                <button
                  onClick={() => navigator.clipboard.writeText(link)}
                  className="shrink-0 p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] transition-colors"
                >
                  <Copy className="h-3.5 w-3.5 text-emerald-400" />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-2">This link expires in 15 seconds</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
