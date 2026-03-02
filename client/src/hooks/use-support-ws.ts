import { useState, useEffect, useRef, useCallback } from "react";
import type { SupportTicket, TicketMessage } from "@shared/schema";

type WSMessage =
  | { type: "auth_ok" }
  | { type: "joined_ticket"; ticketId: number }
  | { type: "ticket_created"; ticket: SupportTicket; message: TicketMessage }
  | { type: "new_message"; message: TicketMessage; ticketId: number }
  | { type: "ticket_closed"; ticket: SupportTicket }
  | { type: "ticket_reopened"; ticket: SupportTicket }
  | { type: "ticket_updated"; ticketId: number };

export function useSupportWs(walletAddress: string | null, isAdmin: boolean = false) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<number | null>(null);
  const [ticketCreated, setTicketCreated] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!walletAddress) return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/support`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", walletAddress: walletAddress.toLowerCase() }));
    };

    ws.onmessage = (event) => {
      const data: WSMessage = JSON.parse(event.data);

      switch (data.type) {
        case "auth_ok":
          setConnected(true);
          break;
        case "ticket_created":
          setTickets(prev => [data.ticket, ...prev]);
          setActiveTicketId(data.ticket.id);
          setMessages([data.message]);
          setTicketCreated(true);
          break;
        case "new_message":
          setMessages(prev => [...prev, data.message]);
          break;
        case "ticket_closed":
          setTickets(prev => prev.map(t => t.id === data.ticket.id ? data.ticket : t));
          break;
        case "ticket_reopened":
          setTickets(prev => prev.map(t => t.id === data.ticket.id ? data.ticket : t));
          break;
        case "ticket_updated":
          setTickets(prev => {
            const idx = prev.findIndex(t => t.id === data.ticketId);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], updatedAt: new Date() as any };
              return updated;
            }
            return prev;
          });
          break;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [walletAddress]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const loadTickets = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const url = isAdmin ? `/api/admin/tickets` : `/api/support/tickets?wallet=${walletAddress.toLowerCase()}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTickets(data);
      }
    } catch {}
  }, [walletAddress, isAdmin]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const joinTicket = useCallback(async (ticketId: number) => {
    setActiveTicketId(ticketId);
    setTicketCreated(false);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "join_ticket", ticketId }));
    }
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/messages?wallet=${walletAddress?.toLowerCase()}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch {}
  }, []);

  const leaveTicket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && activeTicketId) {
      wsRef.current.send(JSON.stringify({ type: "leave_ticket" }));
    }
    setActiveTicketId(null);
    setMessages([]);
    setTicketCreated(false);
  }, [activeTicketId]);

  const createTicket = useCallback(async (subject: string, category: string, message: string, priority: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "create_ticket", subject, category, message, priority }));
    } else {
      try {
        const res = await fetch("/api/support/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ walletAddress, subject, category, message, priority }),
        });
        if (res.ok) {
          const data = await res.json();
          setTickets(prev => [data.ticket, ...prev]);
          setActiveTicketId(data.ticket.id);
          setMessages([data.message]);
          setTicketCreated(true);
        }
      } catch {}
    }
  }, [walletAddress]);

  const sendMessage = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && activeTicketId) {
      wsRef.current.send(JSON.stringify({ type: "send_message", ticketId: activeTicketId, message }));
    }
  }, [activeTicketId]);

  const closeTicket = useCallback((ticketId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "close_ticket", ticketId }));
    }
  }, []);

  const reopenTicket = useCallback((ticketId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "reopen_ticket", ticketId }));
    }
  }, []);

  return {
    connected,
    tickets,
    messages,
    activeTicketId,
    ticketCreated,
    joinTicket,
    leaveTicket,
    createTicket,
    sendMessage,
    closeTicket,
    reopenTicket,
    loadTickets,
  };
}
