import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogOut, Wallet, UserCircle, ChevronDown, Search } from "lucide-react";
import { shortenAddress } from "@/lib/contract";
import { Button } from "@/components/ui/button";

interface ProfileSetupPageProps {
  account: string;
  saveProfileOnChain: (name: string, email: string, phone: string, country: string) => Promise<void>;
  onComplete: () => void;
  disconnect: () => void;
}

const COUNTRIES = [
  { name: "Afghanistan", code: "+93", flag: "AF" },
  { name: "Albania", code: "+355", flag: "AL" },
  { name: "Algeria", code: "+213", flag: "DZ" },
  { name: "Argentina", code: "+54", flag: "AR" },
  { name: "Australia", code: "+61", flag: "AU" },
  { name: "Austria", code: "+43", flag: "AT" },
  { name: "Bangladesh", code: "+880", flag: "BD" },
  { name: "Belgium", code: "+32", flag: "BE" },
  { name: "Brazil", code: "+55", flag: "BR" },
  { name: "Cambodia", code: "+855", flag: "KH" },
  { name: "Canada", code: "+1", flag: "CA" },
  { name: "Chile", code: "+56", flag: "CL" },
  { name: "China", code: "+86", flag: "CN" },
  { name: "Colombia", code: "+57", flag: "CO" },
  { name: "Croatia", code: "+385", flag: "HR" },
  { name: "Czech Republic", code: "+420", flag: "CZ" },
  { name: "Denmark", code: "+45", flag: "DK" },
  { name: "Egypt", code: "+20", flag: "EG" },
  { name: "Ethiopia", code: "+251", flag: "ET" },
  { name: "Finland", code: "+358", flag: "FI" },
  { name: "France", code: "+33", flag: "FR" },
  { name: "Germany", code: "+49", flag: "DE" },
  { name: "Ghana", code: "+233", flag: "GH" },
  { name: "Greece", code: "+30", flag: "GR" },
  { name: "Hong Kong", code: "+852", flag: "HK" },
  { name: "Hungary", code: "+36", flag: "HU" },
  { name: "India", code: "+91", flag: "IN" },
  { name: "Indonesia", code: "+62", flag: "ID" },
  { name: "Iran", code: "+98", flag: "IR" },
  { name: "Iraq", code: "+964", flag: "IQ" },
  { name: "Ireland", code: "+353", flag: "IE" },
  { name: "Israel", code: "+972", flag: "IL" },
  { name: "Italy", code: "+39", flag: "IT" },
  { name: "Japan", code: "+81", flag: "JP" },
  { name: "Jordan", code: "+962", flag: "JO" },
  { name: "Kazakhstan", code: "+7", flag: "KZ" },
  { name: "Kenya", code: "+254", flag: "KE" },
  { name: "Kuwait", code: "+965", flag: "KW" },
  { name: "Lebanon", code: "+961", flag: "LB" },
  { name: "Malaysia", code: "+60", flag: "MY" },
  { name: "Mexico", code: "+52", flag: "MX" },
  { name: "Morocco", code: "+212", flag: "MA" },
  { name: "Myanmar", code: "+95", flag: "MM" },
  { name: "Nepal", code: "+977", flag: "NP" },
  { name: "Netherlands", code: "+31", flag: "NL" },
  { name: "New Zealand", code: "+64", flag: "NZ" },
  { name: "Nigeria", code: "+234", flag: "NG" },
  { name: "Norway", code: "+47", flag: "NO" },
  { name: "Oman", code: "+968", flag: "OM" },
  { name: "Pakistan", code: "+92", flag: "PK" },
  { name: "Peru", code: "+51", flag: "PE" },
  { name: "Philippines", code: "+63", flag: "PH" },
  { name: "Poland", code: "+48", flag: "PL" },
  { name: "Portugal", code: "+351", flag: "PT" },
  { name: "Qatar", code: "+974", flag: "QA" },
  { name: "Romania", code: "+40", flag: "RO" },
  { name: "Russia", code: "+7", flag: "RU" },
  { name: "Saudi Arabia", code: "+966", flag: "SA" },
  { name: "Singapore", code: "+65", flag: "SG" },
  { name: "South Africa", code: "+27", flag: "ZA" },
  { name: "South Korea", code: "+82", flag: "KR" },
  { name: "Spain", code: "+34", flag: "ES" },
  { name: "Sri Lanka", code: "+94", flag: "LK" },
  { name: "Sudan", code: "+249", flag: "SD" },
  { name: "Sweden", code: "+46", flag: "SE" },
  { name: "Switzerland", code: "+41", flag: "CH" },
  { name: "Taiwan", code: "+886", flag: "TW" },
  { name: "Tanzania", code: "+255", flag: "TZ" },
  { name: "Thailand", code: "+66", flag: "TH" },
  { name: "Turkey", code: "+90", flag: "TR" },
  { name: "Uganda", code: "+256", flag: "UG" },
  { name: "Ukraine", code: "+380", flag: "UA" },
  { name: "United Arab Emirates", code: "+971", flag: "AE" },
  { name: "United Kingdom", code: "+44", flag: "GB" },
  { name: "United States", code: "+1", flag: "US" },
  { name: "Uzbekistan", code: "+998", flag: "UZ" },
  { name: "Venezuela", code: "+58", flag: "VE" },
  { name: "Vietnam", code: "+84", flag: "VN" },
  { name: "Zimbabwe", code: "+263", flag: "ZW" },
];

export default function ProfileSetupPage({ account, saveProfileOnChain, onComplete, disconnect }: ProfileSetupPageProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCountries = useMemo(() => {
    if (!searchQuery) return COUNTRIES;
    const q = searchQuery.toLowerCase();
    return COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || c.code.includes(q));
  }, [searchQuery]);

  const handleCountrySelect = (c: typeof COUNTRIES[0]) => {
    setCountry(c.name);
    setCountryCode(c.code);
    if (!phone || phone === countryCode) {
      setPhone(c.code + " ");
    } else if (countryCode && phone.startsWith(countryCode)) {
      setPhone(c.code + phone.slice(countryCode.length));
    } else {
      setPhone(c.code + " " + phone);
    }
    setShowDropdown(false);
    setSearchQuery("");
  };

  const handleSubmit = async () => {
    if (!displayName.trim()) {
      toast({ title: "Validation Error", description: "Display Name is required.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await saveProfileOnChain(displayName.trim(), email.trim(), phone.trim(), country.trim());
      toast({ title: "Profile Saved", description: "Your profile has been saved on-chain." });
      onComplete();
    } catch (err: any) {
      toast({ title: "Profile Save Failed", description: err?.reason || err?.message || "Failed to save profile.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" data-testid="page-profile-setup">
      <div className="absolute top-20 -left-40 w-80 h-80 rounded-full bg-cyan-500/8 blur-[100px]" />
      <div className="absolute bottom-20 -right-40 w-80 h-80 rounded-full bg-purple-500/8 blur-[100px]" />

      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-wallet-address">
          <Wallet className="h-4 w-4" />
          {shortenAddress(account)}
        </div>
        <Button variant="ghost" size="icon" onClick={disconnect} data-testid="button-disconnect">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <div className="w-full max-w-md relative z-10 slide-in">
        <div className="glass-card rounded-2xl p-8 space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl gradient-icon flex items-center justify-center pulse-glow">
              <UserCircle className="h-8 w-8 text-amber-300" />
            </div>
            <h1 className="text-2xl font-bold gradient-text" data-testid="text-profile-title" style={{ fontFamily: 'var(--font-display)' }}>Complete Your Profile</h1>
            <p className="text-sm text-muted-foreground" data-testid="text-profile-description">Set up your profile details. Saved on-chain.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Display Name *</label>
              <Input
                type="text"
                placeholder="Enter your display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading}
                className="bg-white/[0.03] border-yellow-600/20"
                data-testid="input-display-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Email</label>
              <Input
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="bg-white/[0.03] border-yellow-600/20"
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2 relative">
              <label className="text-sm text-muted-foreground">Country</label>
              <button
                type="button"
                onClick={() => setShowDropdown(!showDropdown)}
                disabled={loading}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-white/[0.03] border border-yellow-600/20 text-left transition-colors hover:bg-white/[0.06]"
                data-testid="button-country-dropdown"
              >
                <span className={country ? "text-foreground" : "text-muted-foreground"}>
                  {country || "Select your country"}
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showDropdown ? "rotate-180" : ""}`} />
              </button>

              {showDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-yellow-600/20 shadow-2xl overflow-hidden" style={{ background: "hsl(222 47% 8%)", backdropFilter: "blur(30px)" }}>
                  <div className="p-2 border-b border-white/[0.06]">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search country..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 text-sm bg-white/[0.03] border border-yellow-600/15 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-yellow-600/40"
                        data-testid="input-country-search"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {filteredCountries.map((c) => (
                      <button
                        key={c.flag}
                        type="button"
                        onClick={() => handleCountrySelect(c)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 text-sm text-left transition-colors hover:bg-white/[0.06] ${
                          country === c.name ? "bg-yellow-600/10 text-yellow-200" : "text-foreground"
                        }`}
                        data-testid={`option-country-${c.flag}`}
                      >
                        <span>{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.code}</span>
                      </button>
                    ))}
                    {filteredCountries.length === 0 && (
                      <div className="px-3 py-4 text-sm text-muted-foreground text-center">No countries found</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Phone</label>
              <Input
                type="tel"
                placeholder={countryCode ? `${countryCode} your number` : "Enter your phone number"}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
                className="bg-white/[0.03] border-yellow-600/20"
                data-testid="input-phone"
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full glow-button text-white font-bold py-3.5 px-6 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="button-save-profile"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Saving Profile..." : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
