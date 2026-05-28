import { useState, useEffect } from "react";
import { User, Mail, Phone, Globe, Wallet, Loader2, Save, Users, Copy, Check, Shield, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { shortenAddress, getMvaultContract } from "@/lib/contract";
import { ethers } from "ethers";
import type { UserInfo } from "@/hooks/use-web3";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface SettingsProps {
  account: string;
  userInfo: UserInfo;
  profileOnChain: { displayName: string; email: string; phone: string; country: string; profileSet: boolean } | null;
  saveProfileOnChain: (name: string, email: string, phone: string, country: string) => Promise<void>;
  fetchUserData: () => Promise<void>;
  btcPoolRate?: number;
  setBtcPoolRate?: (rate: number) => Promise<void>;
}

export default function Settings({ account, userInfo, profileOnChain, saveProfileOnChain, fetchUserData, btcPoolRate = 10, setBtcPoolRate }: SettingsProps) {
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [saving, setSaving] = useState(false);
  const [btcRateInput, setBtcRateInput] = useState(btcPoolRate);
  const [savingRate, setSavingRate] = useState(false);
  const [sponsorName, setSponsorName] = useState<string | null>(null);
  const [sponsorEmail, setSponsorEmail] = useState<string | null>(null);
  const [sponsorLoading, setSponsorLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasSponsor = userInfo.sponsor && userInfo.sponsor !== ZERO_ADDRESS;

  useEffect(() => {
    if (!hasSponsor) return;
    setSponsorLoading(true);
    (async () => {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const contract = getMvaultContract(provider);
        const info = await contract.users(userInfo.sponsor);
        if (info.profileSet) {
          if (info.displayName) setSponsorName(info.displayName);
          if (info.email) setSponsorEmail(info.email);
        }
      } catch {}
      setSponsorLoading(false);
    })();
  }, [userInfo.sponsor]);

  useEffect(() => {
    if (profileOnChain && profileOnChain.profileSet) {
      setDisplayName(profileOnChain.displayName);
      setEmail(profileOnChain.email);
      setPhone(profileOnChain.phone);
      setCountry(profileOnChain.country);
    }
  }, [profileOnChain]);

  useEffect(() => { setBtcRateInput(btcPoolRate); }, [btcPoolRate]);

  const handleSaveRate = async () => {
    if (!setBtcPoolRate) return;
    if (btcRateInput < 10 || btcRateInput > 80) {
      toast({ title: "Invalid rate", description: "Rate must be between 10% and 80%.", variant: "destructive" });
      return;
    }
    setSavingRate(true);
    try {
      await setBtcPoolRate(btcRateInput);
      toast({ title: "BTC Pool Rate Updated", description: `${btcRateInput}% of your sell proceeds will go to your BTC pool.` });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.reason || err?.message || "Transaction failed", variant: "destructive" });
    } finally { setSavingRate(false); }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      toast({ title: "Validation Error", description: "Display name is required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveProfileOnChain(displayName, email, phone, country);
      await fetchUserData();
      toast({ title: "Profile saved", description: "Your profile has been updated on-chain." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message || "Transaction failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { label: "Display Name", icon: User, value: displayName, setter: setDisplayName, placeholder: "Enter your display name", type: "text" },
    { label: "Email", icon: Mail, value: email, setter: setEmail, placeholder: "Enter your email", type: "email" },
    { label: "Phone", icon: Phone, value: phone, setter: setPhone, placeholder: "Enter your phone number", type: "tel" },
    { label: "Country", icon: Globe, value: country, setter: setCountry, placeholder: "Enter your country", type: "text" },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      <div className="slide-in">
        <h1 className="text-2xl font-bold gradient-text" data-testid="text-settings-title" style={{ fontFamily: 'var(--font-display)' }}>Profile Settings</h1>
        <p className="text-muted-foreground text-sm">Manage your on-chain profile information</p>
      </div>

      <div className="glass-card rounded-2xl p-5 slide-in gradient-border" style={{ animationDelay: '0.1s' }} data-testid="card-wallet-address">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Connected Wallet</p>
            <p className="font-mono text-sm" data-testid="text-wallet-address">{shortenAddress(account)}</p>
          </div>
          <div className="h-9 w-9 rounded-xl gradient-icon flex items-center justify-center">
            <Wallet className="h-4 w-4 text-amber-400" />
          </div>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5 slide-in gradient-border" style={{ animationDelay: '0.15s' }} data-testid="card-sponsor-info">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-xl bg-yellow-600/15 flex items-center justify-center">
            <Shield className="h-4 w-4 text-yellow-300" />
          </div>
          <h3 className="text-sm font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }}>Sponsor Information</h3>
        </div>

        {!hasSponsor ? (
          <div className="text-center py-4" data-testid="text-no-sponsor">
            <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No sponsor linked</p>
            <p className="text-xs text-muted-foreground/60 mt-1">You registered without a referral link</p>
          </div>
        ) : sponsorLoading ? (
          <div className="flex items-center justify-center py-4 gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-yellow-300" />
            <p className="text-sm text-muted-foreground">Loading sponsor details...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Sponsor Name</p>
                <p className="font-bold text-base" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-sponsor-name">
                  <span className="gradient-text">{sponsorName || "Not Set"}</span>
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] border-yellow-600/20 text-yellow-300" data-testid="badge-sponsor-package">
                Active
              </Badge>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/10 to-transparent" />

            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Sponsor Wallet</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-xs text-yellow-200/80" data-testid="text-sponsor-wallet">{shortenAddress(userInfo.sponsor)}</p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(userInfo.sponsor);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                    toast({ title: "Copied", description: "Sponsor address copied to clipboard" });
                  }}
                  className="p-1 rounded-md hover:bg-white/5 transition-colors"
                  data-testid="button-copy-sponsor"
                >
                  {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                </button>
              </div>
            </div>

            {sponsorEmail && (
              <>
                <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/10 to-transparent" />
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Sponsor Email</p>
                  <p className="text-xs text-yellow-200/80" data-testid="text-sponsor-email">{sponsorEmail}</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="glass-card rounded-2xl p-5 slide-in gradient-border" style={{ animationDelay: '0.18s' }} data-testid="card-btc-pool-rate">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-xl bg-orange-600/15 flex items-center justify-center">
            <Zap className="h-4 w-4 text-orange-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }}>BTC Pool Allocation</h3>
            <p className="text-xs text-muted-foreground">How much of your sell proceeds go to your BTC board pool</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Allocation Rate</span>
            <span className="font-bold text-orange-400 text-lg" data-testid="text-btc-rate-value">{btcRateInput}%</span>
          </div>
          <div className="relative px-1">
            <input
              type="range"
              min={10}
              max={80}
              step={5}
              value={btcRateInput}
              onChange={(e) => setBtcRateInput(Number(e.target.value))}
              className="w-full accent-orange-400 cursor-pointer"
              data-testid="slider-btc-rate"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-1 px-0.5">
              <span>10% (min)</span>
              <span>80% (max)</span>
            </div>
          </div>

          <div className="rounded-xl bg-orange-500/5 border border-orange-500/10 px-4 py-2.5 text-xs text-orange-200/70 leading-relaxed">
            At <span className="text-orange-400 font-semibold">{btcRateInput}%</span>: for every 100 USDT of MVT sold,{" "}
            <span className="text-orange-400 font-semibold">{btcRateInput} USDT</span> goes to your BTC pool and{" "}
            <span className="text-yellow-400 font-semibold">{100 - btcRateInput} USDT</span> goes to your income wallet.
          </div>

          <button
            onClick={handleSaveRate}
            disabled={savingRate || !setBtcPoolRate || btcRateInput === btcPoolRate}
            className="w-full glow-button text-white font-bold py-2.5 px-6 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            data-testid="button-save-btc-rate"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {savingRate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {savingRate ? "Saving..." : btcRateInput === btcPoolRate ? "Rate Saved" : "Save Rate"}
          </button>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6 slide-in" style={{ animationDelay: '0.2s' }} data-testid="card-profile-form">
        <div className="mb-6">
          <h2 className="text-lg font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }}>Profile Information</h2>
          <p className="text-xs text-muted-foreground">{profileOnChain?.profileSet ? "Update your on-chain profile" : "Set up your on-chain profile"}</p>
        </div>

        <div className="space-y-4">
          {fields.map((field, idx) => (
            <div key={idx} className="space-y-2">
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                <field.icon className="h-3.5 w-3.5" />
                {field.label}
              </label>
              <Input
                type={field.type}
                placeholder={field.placeholder}
                value={field.value}
                onChange={(e) => field.setter(e.target.value)}
                className="bg-white/[0.03] border-yellow-600/20"
                data-testid={`input-${field.label.toLowerCase().replace(" ", "-")}`}
              />
            </div>
          ))}
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent my-6" />

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full glow-button text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          data-testid="button-save-profile"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </div>
  );
}
