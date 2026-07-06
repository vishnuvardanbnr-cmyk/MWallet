import { useState, useRef, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { ShieldCheck, UserCheck, Loader2, CheckCircle, AlertCircle, Settings, Smartphone, Save, Upload, Link, Bitcoin, Package, Plus, Pencil, Trash2, X, ToggleLeft, ToggleRight, TrendingDown, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getMvaultContract, getContract, getTokenContract, getDirectProvider, MVAULT_CONTRACT_ADDRESS, decodeContractError, isAdminWallet } from "@/lib/contract";

interface AdminPageProps {
  account: string;
}

type Product = { id: string; name: string; description: string; price: number; image: string; category: string; inStock: boolean };

export default function AdminPage({ account }: AdminPageProps) {
  const { toast } = useToast();

  // Ghost activation state
  const [targetAddress, setTargetAddress] = useState("");
  const [pkg, setPkg] = useState<1 | 2>(2);
  const [activating, setActivating] = useState(false);
  const [activateResult, setActivateResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Set manager state
  const [managerAddress, setManagerAddress] = useState("0xe746140d043f65c0ea2f1774bcbfc222d70734bf");
  const [settingManager, setSettingManager] = useState(false);
  const [managerResult, setManagerResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Credit BTC Pool state
  const [btcCreditAddr, setBtcCreditAddr]     = useState("");
  const [btcCreditAmount, setBtcCreditAmount] = useState("");
  const [creditingBtc, setCreditingBtc]       = useState(false);
  const [btcCreditResult, setBtcCreditResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [usdtDepositAmount, setUsdtDepositAmount] = useState("");
  const [depositingUsdt, setDepositingUsdt]       = useState(false);
  const [usdtDepositResult, setUsdtDepositResult] = useState<{ success: boolean; msg: string } | null>(null);

  // MWallet download URL
  const [mwalletUrl, setMwalletUrl]           = useState("");
  const [mwalletType, setMwalletType]         = useState<"apk" | "playstore">("apk");
  const [savingMwallet, setSavingMwallet]     = useState(false);
  const [mwalletResult, setMwalletResult]     = useState<{ success: boolean; msg: string } | null>(null);
  const [uploadProgress, setUploadProgress]   = useState<number | null>(null);
  const [uploadedSize, setUploadedSize]       = useState<string | null>(null);
  const apkFileRef                            = useRef<HTMLInputElement>(null);

  // Admin USDT pool (real USDT from 10% sell fee)
  const [adminUsdtBalance, setAdminUsdtBalance] = useState<bigint>(0n);
  const [usdtWithdrawTo, setUsdtWithdrawTo]     = useState("");
  const [usdtWithdrawAmt, setUsdtWithdrawAmt]   = useState("");
  const [withdrawingUsdt, setWithdrawingUsdt]   = useState(false);
  const [usdtWithdrawResult, setUsdtWithdrawResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Skip board entry state
  const [skipBoardLevel, setSkipBoardLevel]   = useState("1");
  const [skipBoardIndex, setSkipBoardIndex]   = useState("");
  const [skippingBoard, setSkippingBoard]     = useState(false);
  const [skipBoardResult, setSkipBoardResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Link board handler state
  const [boardHandlerAddr, setBoardHandlerAddr]   = useState("0xa775d77b21915f32c7240cf613c51349e71f2c11");
  const [linkingBoard, setLinkingBoard]           = useState(false);
  const [linkBoardResult, setLinkBoardResult]     = useState<{ success: boolean; msg: string } | null>(null);

  // Claim admin pools state
  type PoolKey = "admin" | "community" | "reserve";
  const [poolBalances, setPoolBalances]         = useState<Record<PoolKey, bigint>>({ admin: 0n, community: 0n, reserve: 0n });
  const [poolsLoading, setPoolsLoading]         = useState(false);
  const [selectedPool, setSelectedPool]         = useState<PoolKey>("admin");
  const [claimAmount, setClaimAmount]           = useState("");
  const [claiming, setClaiming]                 = useState(false);
  const [claimResult, setClaimResult]           = useState<{ success: boolean; msg: string } | null>(null);

  // Admin Cash Out (sell from any pool → USDT direct to wallet)
  const [cashOutPool, setCashOutPool]           = useState<PoolKey>("admin");
  const [cashOutAmount, setCashOutAmount]       = useState("");
  const [cashOutRecipient, setCashOutRecipient] = useState("");
  const [cashingOut, setCashingOut]             = useState(false);
  const [cashOutResult, setCashOutResult]       = useState<{ success: boolean; msg: string } | null>(null);

  // Recover stuck MVT balance
  const [recoverUser, setRecoverUser]           = useState("");
  const [recoverAmount, setRecoverAmount]       = useState("");
  const [recovering, setRecovering]             = useState(false);
  const [recoverResult, setRecoverResult]       = useState<{ success: boolean; msg: string } | null>(null);

  // Product management state
  const [products, setProducts]               = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct]   = useState<Product | null>(null);
  const [savingProduct, setSavingProduct]     = useState(false);
  const [deletingId, setDeletingId]           = useState<string | null>(null);
  const [pName, setPName]                     = useState("");
  const [pDesc, setPDesc]                     = useState("");
  const [pPrice, setPPrice]                   = useState("");
  const [pImage, setPImage]                   = useState("");
  const [pCategory, setPCategory]             = useState("Hardware Wallet");
  const [pInStock, setPInStock]               = useState(true);

  const isAdmin = isAdminWallet(account);

  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const res = await fetch("/api/hardware/products");
      setProducts(await res.json());
    } catch { /* ignore */ } finally { setLoadingProducts(false); }
  };

  useEffect(() => { loadProducts(); }, []);

  const loadPoolBalances = useCallback(async () => {
    setPoolsLoading(true);
    try {
      const contract = getMvaultContract(getDirectProvider());
      const [a, c, r, u] = await Promise.all([
        contract.adminPool(),
        contract.communityPool(),
        contract.reservePool(),
        contract.adminUsdtPool(),
      ]);
      setPoolBalances({ admin: a, community: c, reserve: r });
      setAdminUsdtBalance(u);
    } catch { /* ignore */ } finally { setPoolsLoading(false); }
  }, []);

  useEffect(() => { loadPoolBalances(); }, [loadPoolBalances]);

  const handleLinkBoardHandler = async () => {
    const addr = boardHandlerAddr.trim();
    if (!ethers.isAddress(addr)) {
      toast({ title: "Invalid address", description: "Enter a valid board matrix contract address.", variant: "destructive" });
      return;
    }
    setLinkingBoard(true);
    setLinkBoardResult(null);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = getMvaultContract(signer);
      toast({ title: "Linking Board Matrix", description: "Confirm the transaction in MetaMask…" });
      const tx = await contract.setBoardHandler(addr, { gasLimit: 100_000n });
      await tx.wait();
      setLinkBoardResult({ success: true, msg: `Board handler set to ${addr}` });
      toast({ title: "Board Handler Linked", description: `New board matrix: ${addr.slice(0, 10)}…` });
    } catch (e: any) {
      const msg = decodeContractError(e);
      setLinkBoardResult({ success: false, msg });
      toast({ title: "Link Failed", description: msg, variant: "destructive" });
    } finally {
      setLinkingBoard(false);
    }
  };

  const handleSkipBoardEntry = async () => {
    const level = parseInt(skipBoardLevel);
    const index = parseInt(skipBoardIndex);
    if (!skipBoardIndex.trim() || isNaN(index) || index < 0 || isNaN(level) || level < 1 || level > 6) {
      toast({ title: "Invalid input", description: "Enter a valid pool level (1–6) and queue index.", variant: "destructive" });
      return;
    }
    setSkippingBoard(true);
    setSkipBoardResult(null);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const mvaultContract = getMvaultContract(signer);
      const boardHandlerAddr = await mvaultContract.boardHandler();
      if (!boardHandlerAddr || boardHandlerAddr === ethers.ZeroAddress) throw new Error("Board handler not set");
      const { ethers: eth } = await import("ethers");
      const boardAbi = ["function adminSkipEntry(uint256 _level, uint256 _index) external"];
      const boardContract = new eth.Contract(boardHandlerAddr, boardAbi, signer);
      toast({ title: "Skipping Board Entry", description: `Skipping Level ${level} index ${index} — confirm in MetaMask…` });
      const tx = await boardContract.adminSkipEntry(BigInt(level), BigInt(index), { gasLimit: 150_000n });
      await tx.wait();
      setSkipBoardResult({ success: true, msg: `Level ${level} index ${index} marked as skipped — no reward paid.` });
      toast({ title: "Entry Skipped", description: `Pool ${level} queue index ${index} removed.` });
      setSkipBoardIndex("");
    } catch (e: any) {
      const msg = decodeContractError(e);
      setSkipBoardResult({ success: false, msg });
      toast({ title: "Skip Failed", description: msg, variant: "destructive" });
    } finally {
      setSkippingBoard(false);
    }
  };

  const handleWithdrawAdminUsdt = async () => {
    const to = usdtWithdrawTo.trim() || account;
    if (!ethers.isAddress(to)) {
      toast({ title: "Invalid address", description: "Enter a valid wallet address.", variant: "destructive" });
      return;
    }
    const parsed = parseFloat(usdtWithdrawAmt);
    if (!parsed || parsed <= 0) {
      toast({ title: "Invalid amount", description: "Enter a positive USDT amount.", variant: "destructive" });
      return;
    }
    const amountWei = ethers.parseUnits(usdtWithdrawAmt.trim(), 18);
    if (amountWei > adminUsdtBalance) {
      toast({ title: "Exceeds balance", description: "Amount exceeds adminUsdtPool balance.", variant: "destructive" });
      return;
    }
    setWithdrawingUsdt(true);
    setUsdtWithdrawResult(null);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = getMvaultContract(signer);
      toast({ title: "Withdrawing Admin USDT", description: "Confirm the transaction in MetaMask…" });
      const tx = await contract.withdrawAdminUsdt(to, amountWei, { gasLimit: 150_000n });
      await tx.wait();
      setUsdtWithdrawResult({ success: true, msg: `$${parsed.toFixed(2)} USDT withdrawn to ${to}` });
      toast({ title: "Withdrawal Successful", description: `$${parsed.toFixed(2)} USDT sent to ${to}` });
      setUsdtWithdrawAmt("");
      loadPoolBalances();
    } catch (e: any) {
      const msg = decodeContractError(e);
      setUsdtWithdrawResult({ success: false, msg });
      toast({ title: "Withdrawal Failed", description: msg, variant: "destructive" });
    } finally {
      setWithdrawingUsdt(false);
    }
  };

  const handleClaimPool = async () => {
    const parsed = parseFloat(claimAmount);
    if (!parsed || parsed <= 0) {
      toast({ title: "Invalid amount", description: "Enter a positive MVT amount.", variant: "destructive" });
      return;
    }
    const amountWei = ethers.parseUnits(claimAmount.trim(), 18);
    setClaiming(true);
    setClaimResult(null);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = getMvaultContract(signer);
      toast({ title: "Claiming Pool", description: "Confirm the transaction in MetaMask…" });
      let tx;
      if (selectedPool === "admin")     tx = await contract.withdrawAdminPool(account, amountWei, { gasLimit: 200_000n });
      else if (selectedPool === "community") tx = await contract.withdrawCommunityPool(account, amountWei, { gasLimit: 200_000n });
      else                              tx = await contract.withdrawReservePool(account, amountWei, { gasLimit: 200_000n });
      await tx.wait();
      const label = selectedPool === "admin" ? "Admin" : selectedPool === "community" ? "Community" : "Reserve";
      setClaimResult({ success: true, msg: `${parsed.toLocaleString()} MVT from ${label} Pool credited to active user balance.` });
      toast({ title: "Pool Claimed", description: `${parsed.toLocaleString()} MVT added to balance.` });
      setClaimAmount("");
      loadPoolBalances();
    } catch (e: any) {
      const msg = decodeContractError(e);
      setClaimResult({ success: false, msg });
      toast({ title: "Claim Failed", description: msg, variant: "destructive" });
    } finally {
      setClaiming(false);
    }
  };

  const handleAdminCashOut = async () => {
    const parsed = parseFloat(cashOutAmount);
    if (!parsed || parsed <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    const recipient = cashOutRecipient.trim() || account;
    if (!ethers.isAddress(recipient)) { toast({ title: "Invalid recipient address", variant: "destructive" }); return; }
    const amountWei = ethers.parseUnits(cashOutAmount.trim(), 18);
    const poolTypeNum: Record<PoolKey, number> = { admin: 0, community: 1, reserve: 2 };
    const poolLabel = cashOutPool === "admin" ? "Admin" : cashOutPool === "community" ? "Community" : "Reserve";
    setCashingOut(true);
    setCashOutResult(null);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = getMvaultContract(signer);
      toast({ title: "Cashing Out", description: `Selling MVT from ${poolLabel} Pool → USDT sent directly to wallet…` });
      const tx = await contract.poolCashOut(poolTypeNum[cashOutPool], amountWei, recipient, { gasLimit: 350_000n });
      await tx.wait();
      setCashOutResult({ success: true, msg: `✓ ${parsed.toLocaleString()} MVT from ${poolLabel} Pool sold — USDT sent directly to ${recipient}` });
      toast({ title: "Cash Out Successful!", description: "USDT sent directly to the recipient wallet." });
      setCashOutAmount("");
      loadPoolBalances();
    } catch (e: any) {
      const msg = decodeContractError(e);
      setCashOutResult({ success: false, msg });
      toast({ title: "Cash Out Failed", description: msg, variant: "destructive" });
    } finally {
      setCashingOut(false);
    }
  };

  const handleRecoverMvtBalance = async () => {
    const parsed = parseFloat(recoverAmount);
    if (!parsed || parsed <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    if (!ethers.isAddress(recoverUser.trim())) { toast({ title: "Invalid user address", variant: "destructive" }); return; }
    const amountWei = ethers.parseUnits(recoverAmount.trim(), 18);
    setRecovering(true);
    setRecoverResult(null);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = getMvaultContract(signer);
      toast({ title: "Recovering MVT", description: "Moving user's mvtBalance back to adminPool…" });
      const tx = await contract.adminRecoverMvtBalance(recoverUser.trim(), amountWei, { gasLimit: 150_000n });
      await tx.wait();
      setRecoverResult({ success: true, msg: `✓ ${parsed.toLocaleString()} MVT recovered from ${recoverUser} back to adminPool.` });
      toast({ title: "MVT Recovered", description: "Balance moved back to admin pool." });
      setRecoverAmount("");
      loadPoolBalances();
    } catch (e: any) {
      const msg = decodeContractError(e);
      setRecoverResult({ success: false, msg });
      toast({ title: "Recovery Failed", description: msg, variant: "destructive" });
    } finally {
      setRecovering(false);
    }
  };

  const openAddForm = () => {
    setEditingProduct(null);
    setPName(""); setPDesc(""); setPPrice(""); setPImage(""); setPCategory("Hardware Wallet"); setPInStock(true);
    setShowProductForm(true);
  };

  const openEditForm = (p: Product) => {
    setEditingProduct(p);
    setPName(p.name); setPDesc(p.description); setPPrice(String(p.price)); setPImage(p.image); setPCategory(p.category); setPInStock(p.inStock);
    setShowProductForm(true);
  };

  const handleSaveProduct = async () => {
    if (!pName.trim() || !pPrice.trim()) return;
    setSavingProduct(true);
    try {
      const body = { name: pName.trim(), description: pDesc.trim(), price: parseFloat(pPrice), image: pImage.trim(), category: pCategory.trim(), inStock: pInStock };
      if (editingProduct) {
        await fetch(`/api/admin/products/${editingProduct.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        await fetch("/api/admin/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      setShowProductForm(false);
      loadProducts();
    } catch { /* ignore */ } finally { setSavingProduct(false); }
  };

  const handleDeleteProduct = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
      loadProducts();
    } catch { /* ignore */ } finally { setDeletingId(null); }
  };

  const handleToggleStock = async (p: Product) => {
    await fetch(`/api/admin/products/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inStock: !p.inStock }) });
    loadProducts();
  };

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
      const pkgLabel = pkg === 1 ? "Starter ($75)" : "Pro ($150)";
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
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // Non-JSON response — typically an nginx/proxy error page (e.g. 413 Request
        // Entity Too Large when the server's max upload size is smaller than the file).
      }
      if (xhr.status === 200 && data) {
        const mb = (data.size / 1024 / 1024).toFixed(1);
        setUploadedSize(`${mb} MB`);
        setMwalletUrl(data.url);
        setMwalletResult({ success: true, msg: `APK uploaded (${mb} MB). Users will now see the Install button.` });
        toast({ title: "APK Uploaded!", description: `${mb} MB — download link is now live.` });
      } else {
        const msg = data?.message
          || (xhr.status === 413 ? "File too large for the server to accept (413). Try a smaller APK or contact support." : `Upload failed (HTTP ${xhr.status})`);
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
      toast({ title: "Credit BTC Pool", description: "Confirm the transaction in MetaMask…" });
      const mvaultContract = getMvaultContract(signer);
      const tx = await mvaultContract.adminCreditBtcPool(addr, amountWei, { gasLimit: 500_000n });
      await tx.wait();
      setBtcCreditResult({ success: true, msg: `Credited $${btcCreditAmount} USDT to ${addr}'s BTC pool` });
      toast({ title: "BTC Pool Credited", description: `$${btcCreditAmount} credited to ${addr}.` });
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

  const handleDepositUsdtPool = async () => {
    const parsed = parseFloat(usdtDepositAmount);
    if (!parsed || parsed <= 0) {
      toast({ title: "Invalid amount", description: "Enter a positive USDT amount.", variant: "destructive" });
      return;
    }
    const amountWei = ethers.parseUnits(usdtDepositAmount.trim(), 18);
    setDepositingUsdt(true);
    setUsdtDepositResult(null);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      toast({ title: "Send USDT to Contract", description: "Confirm the transfer in MetaMask…" });
      const usdtContract = getTokenContract(signer);
      // Direct transfer from admin wallet to MvaultContract — no approve needed.
      // transferFrom via contract function reverts on MChain; direct transfer works.
      const tx = await usdtContract.transfer(MVAULT_CONTRACT_ADDRESS, amountWei, { gasLimit: 100_000n });
      await tx.wait();
      setUsdtDepositResult({ success: true, msg: `Sent $${usdtDepositAmount} USDT to contract liquidity pool` });
      toast({ title: "USDT Sent", description: `$${usdtDepositAmount} USDT sent directly to contract.` });
      setUsdtDepositAmount("");
    } catch (e: any) {
      const msg = decodeContractError(e);
      setUsdtDepositResult({ success: false, msg });
      toast({ title: "Send Failed", description: msg, variant: "destructive" });
    } finally {
      setDepositingUsdt(false);
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
                <div className="text-xs mt-0.5">$75 package · $225 cap</div>
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
                <div className="text-xs mt-0.5">$150 package · $450 cap</div>
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
      <Card className="border-purple-500/30 bg-purple-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4 text-purple-400" />
            Set Manager — ACTION REQUIRED
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            The daily admin wallet is not yet the contract manager. Connect with the <span className="text-purple-300 font-semibold">owner wallet (0xF305fE…)</span> and click Set Manager to fix ghost activation.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs text-purple-300 space-y-1">
            <div className="font-semibold">⚠ Ghost activation is failing because your daily wallet is not the manager.</div>
            <div>1. Switch MetaMask to owner wallet <span className="font-mono">0xF305fE…318</span></div>
            <div>2. Click Set Manager below (daily wallet is pre-filled)</div>
            <div>3. Switch back to daily wallet — ghost activation will work</div>
          </div>
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
              className="font-mono text-sm bg-white/[0.03] border-purple-500/20"
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
      {/* Fund Contract USDT Pool */}
      <Card className="border-white/[0.08] bg-white/[0.02]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bitcoin className="w-4 h-4 text-emerald-400" />
            Fund Contract USDT Pool
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Send USDT directly from your admin wallet to the contract's liquidity pool.
            One MetaMask confirmation — no approve step needed.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="usdt-deposit-amount" className="text-xs text-muted-foreground uppercase tracking-wider">
              Amount (USDT)
            </Label>
            <Input
              id="usdt-deposit-amount"
              data-testid="input-usdt-deposit-amount"
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 500"
              value={usdtDepositAmount}
              onChange={e => setUsdtDepositAmount(e.target.value)}
              className="text-sm bg-white/[0.03] border-white/[0.08]"
            />
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300/80 space-y-0.5">
            <div>✓ Real USDT moves from your wallet → contract's liquidity pool</div>
            <div>✓ Backs board entries, rewards, and user withdrawals</div>
            <div>✓ Deposit enough to cover all credited BTC pool balances</div>
          </div>
          {usdtDepositResult && <ResultBanner result={usdtDepositResult} />}
          <Button
            data-testid="button-deposit-usdt-pool"
            onClick={handleDepositUsdtPool}
            disabled={depositingUsdt || !usdtDepositAmount.trim()}
            className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-semibold"
          >
            {depositingUsdt ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Depositing…</>
            ) : (
              <><Bitcoin className="w-4 h-4" /> Deposit USDT to Pool</>
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
            Virtually credits a user's BTC pool balance so they can enter board pools.
            One MetaMask confirmation. Make sure to fund the contract USDT pool above first.
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
            <div>✓ Credits user's btcPoolBalance and totalBtcEarned</div>
            <div>✓ User can use it for board pool entry</div>
            <div>⚠ Fund the USDT pool above before user enters board</div>
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

      {/* Withdraw Admin USDT Pool */}
      <Card className="border-white/[0.08] bg-white/[0.02]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-emerald-400" />
              Withdraw Admin USDT
            </CardTitle>
            <button
              data-testid="button-refresh-usdt-pool"
              onClick={loadPoolBalances}
              disabled={poolsLoading}
              className="text-muted-foreground hover:text-white transition-colors"
              title="Refresh balance"
            >
              <RefreshCw className={`w-4 h-4 ${poolsLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Real USDT accumulated from the 10% admin fee on every MVT sell. Send directly to any wallet.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Balance display */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Available Balance</p>
              <p className="text-2xl font-bold font-mono text-emerald-400">
                {poolsLoading
                  ? <Loader2 className="w-5 h-5 animate-spin inline" />
                  : `$${parseFloat(ethers.formatUnits(adminUsdtBalance, 18)).toFixed(4)}`}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">USDT</p>
            </div>
            <div className="text-emerald-400/30 text-4xl font-bold">$</div>
          </div>

          {/* Recipient address */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Send To</Label>
              <button
                data-testid="button-usdt-use-my-wallet"
                onClick={() => setUsdtWithdrawTo(account)}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold uppercase tracking-wider"
              >
                MY WALLET
              </button>
            </div>
            <Input
              data-testid="input-usdt-withdraw-to"
              placeholder={`Default: ${account.slice(0, 10)}…`}
              value={usdtWithdrawTo}
              onChange={e => setUsdtWithdrawTo(e.target.value)}
              className="font-mono text-sm bg-white/[0.03] border-white/[0.08]"
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Amount (USDT)</Label>
              <button
                data-testid="button-usdt-withdraw-max"
                onClick={() => setUsdtWithdrawAmt(ethers.formatUnits(adminUsdtBalance, 18))}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold uppercase tracking-wider"
              >
                MAX
              </button>
            </div>
            <Input
              data-testid="input-usdt-withdraw-amount"
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 50"
              value={usdtWithdrawAmt}
              onChange={e => setUsdtWithdrawAmt(e.target.value)}
              className="text-sm bg-white/[0.03] border-white/[0.08]"
            />
          </div>

          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300/80 space-y-0.5">
            <div>✓ Real USDT — no extra sell step needed</div>
            <div>✓ Sends directly to the recipient wallet</div>
            <div>✓ Leave "Send To" blank to send to your own wallet</div>
          </div>

          {usdtWithdrawResult && <ResultBanner result={usdtWithdrawResult} />}

          <Button
            data-testid="button-withdraw-admin-usdt"
            onClick={handleWithdrawAdminUsdt}
            disabled={withdrawingUsdt || !usdtWithdrawAmt.trim() || adminUsdtBalance === 0n}
            className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-semibold"
          >
            {withdrawingUsdt ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Withdrawing…</>
            ) : (
              <><TrendingDown className="w-4 h-4" /> Withdraw Admin USDT</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Link Board Matrix Contract */}
      <Card className="border-white/[0.08] bg-white/[0.02]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link className="w-4 h-4 text-blue-400" />
            Link Board Matrix
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Point the main contract to a new board matrix contract address. Only the contract owner can do this.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">New Board Matrix Address</Label>
            <Input
              data-testid="input-board-handler-addr"
              placeholder="0x…"
              value={boardHandlerAddr}
              onChange={e => setBoardHandlerAddr(e.target.value)}
              className="font-mono text-sm bg-white/[0.03] border-white/[0.08]"
            />
          </div>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-300/80 space-y-0.5">
            <div>New board matrix (v2 with adminSkipEntry): <span className="font-mono">0x510bb4…36c94</span></div>
            <div>After linking, use "Skip Board Entry" below to remove ghost queue entries.</div>
          </div>
          {linkBoardResult && <ResultBanner result={linkBoardResult} />}
          <Button
            data-testid="button-link-board-handler"
            onClick={handleLinkBoardHandler}
            disabled={linkingBoard || !boardHandlerAddr.trim()}
            className="w-full bg-blue-700 hover:bg-blue-600 text-white font-semibold"
          >
            {linkingBoard ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Linking…</>
            ) : (
              <><Link className="w-4 h-4" /> Set Board Handler</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Skip Board Queue Entry */}
      <Card className="border-white/[0.08] bg-white/[0.02]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-orange-400" />
            Skip Board Queue Entry
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Remove a ghost-activated or invalid entry from the board pool queue. No reward is paid. Use queue index shown in Pool board view.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Pool Level (1–6)</Label>
              <Input
                data-testid="input-skip-board-level"
                type="number"
                min="1"
                max="6"
                value={skipBoardLevel}
                onChange={e => setSkipBoardLevel(e.target.value)}
                className="text-sm bg-white/[0.03] border-white/[0.08]"
                placeholder="1"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Queue Index</Label>
              <Input
                data-testid="input-skip-board-index"
                type="number"
                min="0"
                value={skipBoardIndex}
                onChange={e => setSkipBoardIndex(e.target.value)}
                className="text-sm bg-white/[0.03] border-white/[0.08]"
                placeholder="e.g. 2"
              />
            </div>
          </div>
          <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-xs text-orange-300/80 space-y-0.5">
            <div>⚠ Irreversible — entry will be permanently marked as completed with no reward paid.</div>
            <div>Index 0 = first in queue. Current ghost entries: Level 1 indexes 2, 3, 4.</div>
          </div>
          {skipBoardResult && <ResultBanner result={skipBoardResult} />}
          <Button
            data-testid="button-skip-board-entry"
            onClick={handleSkipBoardEntry}
            disabled={skippingBoard || !skipBoardIndex.trim()}
            className="w-full bg-orange-700 hover:bg-orange-600 text-white font-semibold"
          >
            {skippingBoard ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
            ) : (
              <><TrendingDown className="w-4 h-4" /> Skip This Entry</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Claim Admin Pools */}
      <Card className="border-white/[0.08] bg-white/[0.02]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-cyan-400" />
              Claim Admin Pools
            </CardTitle>
            <button
              data-testid="button-refresh-pools"
              onClick={loadPoolBalances}
              disabled={poolsLoading}
              className="text-muted-foreground hover:text-white transition-colors"
              title="Refresh balances"
            >
              <RefreshCw className={`w-4 h-4 ${poolsLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Credit MVT from any pool to your own wallet balance, then go to the Wallet page to Sell MVT → Withdraw USDT.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Pool balance display */}
          <div className="grid grid-cols-3 gap-2">
            {(["admin", "community", "reserve"] as const).map((key) => {
              const labels = { admin: "Admin", community: "Community", reserve: "Reserve" };
              const val = poolBalances[key];
              const mvt = parseFloat(ethers.formatUnits(val, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 });
              return (
                <button
                  key={key}
                  data-testid={`button-pool-${key}`}
                  onClick={() => { setSelectedPool(key); setClaimAmount(""); setClaimResult(null); }}
                  className={`rounded-lg border p-2.5 text-left transition-all ${
                    selectedPool === key
                      ? "border-cyan-500/60 bg-cyan-500/10"
                      : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${selectedPool === key ? "text-cyan-400" : "text-muted-foreground"}`}>
                    {labels[key]}
                  </div>
                  <div className={`text-sm font-mono font-bold ${selectedPool === key ? "text-cyan-300" : "text-white"}`}>
                    {poolsLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : mvt}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">MVT</div>
                </button>
              );
            })}
          </div>

          {/* Amount input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Amount (MVT)</Label>
              <button
                data-testid="button-pool-max"
                onClick={() => {
                  const max = ethers.formatUnits(poolBalances[selectedPool], 18);
                  setClaimAmount(max);
                }}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold uppercase tracking-wider"
              >
                MAX
              </button>
            </div>
            <Input
              data-testid="input-claim-amount"
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 10000"
              value={claimAmount}
              onChange={e => setClaimAmount(e.target.value)}
              className="text-sm bg-white/[0.03] border-white/[0.08]"
            />
          </div>

          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-300/80 space-y-0.5">
            <div>Use to credit MVT to an <span className="text-white font-semibold">active user's</span> balance (they can then sell it). Not for admin wallet.</div>
          </div>

          {claimResult && <ResultBanner result={claimResult} />}

          <Button
            data-testid="button-claim-pool"
            onClick={handleClaimPool}
            disabled={claiming || !claimAmount.trim() || poolBalances[selectedPool] === 0n}
            className="w-full bg-cyan-700 hover:bg-cyan-600 text-white font-semibold"
          >
            {claiming ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Claiming…</>
            ) : (
              <><TrendingDown className="w-4 h-4" /> Credit MVT to {selectedPool === "admin" ? "Admin" : selectedPool === "community" ? "Community" : "Reserve"} Pool Holder</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Admin Cash Out — sell from any pool → USDT directly to wallet */}
      <Card className="border-emerald-500/20 bg-emerald-500/[0.03]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-emerald-400" />
            Admin Cash Out
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Sell MVT from any pool — USDT goes straight to any wallet. No user account needed.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Pool selector */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Select Pool</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["admin", "community", "reserve"] as const).map((key) => {
                const labels = { admin: "Admin", community: "Community", reserve: "Reserve" };
                const val = poolBalances[key];
                const mvt = parseFloat(ethers.formatUnits(val, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 });
                return (
                  <button
                    key={key}
                    data-testid={`button-cashout-pool-${key}`}
                    onClick={() => { setCashOutPool(key); setCashOutAmount(""); setCashOutResult(null); }}
                    className={`rounded-lg border p-2.5 text-left transition-all ${
                      cashOutPool === key
                        ? "border-emerald-500/60 bg-emerald-500/10"
                        : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
                    }`}
                  >
                    <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${cashOutPool === key ? "text-emerald-400" : "text-muted-foreground"}`}>
                      {labels[key]}
                    </div>
                    <div className={`text-sm font-mono font-bold ${cashOutPool === key ? "text-emerald-300" : "text-white"}`}>
                      {poolsLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : mvt}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">MVT</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">MVT Amount</Label>
            <div className="flex gap-2">
              <Input
                data-testid="input-cashout-amount"
                type="number" min="0" step="any" placeholder="e.g. 1000"
                value={cashOutAmount}
                onChange={e => setCashOutAmount(e.target.value)}
                className="text-sm bg-white/[0.03] border-white/[0.08]"
              />
              <button
                onClick={() => setCashOutAmount(ethers.formatUnits(poolBalances[cashOutPool], 18))}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold uppercase tracking-wider whitespace-nowrap px-2"
              >MAX</button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Recipient Wallet (leave blank = connected wallet)</Label>
            <Input
              data-testid="input-cashout-recipient"
              placeholder={account}
              value={cashOutRecipient}
              onChange={e => setCashOutRecipient(e.target.value)}
              className="text-sm bg-white/[0.03] border-white/[0.08] font-mono"
            />
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300/80 space-y-0.5">
            <div>• Burns MVT tokens → bonding curve sends USDT to this contract</div>
            <div>• USDT transferred immediately to recipient wallet (~90% of sell price)</div>
            <div>• No income limit, no user registration required</div>
          </div>
          {cashOutResult && <ResultBanner result={cashOutResult} />}
          <Button
            data-testid="button-admin-cashout"
            onClick={handleAdminCashOut}
            disabled={cashingOut || !cashOutAmount.trim() || poolBalances[cashOutPool] === 0n}
            className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-semibold"
          >
            {cashingOut
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Cashing Out…</>
              : <><TrendingDown className="w-4 h-4" /> Cash Out {cashOutPool === "admin" ? "Admin" : cashOutPool === "community" ? "Community" : "Reserve"} Pool → USDT</>
            }
          </Button>
        </CardContent>
      </Card>

      {/* Recover stuck MVT balance */}
      <Card className="border-amber-500/20 bg-amber-500/[0.03]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-amber-400" />
            Recover Stuck MVT Balance
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Move MVT from any user's virtual mvtBalance back to the Admin Pool (reverses an accidental withdrawAdminPool to a non-active wallet).
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">User Address</Label>
            <Input
              data-testid="input-recover-user"
              placeholder="0x…"
              value={recoverUser}
              onChange={e => setRecoverUser(e.target.value)}
              className="text-sm bg-white/[0.03] border-white/[0.08] font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">MVT Amount</Label>
            <Input
              data-testid="input-recover-amount"
              type="number" min="0" step="any" placeholder="e.g. 400"
              value={recoverAmount}
              onChange={e => setRecoverAmount(e.target.value)}
              className="text-sm bg-white/[0.03] border-white/[0.08]"
            />
          </div>
          {recoverResult && <ResultBanner result={recoverResult} />}
          <Button
            data-testid="button-recover-mvt"
            onClick={handleRecoverMvtBalance}
            disabled={recovering || !recoverAmount.trim() || !recoverUser.trim()}
            className="w-full bg-amber-700 hover:bg-amber-600 text-white font-semibold"
          >
            {recovering ? <><Loader2 className="w-4 h-4 animate-spin" /> Recovering…</> : <><RefreshCw className="w-4 h-4" /> Recover MVT → Admin Pool</>}
          </Button>
        </CardContent>
      </Card>

      {/* Store Product Management */}
      <Card className="border-white/[0.08] bg-white/[0.02]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4 text-violet-400" />
              Store Products
            </CardTitle>
            <Button size="sm" onClick={openAddForm} className="bg-violet-600 hover:bg-violet-500 text-white h-8 px-3 text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Product
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Add, edit, or remove products shown in the marketplace.</p>
        </CardHeader>
        <CardContent className="space-y-3">

          {/* Add / Edit form */}
          {showProductForm && (
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-violet-300">{editingProduct ? "Edit Product" : "New Product"}</p>
                <button onClick={() => setShowProductForm(false)} className="text-muted-foreground hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Product Name *</Label>
                  <Input value={pName} onChange={e => setPName(e.target.value)} placeholder="e.g. Ledger Nano X" className="bg-white/[0.03] border-white/[0.08] text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Price (USD) *</Label>
                  <Input value={pPrice} onChange={e => setPPrice(e.target.value)} placeholder="99" type="number" min="0" className="bg-white/[0.03] border-white/[0.08] text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Category</Label>
                  <Input value={pCategory} onChange={e => setPCategory(e.target.value)} placeholder="Hardware Wallet" className="bg-white/[0.03] border-white/[0.08] text-sm" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Image URL</Label>
                  <Input value={pImage} onChange={e => setPImage(e.target.value)} placeholder="https://..." className="bg-white/[0.03] border-white/[0.08] text-sm font-mono" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Description</Label>
                  <Input value={pDesc} onChange={e => setPDesc(e.target.value)} placeholder="Short product description" className="bg-white/[0.03] border-white/[0.08] text-sm" />
                </div>
                <div className="col-span-2 flex items-center gap-3">
                  <button onClick={() => setPInStock(v => !v)} className="flex items-center gap-2 text-sm">
                    {pInStock ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                    <span className={pInStock ? "text-emerald-400" : "text-muted-foreground"}>In Stock</span>
                  </button>
                </div>
              </div>
              <Button onClick={handleSaveProduct} disabled={savingProduct || !pName.trim() || !pPrice.trim()} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold">
                {savingProduct ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : <><Save className="w-4 h-4 mr-2" />{editingProduct ? "Save Changes" : "Add Product"}</>}
              </Button>
            </div>
          )}

          {/* Product list */}
          {loadingProducts ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : products.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">No products yet. Click "Add Product" to get started.</div>
          ) : (
            <div className="space-y-2">
              {products.map(p => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  {p.image ? (
                    <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover shrink-0 bg-white/[0.04]" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.category} · <span className="text-amber-400 font-medium">${p.price}</span></p>
                  </div>
                  <button onClick={() => handleToggleStock(p)} className="shrink-0" title="Toggle stock">
                    {p.inStock ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                  </button>
                  <button onClick={() => openEditForm(p)} className="shrink-0 text-muted-foreground hover:text-white transition-colors" data-testid={`button-edit-product-${p.id}`}>
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDeleteProduct(p.id)} disabled={deletingId === p.id} className="shrink-0 text-muted-foreground hover:text-red-400 transition-colors" data-testid={`button-delete-product-${p.id}`}>
                    {deletingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
