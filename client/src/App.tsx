import { useState, useEffect, useCallback } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useWeb3 } from "@/hooks/use-web3";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PACKAGE_NAMES } from "@/lib/contract";
import { Logo } from "@/components/logo";
import { MobileNav } from "@/components/mobile-nav";

import RegisterPage from "@/pages/register";
import ActivatePage from "@/pages/activate";
import ProfileSetupPage from "@/pages/profile-setup";
import DashboardPage from "@/pages/dashboard";
import IncomePage from "@/pages/income";
import WalletPage from "@/pages/wallet";
import TeamPage from "@/pages/team";
import TransactionsPage from "@/pages/transactions";
import SettingsPage from "@/pages/settings";
import SupportPage from "@/pages/support";
import BoardPage from "@/pages/board";
import BinaryDetailsPage from "@/pages/binary-details";
import StakingPage from "@/pages/staking";
import DeepPlacementPage from "@/pages/deep-placement";
import StorePage from "@/pages/store";
import SwapPage from "@/pages/swap";
import PaidStakingPage from "@/pages/paid-staking";
import MusdtStakingPage from "@/pages/musdt-staking";
import SellTokensPage from "@/pages/sell-tokens";

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    const main = document.querySelector("main");
    if (main) main.scrollTop = 0;
  }, [location]);
  return null;
}

function ConnectScreen({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-600/4 via-yellow-600/3 to-amber-800/4" />
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-amber-600/[0.06] blur-[180px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-yellow-600/[0.04] blur-[150px] pointer-events-none" />
      <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-amber-500/[0.04] blur-[120px] pointer-events-none" />

      <div className="text-center space-y-8 max-w-md relative z-10 slide-in">
        <div className="floating">
          <div className="flex justify-center" data-testid="text-connect-title">
            <Logo size="lg" />
          </div>
        </div>

        <div className="premium-card rounded-2xl p-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="gradient-text">Welcome to M-Vault</span>
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Connect your MetaMask wallet to start earning on BNB Smart Chain.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 py-2">
            <div className="text-center" data-testid="text-stat-packages">
              <div className="text-lg font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }}>6</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Packages</div>
            </div>
            <div className="text-center border-x border-white/[0.06]" data-testid="text-stat-max-earn">
              <div className="text-lg font-bold gradient-text-gold" style={{ fontFamily: 'var(--font-display)' }}>5x</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Max Earn</div>
            </div>
            <div className="text-center" data-testid="text-stat-rewards">
              <div className="text-lg font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }}>USDT+BTC</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Rewards</div>
            </div>
          </div>

          <button
            onClick={onConnect}
            className="w-full glow-button text-white font-bold py-4 px-6 rounded-xl text-base transition-all flex items-center justify-center gap-2"
            data-testid="button-connect-wallet"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <Wallet className="w-5 h-5" />
            Connect Wallet
          </button>
          <p className="text-[11px] text-muted-foreground/50">Secure, decentralized access via MetaMask</p>
        </div>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute top-20 -left-40 w-80 h-80 rounded-full bg-purple-500/5 blur-[100px]" />
      <div className="absolute bottom-20 -right-40 w-80 h-80 rounded-full bg-amber-500/5 blur-[100px]" />
      <div className="text-center space-y-4 slide-in">
        <div className="w-16 h-16 mx-auto rounded-2xl gradient-icon flex items-center justify-center pulse-glow">
          <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-sm text-muted-foreground">Loading your account...</p>
      </div>
    </div>
  );
}

function App() {
  const web3 = useWeb3();
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const checkProfile = useCallback(async (walletAddress: string) => {
    setProfileLoading(true);
    try {
      const res = await fetch(`/api/profiles/${walletAddress.toLowerCase()}`);
      setHasProfile(res.ok);
    } catch {
      setHasProfile(false);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (web3.account && web3.isRegistered && web3.profileOnChain) {
      setHasProfile(web3.profileOnChain.profileSet);
    } else if (web3.account && web3.isRegistered) {
      checkProfile(web3.account);
    } else {
      setHasProfile(null);
    }
  }, [web3.account, web3.isRegistered, web3.profileOnChain, checkProfile]);

  const disconnect = () => window.location.reload();

  const getFlowStep = () => {
    if (!web3.account) return "connect";
    const isInitialLoad = !web3.initialLoaded;
    if ((isInitialLoad && web3.loading) || profileLoading || (web3.isRegistered && hasProfile === null)) return "loading";
    if (!web3.isRegistered) return "register";
    if (!web3.userInfo || web3.userInfo.userPackage === 0) return "activate";
    if (!web3.incomeInfo || !web3.binaryInfo) {
      return "loading";
    }
    if (!hasProfile) return "profile";
    return "dashboard";
  };

  const currentStep = getFlowStep();

  if (currentStep === "connect") {
    return (
      <ThemeProvider>
        <Toaster />
        <ConnectScreen onConnect={web3.connect} />
      </ThemeProvider>
    );
  }

  if (currentStep === "loading") {
    return (
      <ThemeProvider>
        <Toaster />
        <LoadingScreen />
      </ThemeProvider>
    );
  }

  if (currentStep === "register") {
    return (
      <ThemeProvider>
        <Toaster />
        <RegisterPage
          account={web3.account!}
          register={web3.register}
          totalUsers={web3.totalUsers}
          disconnect={disconnect}
        />
      </ThemeProvider>
    );
  }

  if (currentStep === "activate") {
    return (
      <ThemeProvider>
        <Toaster />
        <ActivatePage
          account={web3.account!}
          approveToken={web3.approveToken}
          activatePackage={web3.activatePackage}
          fetchUserData={web3.fetchUserData}
          disconnect={disconnect}
        />
      </ThemeProvider>
    );
  }

  if (currentStep === "profile") {
    return (
      <ThemeProvider>
        <Toaster />
        <ProfileSetupPage
          account={web3.account!}
          saveProfileOnChain={web3.saveProfileOnChain}
          onComplete={() => setHasProfile(true)}
          disconnect={disconnect}
        />
      </ThemeProvider>
    );
  }

  const userId = web3.userInfo ? web3.userInfo.userId.toString() : "0";

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <SidebarProvider style={sidebarStyle as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar
                account={web3.account!}
                userId={userId}
                disconnect={disconnect}
              />
              <div className="flex flex-col flex-1 overflow-hidden">
                <header className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-purple-500/10 sticky top-0 z-50 backdrop-blur-xl bg-background/80">
                  <Logo size="sm" />
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20" data-testid="badge-connected-status">
                      <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[11px] font-medium text-emerald-400">
                        {web3.account ? `${web3.account.slice(0, 6)}...${web3.account.slice(-4)}` : "Connected"}
                      </span>
                    </div>
                    <SidebarTrigger data-testid="button-sidebar-toggle" />
                  </div>
                </header>
                <main className="flex-1 overflow-y-auto relative pb-16 md:pb-0">
                  <ScrollToTop />
                  <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/3 rounded-full blur-[100px] pointer-events-none" />
                  <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/3 rounded-full blur-[100px] pointer-events-none" />
                  <Switch>
                    <Route path="/">
                      <DashboardPage
                        userInfo={web3.userInfo!}
                        incomeInfo={web3.incomeInfo!}
                        binaryInfo={web3.binaryInfo!}
                        btcPoolBalance={web3.btcPoolBalance}
                        formatAmount={web3.formatAmount}
                        account={web3.account!}
                        profileOnChain={web3.profileOnChain}
                        getTransactionsFromContract={web3.getTransactionsFromContract}
                        approveToken={web3.approveToken}
                        reactivatePackage={web3.reactivatePackage}
                        repurchase={web3.repurchase}
                        tokenDecimals={web3.tokenDecimals}
                      />
                    </Route>
                    <Route path="/income">
                      <IncomePage
                        incomeInfo={web3.incomeInfo!}
                        binaryInfo={web3.binaryInfo!}
                        slabInfo={web3.slabInfo}
                        userPackage={web3.userInfo!.userPackage}
                        formatAmount={web3.formatAmount}
                        getTransactionsFromContract={web3.getTransactionsFromContract}
                        getBinaryFlushedEvents={web3.getBinaryFlushedEvents}
                        claimBinaryIncome={web3.claimBinaryIncome}
                      />
                    </Route>
                    <Route path="/binary">
                      <BinaryDetailsPage
                        incomeInfo={web3.incomeInfo!}
                        binaryInfo={web3.binaryInfo!}
                        slabInfo={web3.slabInfo}
                        formatAmount={web3.formatAmount}
                        tokenDecimals={web3.tokenDecimals}
                        getTransactionsFromContract={web3.getTransactionsFromContract}
                        claimBinaryIncome={web3.claimBinaryIncome}
                      />
                    </Route>
                    <Route path="/wallet">
                      <WalletPage
                        userInfo={web3.userInfo!}
                        account={web3.account!}
                        formatAmount={web3.formatAmount}
                        withdrawFunds={web3.withdrawFunds}
                        getTransactionsFromContract={web3.getTransactionsFromContract}
                      />
                    </Route>
                    <Route path="/team">
                      <TeamPage
                        userInfo={web3.userInfo!}
                        binaryInfo={web3.binaryInfo!}
                        formatAmount={web3.formatAmount}
                        getDirectReferrals={web3.getDirectReferrals}
                        account={web3.account!}
                      />
                    </Route>
                    <Route path="/transactions">
                      <TransactionsPage
                        formatAmount={web3.formatAmount}
                        getTransactionsFromContract={web3.getTransactionsFromContract}
                      />
                    </Route>
                    <Route path="/profile">
                      <SettingsPage
                        account={web3.account!}
                        userInfo={web3.userInfo!}
                        profileOnChain={web3.profileOnChain}
                        saveProfileOnChain={web3.saveProfileOnChain}
                        fetchUserData={web3.fetchUserData}
                      />
                    </Route>
                    <Route path="/board">
                      <BoardPage
                        btcPoolBalance={web3.btcPoolBalance}
                        formatAmount={web3.formatAmount}
                        enterBoardPool={web3.enterBoardPool}
                        account={web3.account!}
                      />
                    </Route>
                    <Route path="/swap">
                      <SwapPage
                        account={web3.account!}
                        formatAmount={web3.formatAmount}
                        tokenDecimals={web3.tokenDecimals}
                        fetchUserData={web3.fetchUserData}
                      />
                    </Route>
                    <Route path="/deep-placement">
                      <DeepPlacementPage
                        userInfo={web3.userInfo!}
                        account={web3.account!}
                      />
                    </Route>
                    <Route path="/staking">
                      <StakingPage account={web3.account!} binaryInfo={web3.binaryInfo} tokenDecimals={web3.tokenDecimals} />
                    </Route>
                    <Route path="/paid-staking">
                      <PaidStakingPage account={web3.account!} />
                    </Route>
                    <Route path="/musdt-staking">
                      <MusdtStakingPage account={web3.account!} binaryInfo={web3.binaryInfo} userInfo={web3.userInfo} />
                    </Route>
                    <Route path="/sell-tokens">
                      <SellTokensPage account={web3.account!} />
                    </Route>
                    <Route path="/store">
                      <StorePage />
                    </Route>
                    <Route path="/support">
                      <SupportPage
                        account={web3.account!}
                        isAdmin={web3.account?.toLowerCase() === "0x127323b3053a901620f8d461c88fc6a7d9c7de2e"}
                      />
                    </Route>
                  </Switch>
                </main>
                <MobileNav />
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
