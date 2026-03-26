import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, LogOut, Wallet, UserCircle, Search, X,
  User, Mail, Phone, Globe, ArrowRight, CheckCircle2, Sparkles,
} from "lucide-react";
import { shortenAddress } from "@/lib/contract";

interface ProfileSetupPageProps {
  account: string;
  saveProfileOnChain: (name: string, email: string, phone: string, country: string) => Promise<void>;
  onComplete: () => void;
  disconnect: () => void;
}

const COUNTRIES = [
  { name: "Afghanistan", code: "+93", flag: "🇦🇫" },
  { name: "Albania", code: "+355", flag: "🇦🇱" },
  { name: "Algeria", code: "+213", flag: "🇩🇿" },
  { name: "Argentina", code: "+54", flag: "🇦🇷" },
  { name: "Australia", code: "+61", flag: "🇦🇺" },
  { name: "Austria", code: "+43", flag: "🇦🇹" },
  { name: "Bangladesh", code: "+880", flag: "🇧🇩" },
  { name: "Belgium", code: "+32", flag: "🇧🇪" },
  { name: "Brazil", code: "+55", flag: "🇧🇷" },
  { name: "Cambodia", code: "+855", flag: "🇰🇭" },
  { name: "Canada", code: "+1", flag: "🇨🇦" },
  { name: "Chile", code: "+56", flag: "🇨🇱" },
  { name: "China", code: "+86", flag: "🇨🇳" },
  { name: "Colombia", code: "+57", flag: "🇨🇴" },
  { name: "Croatia", code: "+385", flag: "🇭🇷" },
  { name: "Czech Republic", code: "+420", flag: "🇨🇿" },
  { name: "Denmark", code: "+45", flag: "🇩🇰" },
  { name: "Egypt", code: "+20", flag: "🇪🇬" },
  { name: "Ethiopia", code: "+251", flag: "🇪🇹" },
  { name: "Finland", code: "+358", flag: "🇫🇮" },
  { name: "France", code: "+33", flag: "🇫🇷" },
  { name: "Germany", code: "+49", flag: "🇩🇪" },
  { name: "Ghana", code: "+233", flag: "🇬🇭" },
  { name: "Greece", code: "+30", flag: "🇬🇷" },
  { name: "Hong Kong", code: "+852", flag: "🇭🇰" },
  { name: "Hungary", code: "+36", flag: "🇭🇺" },
  { name: "India", code: "+91", flag: "🇮🇳" },
  { name: "Indonesia", code: "+62", flag: "🇮🇩" },
  { name: "Iran", code: "+98", flag: "🇮🇷" },
  { name: "Iraq", code: "+964", flag: "🇮🇶" },
  { name: "Ireland", code: "+353", flag: "🇮🇪" },
  { name: "Israel", code: "+972", flag: "🇮🇱" },
  { name: "Italy", code: "+39", flag: "🇮🇹" },
  { name: "Japan", code: "+81", flag: "🇯🇵" },
  { name: "Jordan", code: "+962", flag: "🇯🇴" },
  { name: "Kazakhstan", code: "+7", flag: "🇰🇿" },
  { name: "Kenya", code: "+254", flag: "🇰🇪" },
  { name: "Kuwait", code: "+965", flag: "🇰🇼" },
  { name: "Lebanon", code: "+961", flag: "🇱🇧" },
  { name: "Malaysia", code: "+60", flag: "🇲🇾" },
  { name: "Mexico", code: "+52", flag: "🇲🇽" },
  { name: "Morocco", code: "+212", flag: "🇲🇦" },
  { name: "Myanmar", code: "+95", flag: "🇲🇲" },
  { name: "Nepal", code: "+977", flag: "🇳🇵" },
  { name: "Netherlands", code: "+31", flag: "🇳🇱" },
  { name: "New Zealand", code: "+64", flag: "🇳🇿" },
  { name: "Nigeria", code: "+234", flag: "🇳🇬" },
  { name: "Norway", code: "+47", flag: "🇳🇴" },
  { name: "Oman", code: "+968", flag: "🇴🇲" },
  { name: "Pakistan", code: "+92", flag: "🇵🇰" },
  { name: "Peru", code: "+51", flag: "🇵🇪" },
  { name: "Philippines", code: "+63", flag: "🇵🇭" },
  { name: "Poland", code: "+48", flag: "🇵🇱" },
  { name: "Portugal", code: "+351", flag: "🇵🇹" },
  { name: "Qatar", code: "+974", flag: "🇶🇦" },
  { name: "Romania", code: "+40", flag: "🇷🇴" },
  { name: "Russia", code: "+7", flag: "🇷🇺" },
  { name: "Saudi Arabia", code: "+966", flag: "🇸🇦" },
  { name: "Singapore", code: "+65", flag: "🇸🇬" },
  { name: "South Africa", code: "+27", flag: "🇿🇦" },
  { name: "South Korea", code: "+82", flag: "🇰🇷" },
  { name: "Spain", code: "+34", flag: "🇪🇸" },
  { name: "Sri Lanka", code: "+94", flag: "🇱🇰" },
  { name: "Sudan", code: "+249", flag: "🇸🇩" },
  { name: "Sweden", code: "+46", flag: "🇸🇪" },
  { name: "Switzerland", code: "+41", flag: "🇨🇭" },
  { name: "Taiwan", code: "+886", flag: "🇹🇼" },
  { name: "Tanzania", code: "+255", flag: "🇹🇿" },
  { name: "Thailand", code: "+66", flag: "🇹🇭" },
  { name: "Turkey", code: "+90", flag: "🇹🇷" },
  { name: "Uganda", code: "+256", flag: "🇺🇬" },
  { name: "Ukraine", code: "+380", flag: "🇺🇦" },
  { name: "United Arab Emirates", code: "+971", flag: "🇦🇪" },
  { name: "United Kingdom", code: "+44", flag: "🇬🇧" },
  { name: "United States", code: "+1", flag: "🇺🇸" },
  { name: "Uzbekistan", code: "+998", flag: "🇺🇿" },
  { name: "Venezuela", code: "+58", flag: "🇻🇪" },
  { name: "Vietnam", code: "+84", flag: "🇻🇳" },
  { name: "Zimbabwe", code: "+263", flag: "🇿🇼" },
];

function getInitials(name: string) {
  return name.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

export default function ProfileSetupPage({ account, saveProfileOnChain, onComplete, disconnect }: ProfileSetupPageProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<typeof COUNTRIES[0] | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCountries = useMemo(() => {
    if (!searchQuery) return COUNTRIES;
    const q = searchQuery.toLowerCase();
    return COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || c.code.includes(q));
  }, [searchQuery]);

  const handleCountrySelect = (c: typeof COUNTRIES[0]) => {
    setSelectedCountry(c);
    setCountry(c.name);
    if (!phone || phone === selectedCountry?.code) {
      setPhone(c.code + " ");
    } else if (selectedCountry?.code && phone.startsWith(selectedCountry.code)) {
      setPhone(c.code + phone.slice(selectedCountry.code.length));
    } else {
      setPhone(c.code + " " + phone.replace(/^\+\d+\s?/, ""));
    }
    setShowDropdown(false);
    setSearchQuery("");
  };

  const handleSubmit = async () => {
    if (!displayName.trim()) {
      toast({ title: "Display name is required", variant: "destructive" }); return;
    }
    setLoading(true);
    try {
      await saveProfileOnChain(displayName.trim(), email.trim(), phone.trim(), country.trim());
      toast({ title: "Profile saved!", description: "Your profile is now stored on-chain." });
      onComplete();
    } catch (err: any) {
      toast({ title: "Failed to save profile", description: err?.reason || err?.message || "Please try again.", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const initials = getInitials(displayName);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden" data-testid="page-profile-setup">
      {/* Background glows */}
      <div className="absolute top-[-10%] left-[-15%] w-[500px] h-[500px] rounded-full bg-violet-500/[0.05] blur-[200px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-amber-500/[0.05] blur-[180px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-4 slide-in">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]" data-testid="text-wallet-address">
            <Wallet className="h-3.5 w-3.5" />
            <span className="font-mono">{shortenAddress(account)}</span>
          </div>
          <button onClick={disconnect} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]" data-testid="button-disconnect">
            <LogOut className="w-3.5 h-3.5" /> Disconnect
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-3 px-1">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <span className="text-xs text-muted-foreground line-through">Register</span>
          </div>
          <div className="flex-1 h-px bg-white/[0.06]" />
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <span className="text-[10px] font-bold text-amber-400">2</span>
            </div>
            <span className="text-xs font-semibold text-amber-400">Profile</span>
          </div>
          <div className="flex-1 h-px bg-white/[0.06]" />
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
              <span className="text-[10px] font-bold text-muted-foreground">3</span>
            </div>
            <span className="text-xs text-muted-foreground">Activate</span>
          </div>
        </div>

        {/* Main Card */}
        <div className="glass-card rounded-2xl overflow-hidden">
          {/* Card header */}
          <div className="px-6 pt-6 pb-5 border-b border-white/[0.05]">
            <div className="flex items-center gap-4">
              {/* Avatar preview */}
              <div className="relative h-14 w-14 shrink-0">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-violet-500/15 border border-amber-500/20 flex items-center justify-center">
                  {displayName ? (
                    <span className="text-xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}>{initials}</span>
                  ) : (
                    <UserCircle className="h-7 w-7 text-muted-foreground/40" />
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                  <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  <span className="gradient-text">Set Up Profile</span>
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {displayName ? `Welcome, ${displayName.split(" ")[0]}!` : "Your identity in the network"}
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* Display Name */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                <User className="h-3 w-3" /> Display Name <span className="text-red-400">*</span>
              </label>
              <Input
                type="text"
                placeholder="Your name or username"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading}
                className="bg-white/[0.03] border-white/[0.08] focus:border-amber-500/30 transition-colors"
                data-testid="input-display-name"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> Email Address
              </label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="bg-white/[0.03] border-white/[0.08] focus:border-amber-500/30 transition-colors"
                data-testid="input-email"
              />
            </div>

            {/* Country + Phone side-by-side */}
            <div className="grid grid-cols-5 gap-2">
              {/* Country selector */}
              <div className="col-span-3 space-y-1.5 relative">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                  <Globe className="h-3 w-3" /> Country
                </label>
                <button
                  type="button"
                  onClick={() => setShowDropdown(!showDropdown)}
                  disabled={loading}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-white/[0.03] border border-white/[0.08] text-left transition-colors hover:bg-white/[0.05] hover:border-amber-500/20 disabled:opacity-50"
                  data-testid="button-country-dropdown"
                >
                  {selectedCountry ? (
                    <>
                      <span className="text-base leading-none">{selectedCountry.flag}</span>
                      <span className="text-foreground text-xs truncate flex-1">{selectedCountry.name}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-xs flex-1">Select country</span>
                  )}
                  <Globe className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
                </button>

                {showDropdown && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-white/[0.08] shadow-2xl overflow-hidden" style={{ background: "hsl(222 47% 8%)" }}>
                    <div className="p-2 border-b border-white/[0.05]">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 text-xs bg-white/[0.03] border border-white/[0.06] rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/30"
                          data-testid="input-country-search"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {filteredCountries.map((c) => (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => handleCountrySelect(c)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors hover:bg-white/[0.05] ${
                            country === c.name ? "bg-amber-500/10 text-amber-300" : "text-foreground"
                          }`}
                          data-testid={`option-country-${c.name.replace(/\s+/g, "-").toLowerCase()}`}
                        >
                          <span className="text-base leading-none w-5 shrink-0">{c.flag}</span>
                          <span className="flex-1 truncate">{c.name}</span>
                          <span className="text-muted-foreground shrink-0">{c.code}</span>
                        </button>
                      ))}
                      {filteredCountries.length === 0 && (
                        <div className="px-3 py-4 text-xs text-muted-foreground text-center">No countries found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Phone */}
              <div className="col-span-2 space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                  <Phone className="h-3 w-3" /> Phone
                </label>
                <Input
                  type="tel"
                  placeholder={selectedCountry ? selectedCountry.code : "+1 ..."}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                  className="bg-white/[0.03] border-white/[0.08] focus:border-amber-500/30 transition-colors"
                  data-testid="input-phone"
                />
              </div>
            </div>

            {/* Info note */}
            <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div className="h-6 w-6 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-3 w-3 text-amber-400/70" />
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Your profile is stored on-chain and visible to your team. Only your display name is required.
              </p>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSubmit}
              disabled={loading || !displayName.trim()}
              className="w-full glow-button text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="button-save-profile"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving Profile...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" /> Save Profile <ArrowRight className="h-4 w-4" /></>
              )}
            </button>

            {/* Skip link */}
            <button
              onClick={onComplete}
              disabled={loading}
              className="w-full text-center text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1"
              data-testid="button-skip-profile"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
