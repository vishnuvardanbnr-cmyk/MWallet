import { useState } from "react";
import { ethers } from "ethers";
import { ShieldCheck, UserCheck, Loader2, CheckCircle, AlertCircle, Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getMvaultContract, decodeContractError, ADMIN_WALLET } from "@/lib/contract";

interface AdminPageProps {
  account: string;
}

export default function AdminPage({ account }: AdminPageProps) {
  const { toast } = useToast();

  // Ghost activation state
  const [targetAddress, setTargetAddress] = useState("");
  const [pkg, setPkg] = useState<1 | 2>(2);
  const [activating, setActivating] = useState(false);
  const [activateResult, setActivateResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Set manager state
  const [managerAddress, setManagerAddress] = useState("");
  const [settingManager, setSettingManager] = useState(false);
  const [managerResult, setManagerResult] = useState<{ success: boolean; msg: string } | null>(null);

  const isAdmin = account?.toLowerCase() === ADMIN_WALLET;

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-muted-foreground">Access restricted to admin wallet only.</p>
      </div>
    );
  }

  const handleGhostActivate = async () => {
    const addr = targetAddress.trim();
    if (!ethers.isAddress(addr)) {
      toast({ title: "Invalid address", description: "Enter a valid wallet address.", variant: "destructive" });
      return;
    }
    setActivating(true);
    setActivateResult(null);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = getMvaultContract(signer);
      const tx = await contract.adminActivate(addr, pkg, { gasLimit: 500_000n });
      await tx.wait();
      const pkgLabel = pkg === 1 ? "Starter ($55)" : "Pro ($130)";
      setActivateResult({ success: true, msg: `Ghost activated ${addr} as ${pkgLabel}` });
      toast({ title: "Ghost Activation Success", description: `${addr} is now active (${pkgLabel}, no USDT/MVT used).` });
      setTargetAddress("");
    } catch (e: any) {
      const msg = decodeContractError(e);
      setActivateResult({ success: false, msg });
      toast({ title: "Activation Failed", description: msg, variant: "destructive" });
    } finally {
      setActivating(false);
    }
  };

  const handleSetManager = async () => {
    const addr = managerAddress.trim();
    if (!ethers.isAddress(addr)) {
      toast({ title: "Invalid address", description: "Enter a valid wallet address.", variant: "destructive" });
      return;
    }
    setSettingManager(true);
    setManagerResult(null);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = getMvaultContract(signer);
      const tx = await contract.setManager(addr, { gasLimit: 100_000n });
      await tx.wait();
      setManagerResult({ success: true, msg: `Manager updated to ${addr}` });
      toast({ title: "Manager Updated", description: `New manager: ${addr}` });
      setManagerAddress("");
    } catch (e: any) {
      const msg = decodeContractError(e);
      setManagerResult({ success: false, msg });
      toast({ title: "Set Manager Failed", description: msg, variant: "destructive" });
    } finally {
      setSettingManager(false);
    }
  };

  const ResultBanner = ({ result }: { result: { success: boolean; msg: string } }) => (
    <div className={`rounded-lg border px-3 py-2 flex items-start gap-2 text-sm ${
      result.success
        ? "border-green-500/30 bg-green-500/5 text-green-400"
        : "border-red-500/30 bg-red-500/5 text-red-400"
    }`}>
      {result.success
        ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
      <span className="break-all">{result.msg}</span>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto space-y-6 py-6 px-4">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-6 h-6 text-amber-400" />
        <div>
          <h1 className="text-xl font-bold">Admin Panel</h1>
          <p className="text-xs text-muted-foreground">Restricted to deployer wallet</p>
        </div>
      </div>

      {/* Ghost Activation */}
      <Card className="border-white/[0.08] bg-white/[0.02]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-amber-400" />
            Ghost Activation
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Activates a registered user with no USDT deducted, no MVT minted, and no income paid to uplines.
            The user gets full earning capabilities going forward.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="target-address" className="text-xs text-muted-foreground uppercase tracking-wider">
              User Wallet Address
            </Label>
            <Input
              id="target-address"
              data-testid="input-admin-address"
              placeholder="0x..."
              value={targetAddress}
              onChange={e => setTargetAddress(e.target.value)}
              className="font-mono text-sm bg-white/[0.03] border-white/[0.08]"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Package</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                data-testid="btn-pkg-starter"
                onClick={() => setPkg(1)}
                className={`rounded-lg border p-3 text-left transition-all ${
                  pkg === 1
                    ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
                    : "border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:border-white/20"
                }`}
              >
                <div className="text-sm font-semibold">Starter</div>
                <div className="text-xs mt-0.5">$55 package · $165 cap</div>
              </button>
              <button
                data-testid="btn-pkg-pro"
                onClick={() => setPkg(2)}
                className={`rounded-lg border p-3 text-left transition-all ${
                  pkg === 2
                    ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
                    : "border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:border-white/20"
                }`}
              >
                <div className="text-sm font-semibold">Pro</div>
                <div className="text-xs mt-0.5">$130 package · $390 cap</div>
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/80 space-y-0.5">
            <div>✓ No USDT deducted from anyone</div>
            <div>✓ No MVT minted</div>
            <div>✓ No level/placement/rank income paid to uplines</div>
            <div>✓ User can earn from their own downline immediately</div>
          </div>

          {activateResult && <ResultBanner result={activateResult} />}

          <Button
            data-testid="button-ghost-activate"
            onClick={handleGhostActivate}
            disabled={activating || !targetAddress.trim()}
            className="w-full bg-amber-600 hover:bg-amber-500 text-black font-semibold"
          >
            {activating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Activating…</>
            ) : (
              <><UserCheck className="w-4 h-4" /> Ghost Activate</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Set Manager */}
      <Card className="border-white/[0.08] bg-white/[0.02]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4 text-purple-400" />
            Set Manager
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Transfers the manager role to a new wallet. The manager can call privileged functions like
            <span className="text-purple-300"> setUserRanks</span>. Only the contract owner can call this.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="manager-address" className="text-xs text-muted-foreground uppercase tracking-wider">
              New Manager Wallet
            </Label>
            <Input
              id="manager-address"
              data-testid="input-manager-address"
              placeholder="0x..."
              value={managerAddress}
              onChange={e => setManagerAddress(e.target.value)}
              className="font-mono text-sm bg-white/[0.03] border-white/[0.08]"
            />
          </div>

          {managerResult && <ResultBanner result={managerResult} />}

          <Button
            data-testid="button-set-manager"
            onClick={handleSetManager}
            disabled={settingManager || !managerAddress.trim()}
            className="w-full bg-purple-700 hover:bg-purple-600 text-white font-semibold"
          >
            {settingManager ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Setting Manager…</>
            ) : (
              <><Settings className="w-4 h-4" /> Set Manager</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
