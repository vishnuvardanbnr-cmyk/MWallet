import { useState, useRef } from "react";
import { ethers } from "ethers";
import { ShieldCheck, UserCheck, Loader2, CheckCircle, AlertCircle, Settings, Smartphone, Save, Upload, Link, Bitcoin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getMvaultContract, getContract, MVAULT_CONTRACT_ADDRESS, decodeContractError, ADMIN_WALLET } from "@/lib/contract";

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

  // Credit BTC Pool state
  const [btcCreditAddr, setBtcCreditAddr]     = useState("");
  const [btcCreditAmount, setBtcCreditAmount] = useState("");
  const [creditingBtc, setCreditingBtc]       = useState(false);
  const [btcCreditResult, setBtcCreditResult] = useState<{ success: boolean; msg: string } | null>(null);

  // MWallet download URL
  const [mwalletUrl, setMwalletUrl]           = useState("");
  const [mwalletType, setMwalletType]         = useState<"apk" | "playstore">("apk");
  const [savingMwallet, setSavingMwallet]     = useState(false);
  const [mwalletResult, setMwalletResult]     = useState<{ success: boolean; msg: string } | null>(null);
  const [uploadProgress, setUploadProgress]   = useState<number | null>(null);
  const [uploadedSize, setUploadedSize]       = useState<string | null>(null);
  const apkFileRef                            = useRef<HTMLInputElement>(null);

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
      toast({ title: "Ghost Activation Success", description: `${addr} is now active (${pkgLabel}, no USDT/MWT used).` });
      setTargetAddress("");
    } catch (e: any) {
      const msg = decodeContractError(e);
      setActivateResult({ success: false, msg });
      toast({ title: "Activation Failed", description: msg, variant: "destructive" });
    } finally {
      setActivating(false);
    }
  };

  const handleUploadApk = async (file: File) => {
    if (!file.name.endsWith(".apk")) {
      toast({ title: "Wrong file type", description: "Please select an .apk file.", variant: "destructive" });
      return;
    }
    setUploadProgress(0);
    setMwalletResult(null);
    setUploadedSize(null);
    const formData = new FormData();
    formData.append("apk", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/upload/apk?wallet=${encodeURIComponent(account)}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploadProgress(null);
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        const mb = (data.size / 1024 / 1024).toFixed(1);
        setUploadedSize(`${mb} MB`);
        setMwalletUrl(data.url);
        setMwalletResult({ success: true, msg: `APK uploaded (${mb} MB). Users will now see the Install button.` });
        toast({ title: "APK Uploaded!", description: `${mb} MB — download link is now live.` });
      } else {
        const msg = JSON.parse(xhr.responseText)?.message || "Upload failed";
        setMwalletResult({ success: false, msg });
        toast({ title: "Upload failed", description: msg, variant: "destructive" });
      }
    };
    xhr.onerror = () => {
      setUploadProgress(null);
      setMwalletResult({ success: false, msg: "Network error during upload" });
      toast({ title: "Upload failed", description: "Network error", variant: "destructive" });
    };
    xhr.send(formData);
  };

  const handleSaveMwalletUrl = async () => {
    if (!mwalletUrl.trim()) {
      toast({ title: "URL required", description: "Paste the APK or Play Store URL.", variant: "destructive" });
      return;
    }
    setSavingMwallet(true);
    setMwalletResult(null);
    try {
      const res = await fetch("/api/admin/settings/mwallet-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: account, url: mwalletUrl.trim(), linkType: mwalletType }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      setMwalletResult({ success: true, msg: "MWallet download URL saved." });
      toast({ title: "Saved!", description: "Users will now see the Install button with your link." });
    } catch (e: any) {
      setMwalletResult({ success: false, msg: e.message });
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingMwallet(false);
    }
  };

  const handleCreditBtcPool = async () => {
    const addr = btcCreditAddr.trim();
    if (!ethers.isAddress(addr)) {
      toast({ title: "Invalid address", description: "Enter a valid wallet address.", variant: "destructive" });
      return;
    }
    const parsed = parseFloat(btcCreditAmount);
    if (!parsed || parsed <= 0) {
      toast({ title: "Invalid amount", description: "Enter a positive USDT amount.", variant: "destructive" });
      return;
    }
    const amountWei = ethers.parseUnits(btcCreditAmount.trim(), 18);
    setCreditingBtc(true);
    setBtcCreditResult(null);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      // Step 1: Approve USDT from admin wallet to the MVault contract
      toast({ title: "Step 1/2: Approve USDT", description: "Approve USDT spend in MetaMask…" });
      const usdtContract = getContract(signer);
      const approveTx = await usdtContract.approve(MVAULT_CONTRACT_ADDRESS, amountWei, { gasLimit: 100_000n });
      await approveTx.wait();

      // Step 2: Credit the user's BTC pool (pulls USDT from admin into contract)
      toast({ title: "Step 2/2: Credit BTC Pool", description: "Confirm the credit transaction in MetaMask…" });
      const mvaultContract = getMvaultContract(signer);
      const tx = await mvaultContract.adminCreditBtcPool(addr, amountWei, { gasLimit: 500_000n });
      await tx.wait();

      setBtcCreditResult({ success: true, msg: `Deposited & credited $${btcCreditAmount} USDT to ${addr}'s BTC pool` });
      toast({ title: "BTC Pool Credited", description: `$${btcCreditAmount} USDT deposited and credited to ${addr}.` });
      setBtcCreditAddr("");
      setBtcCreditAmount("");
    } catch (e: any) {
      const msg = decodeContractError(e);
      setBtcCreditResult({ success: false, msg });
      toast({ title: "Credit Failed", description: msg, variant: "destructive" });
    } finally {
      setCreditingBtc(false);
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
            Activates a registered user with no USDT deducted, no MWT minted, and no income paid to uplines.
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
            <div>✓ No MWT minted</div>
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
      {/* Credit BTC Pool */}
      <Card className="border-white/[0.08] bg-white/[0.02]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bitcoin className="w-4 h-4 text-orange-400" />
            Credit BTC Pool
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Deposits real USDT from your admin wallet into the contract and credits it to the user's BTC pool.
            Two MetaMask confirmations: approve USDT, then credit.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="btc-credit-address" className="text-xs text-muted-foreground uppercase tracking-wider">
              User Wallet Address
            </Label>
            <Input
              id="btc-credit-address"
              data-testid="input-btc-credit-address"
              placeholder="0x..."
              value={btcCreditAddr}
              onChange={e => setBtcCreditAddr(e.target.value)}
              className="font-mono text-sm bg-white/[0.03] border-white/[0.08]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="btc-credit-amount" className="text-xs text-muted-foreground uppercase tracking-wider">
              Amount (USDT)
            </Label>
            <Input
              id="btc-credit-amount"
              data-testid="input-btc-credit-amount"
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 50"
              value={btcCreditAmount}
              onChange={e => setBtcCreditAmount(e.target.value)}
              className="text-sm bg-white/[0.03] border-white/[0.08]"
            />
          </div>

          <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-xs text-orange-300/80 space-y-0.5">
            <div>✓ Real USDT moves from your wallet → contract → user's BTC pool</div>
            <div>✓ User's btcPoolBalance and totalBtcEarned both increase</div>
            <div>✓ User can immediately use it for board entry</div>
          </div>

          {btcCreditResult && <ResultBanner result={btcCreditResult} />}

          <Button
            data-testid="button-credit-btc-pool"
            onClick={handleCreditBtcPool}
            disabled={creditingBtc || !btcCreditAddr.trim() || !btcCreditAmount.trim()}
            className="w-full bg-orange-700 hover:bg-orange-600 text-white font-semibold"
          >
            {creditingBtc ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Crediting…</>
            ) : (
              <><Bitcoin className="w-4 h-4" /> Credit BTC Pool</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* MWallet Download URL */}
      <Card className="border-white/[0.08] bg-white/[0.02]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-amber-400" />
            MWallet Download Link
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Set the download link users see when MWallet is not installed. Upload an APK directly or paste a Play Store / external URL.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-2">
            {(["apk", "playstore"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setMwalletType(t); setMwalletResult(null); setUploadProgress(null); }}
                className={`rounded-lg border p-2.5 text-xs font-semibold transition-all ${
                  mwalletType === t
                    ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
                    : "border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:border-white/20"
                }`}
              >
                {t === "apk" ? "📦 Upload APK" : "🟢 Play Store URL"}
              </button>
            ))}
          </div>

          {mwalletType === "apk" ? (
            <div className="space-y-3">
              {/* Hidden file input */}
              <input
                ref={apkFileRef}
                type="file"
                accept=".apk,application/vnd.android.package-archive"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadApk(f); e.target.value = ""; }}
              />

              {/* Upload button */}
              <button
                onClick={() => apkFileRef.current?.click()}
                disabled={uploadProgress !== null}
                data-testid="button-upload-apk"
                className="w-full flex items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 hover:bg-amber-500/10 transition-all p-5 disabled:opacity-50"
              >
                {uploadProgress !== null ? (
                  <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                ) : (
                  <Upload className="w-5 h-5 text-amber-400" />
                )}
                <div className="text-left">
                  <p className="text-sm font-semibold text-amber-300">
                    {uploadProgress !== null ? `Uploading… ${uploadProgress}%` : "Click to select APK file"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {uploadedSize ? `Last upload: ${uploadedSize}` : "Supports .apk up to 250 MB"}
                  </p>
                </div>
              </button>

              {/* Progress bar */}
              {uploadProgress !== null && (
                <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}

              {/* Current URL display if already uploaded */}
              {mwalletUrl && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/8 border border-emerald-500/20">
                  <Link className="h-3 w-3 text-emerald-400 shrink-0" />
                  <p className="text-[10px] font-mono text-emerald-400 truncate">{mwalletUrl}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Play Store URL</Label>
              <Input
                data-testid="input-mwallet-url"
                placeholder="https://play.google.com/store/apps/details?id=..."
                value={mwalletUrl}
                onChange={e => setMwalletUrl(e.target.value)}
                className="font-mono text-xs bg-white/[0.03] border-white/[0.08]"
              />
              <Button
                data-testid="button-save-mwallet-url"
                onClick={handleSaveMwalletUrl}
                disabled={savingMwallet || !mwalletUrl.trim()}
                className="w-full bg-amber-600 hover:bg-amber-500 text-black font-semibold"
              >
                {savingMwallet ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                ) : (
                  <><Save className="w-4 h-4" /> Save Play Store Link</>
                )}
              </Button>
            </div>
          )}

          {mwalletResult && <ResultBanner result={mwalletResult} />}
        </CardContent>
      </Card>
    </div>
  );
}
