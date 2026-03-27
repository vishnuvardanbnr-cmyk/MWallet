import { useState, useRef, useEffect } from "react";
import { HelpCircle, Mail, ChevronDown, Plus, Send, ArrowLeft, MessageCircle, Clock, CheckCircle2, AlertCircle, Loader2, Ticket } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PACKAGE_NAMES, PACKAGE_PRICES_USD } from "@/lib/contract";
import { useSupportWs } from "@/hooks/use-support-ws";
import type { SupportTicket, TicketMessage } from "@shared/schema";

const ADMIN_WALLET = "0x04e8c5b49de683c5b44ef1269bd5ee4f338868c4";

const faqs = [
  {
    question: "How do I register?",
    answer: "To register, connect your MetaMask wallet on BNB Smart Chain. You will need a sponsor ID and a binary parent ID. Your sponsor provides the referral link containing these details. Once connected, follow the on-screen registration process and approve the required token transaction.",
  },
  {
    question: "What are the package tiers?",
    answer: `There are 5 package tiers available: ${PACKAGE_NAMES.slice(1).map((name, i) => `${name} ($${PACKAGE_PRICES_USD[i + 1]})`).join(", ")}. Higher packages unlock greater income limits and earning potential. You can upgrade your package at any time.`,
  },
  {
    question: "How does binary matching income work?",
    answer: "Binary matching income is calculated by matching the business volume on your left and right legs. The system pairs the lesser leg volume against the greater and calculates your binary commission based on the matched amount. Unmatched volume carries forward to the next cycle.",
  },
  {
    question: "What is the BTC Reward Pool?",
    answer: "The BTC Reward Pool accumulates 10% from every withdrawal made by users. Once your BTC pool balance reaches the $50 threshold, you can enter Board Pool Level 1. The board pool operates a matrix system where participants earn rewards as the matrix fills up and cycles.",
  },
  {
    question: "How do withdrawals work?",
    answer: "You can withdraw your wallet balance at any time. A 10% withdrawal matching fee is deducted and distributed to upline sponsors, and an additional 10% is allocated to the BTC Reward Pool. The remaining 80% is transferred directly to your wallet as USDT.",
  },
  {
    question: "What is the grace period?",
    answer: "The grace period is a status assigned to accounts that have been inactive beyond the allowed time frame. During this period, certain earning functions may be limited. To restore full active status, you may need to repurchase or upgrade your package.",
  },
];

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "account", label: "Account" },
  { value: "staking", label: "Staking" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "technical", label: "Technical" },
  { value: "other", label: "Other" },
];

function getStatusColor(status: string) {
  switch (status) {
    case "open": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
    case "in_progress": return "text-blue-400 bg-blue-500/10 border-blue-500/20";
    case "closed": return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    default: return "text-gray-400 bg-gray-500/10 border-gray-500/20";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "open": return <AlertCircle className="h-3 w-3" />;
    case "in_progress": return <Clock className="h-3 w-3" />;
    case "closed": return <CheckCircle2 className="h-3 w-3" />;
    default: return <Clock className="h-3 w-3" />;
  }
}

function formatTime(date: string | Date) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

interface SupportProps {
  account: string;
  isAdmin?: boolean;
}

function NewTicketForm({ onSubmit, onCancel }: { onSubmit: (subject: string, category: string, message: string, priority: string) => void; onCancel: () => void }) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("normal");

  const handleSubmit = () => {
    if (!subject.trim() || !message.trim()) return;
    onSubmit(subject.trim(), category, message.trim(), priority);
  };

  return (
    <div className="glass-card rounded-2xl p-6 slide-in gradient-border" data-testid="card-new-ticket">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-9 w-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
          <Plus className="h-4 w-4 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }}>New Support Ticket</h2>
          <p className="text-xs text-muted-foreground">Describe your issue and we'll help you out</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Subject</label>
          <Input
            placeholder="Brief description of your issue"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="bg-white/[0.03] border-yellow-600/20"
            data-testid="input-ticket-subject"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Category</label>
            <Select value={category} onValueChange={setCategory} data-testid="select-ticket-category">
              <SelectTrigger className="bg-white/[0.03] border-yellow-600/20" data-testid="select-ticket-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value} data-testid={`category-option-${c.value}`}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Priority</label>
            <Select value={priority} onValueChange={setPriority} data-testid="select-ticket-priority">
              <SelectTrigger className="bg-white/[0.03] border-yellow-600/20" data-testid="select-ticket-priority">
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low" data-testid="priority-option-low">Low</SelectItem>
                <SelectItem value="normal" data-testid="priority-option-normal">Normal</SelectItem>
                <SelectItem value="high" data-testid="priority-option-high">High</SelectItem>
                <SelectItem value="urgent" data-testid="priority-option-urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Message</label>
          <textarea
            placeholder="Describe your issue in detail..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded-md bg-white/[0.03] border border-yellow-600/20 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            data-testid="input-ticket-message"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 rounded-xl border border-yellow-600/20 text-sm font-medium text-muted-foreground hover:bg-white/[0.03] transition-colors"
            data-testid="button-cancel-ticket"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!subject.trim() || !message.trim()}
            className="flex-1 glow-button text-white font-bold py-2.5 px-4 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="button-submit-ticket"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <Send className="h-4 w-4" />
            Submit Ticket
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatView({ messages, ticket, account, onSend, onBack, onClose, onReopen, isAdmin }: {
  messages: TicketMessage[];
  ticket: SupportTicket;
  account: string;
  onSend: (msg: string) => void;
  onBack: () => void;
  onClose: (id: number) => void;
  onReopen: (id: number) => void;
  isAdmin: boolean;
}) {
  const [input, setInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden slide-in gradient-border flex flex-col" style={{ height: "calc(100vh - 220px)", minHeight: "400px" }} data-testid="card-chat">
      <div className="p-4 border-b border-yellow-600/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="h-8 w-8 rounded-lg bg-white/[0.05] flex items-center justify-center hover:bg-white/[0.08] transition-colors"
            data-testid="button-back-tickets"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-ticket-subject">{ticket.subject}</h3>
              <Badge variant="outline" className={`text-[10px] ${getStatusColor(ticket.status)}`} data-testid="badge-ticket-status">
                {getStatusIcon(ticket.status)}
                <span className="ml-1">{ticket.status.replace("_", " ")}</span>
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Ticket #{ticket.id} &middot; {ticket.category} &middot; {formatTime(ticket.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isAdmin && ticket.status !== "closed" && (
            <button
              onClick={() => onClose(ticket.id)}
              className="text-[11px] px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
              data-testid="button-close-ticket"
            >
              Close Ticket
            </button>
          )}
          {ticket.status === "closed" && (
            <button
              onClick={() => onReopen(ticket.id)}
              className="text-[11px] px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
              data-testid="button-reopen-ticket"
            >
              Reopen
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="chat-messages">
        {messages.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No messages yet</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.senderWallet.toLowerCase() === account.toLowerCase();
          const isAdminMsg = msg.senderRole === "admin";
          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`} data-testid={`message-${msg.id}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                isMe
                  ? "bg-gradient-to-r from-amber-600/20 to-yellow-500/20 border border-yellow-600/20"
                  : isAdminMsg
                    ? "bg-gradient-to-r from-emerald-600/20 to-amber-400/10 border border-emerald-500/20"
                    : "bg-white/[0.05] border border-white/[0.08]"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-medium ${isAdminMsg ? "text-emerald-400" : "text-yellow-300"}`}>
                    {isAdminMsg ? "Support Team" : isMe ? "You" : "User"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {ticket.status !== "closed" && (
        <div className="p-3 border-t border-yellow-600/10">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="Type your message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="bg-white/[0.03] border-yellow-600/20"
              data-testid="input-chat-message"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="glow-button text-white px-4 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center"
              data-testid="button-send-message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TicketList({ tickets, onSelect, onNewTicket, isAdmin = false }: { tickets: SupportTicket[]; onSelect: (id: number) => void; onNewTicket: () => void; isAdmin?: boolean }) {
  return (
    <div className="glass-card rounded-2xl p-6 slide-in gradient-border" style={{ animationDelay: '0.15s' }} data-testid="card-tickets">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-yellow-600/15 flex items-center justify-center">
            <Ticket className="h-4 w-4 text-yellow-300" />
          </div>
          <div>
            <h2 className="text-lg font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }}>My Tickets</h2>
            <p className="text-xs text-muted-foreground">{tickets.length} ticket{tickets.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <button
          onClick={onNewTicket}
          className="glow-button text-white text-sm font-medium py-2 px-4 rounded-xl transition-all flex items-center gap-2"
          data-testid="button-new-ticket"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <Plus className="h-4 w-4" />
          New Ticket
        </button>
      </div>

      {tickets.length === 0 ? (
        <div className="text-center py-8" data-testid="text-no-tickets">
          <MessageCircle className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No tickets yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Create a new ticket to get help from our support team</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => onSelect(ticket.id)}
              className="w-full p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-transparent hover:border-yellow-600/10 transition-all text-left group"
              data-testid={`ticket-item-${ticket.id}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium group-hover:text-yellow-200 transition-colors">{ticket.subject}</span>
                  <Badge variant="outline" className={`text-[9px] ${getStatusColor(ticket.status)}`}>
                    {getStatusIcon(ticket.status)}
                    <span className="ml-1">{ticket.status.replace("_", " ")}</span>
                  </Badge>
                </div>
                <span className="text-[10px] text-muted-foreground">{formatTime(ticket.updatedAt)}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-muted-foreground">#{ticket.id}</span>
                <span className="text-[11px] text-muted-foreground/50">&middot;</span>
                <span className="text-[11px] text-muted-foreground capitalize">{ticket.category}</span>
                {isAdmin && (
                  <>
                    <span className="text-[11px] text-muted-foreground/50">&middot;</span>
                    <span className="text-[11px] font-mono text-yellow-300/70">{ticket.walletAddress.slice(0, 6)}...{ticket.walletAddress.slice(-4)}</span>
                  </>
                )}
                {ticket.priority === "high" || ticket.priority === "urgent" ? (
                  <>
                    <span className="text-[11px] text-muted-foreground/50">&middot;</span>
                    <span className={`text-[11px] ${ticket.priority === "urgent" ? "text-red-400" : "text-orange-400"}`}>
                      {ticket.priority}
                    </span>
                  </>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Support({ account, isAdmin = false }: SupportProps) {
  const [view, setView] = useState<"list" | "new" | "chat">("list");
  const ws = useSupportWs(account, isAdmin);

  const activeTicket = ws.tickets.find(t => t.id === ws.activeTicketId);

  useEffect(() => {
    if (ws.ticketCreated && ws.activeTicketId) {
      setView("chat");
    }
  }, [ws.ticketCreated, ws.activeTicketId]);

  const handleSelectTicket = (id: number) => {
    ws.joinTicket(id);
    setView("chat");
  };

  const handleBack = () => {
    ws.leaveTicket();
    ws.loadTickets();
    setView("list");
  };

  const handleCreateTicket = (subject: string, category: string, message: string, priority: string) => {
    ws.createTicket(subject, category, message, priority);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      <div className="slide-in">
        <h1 className="text-2xl font-bold gradient-text" data-testid="text-support-title" style={{ fontFamily: 'var(--font-display)' }}>Help & Support</h1>
        <p className="text-muted-foreground text-sm">
          {view === "chat" ? "Live chat with support" : "Get help with your account"}
          {ws.connected && (
            <span className="inline-flex items-center gap-1 ml-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-emerald-400">Live</span>
            </span>
          )}
        </p>
      </div>

      {view === "list" && (
        <>
          <TicketList
            tickets={ws.tickets}
            onSelect={handleSelectTicket}
            onNewTicket={() => setView("new")}
            isAdmin={isAdmin}
          />

          <div className="glass-card rounded-2xl p-6 slide-in" style={{ animationDelay: '0.2s' }} data-testid="card-faq">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-9 w-9 rounded-xl gradient-icon flex items-center justify-center">
                <HelpCircle className="h-4 w-4 text-yellow-300" />
              </div>
              <div>
                <h2 className="text-lg font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }}>FAQ</h2>
                <p className="text-xs text-muted-foreground">Common questions about the platform</p>
              </div>
            </div>
            <Accordion type="single" collapsible className="w-full" data-testid="accordion-faq">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`} className="border-yellow-600/10" data-testid={`faq-item-${index}`}>
                  <AccordionTrigger className="text-sm hover:no-underline" data-testid={`faq-trigger-${index}`}>{faq.question}</AccordionTrigger>
                  <AccordionContent data-testid={`faq-content-${index}`}>
                    <p className="text-muted-foreground text-sm">{faq.answer}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </>
      )}

      {view === "new" && (
        <NewTicketForm
          onSubmit={handleCreateTicket}
          onCancel={() => setView("list")}
        />
      )}

      {view === "chat" && activeTicket && (
        <ChatView
          messages={ws.messages}
          ticket={activeTicket}
          account={account}
          onSend={ws.sendMessage}
          onBack={handleBack}
          onClose={ws.closeTicket}
          onReopen={ws.reopenTicket}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
