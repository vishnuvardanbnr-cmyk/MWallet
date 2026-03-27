import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { storage } from "./storage";

const ADMIN_WALLET = "0x04e8c5b49de683c5b44ef1269bd5ee4f338868c4";

interface WSClient {
  ws: WebSocket;
  walletAddress: string;
  ticketId?: number;
}

const clients: Map<string, WSClient[]> = new Map();

function getClientsForTicket(ticketId: number): WSClient[] {
  const result: WSClient[] = [];
  clients.forEach((userClients) => {
    for (const client of userClients) {
      if (client.ticketId === ticketId && client.ws.readyState === WebSocket.OPEN) {
        result.push(client);
      }
    }
  });
  return result;
}

function getAdminClients(): WSClient[] {
  const adminClients = clients.get(ADMIN_WALLET.toLowerCase()) || [];
  return adminClients.filter(c => c.ws.readyState === WebSocket.OPEN);
}

function broadcast(ticketId: number, data: any, excludeWallet?: string) {
  const msg = JSON.stringify(data);
  const ticketClients = getClientsForTicket(ticketId);
  for (const client of ticketClients) {
    if (excludeWallet && client.walletAddress === excludeWallet) continue;
    client.ws.send(msg);
  }
  const admins = getAdminClients();
  for (const admin of admins) {
    if (admin.ticketId !== ticketId && data.type !== "ticket_created") continue;
    if (excludeWallet && admin.walletAddress === excludeWallet) continue;
    admin.ws.send(msg);
  }
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws/support" });

  wss.on("connection", (ws) => {
    let clientInfo: WSClient | null = null;

    ws.on("message", async (raw) => {
      try {
        const data = JSON.parse(raw.toString());

        switch (data.type) {
          case "auth": {
            const wallet = data.walletAddress?.toLowerCase();
            if (!wallet) return;
            clientInfo = { ws, walletAddress: wallet };
            if (!clients.has(wallet)) clients.set(wallet, []);
            clients.get(wallet)!.push(clientInfo);
            ws.send(JSON.stringify({ type: "auth_ok" }));
            break;
          }

          case "join_ticket": {
            if (!clientInfo) return;
            clientInfo.ticketId = data.ticketId;
            ws.send(JSON.stringify({ type: "joined_ticket", ticketId: data.ticketId }));
            break;
          }

          case "leave_ticket": {
            if (!clientInfo) return;
            clientInfo.ticketId = undefined;
            break;
          }

          case "create_ticket": {
            if (!clientInfo) return;
            const ticket = await storage.createTicket({
              walletAddress: clientInfo.walletAddress,
              subject: data.subject,
              category: data.category || "general",
              status: "open",
              priority: data.priority || "normal",
            });
            const firstMsg = await storage.addTicketMessage({
              ticketId: ticket.id,
              senderWallet: clientInfo.walletAddress,
              senderRole: "user",
              message: data.message,
            });
            clientInfo.ticketId = ticket.id;
            ws.send(JSON.stringify({ type: "ticket_created", ticket, message: firstMsg }));
            for (const admin of getAdminClients()) {
              admin.ws.send(JSON.stringify({ type: "ticket_created", ticket, message: firstMsg }));
            }
            break;
          }

          case "send_message": {
            if (!clientInfo || !data.ticketId) return;
            const ticket = await storage.getTicket(data.ticketId);
            if (!ticket) return;
            const isAdmin = clientInfo.walletAddress === ADMIN_WALLET.toLowerCase();
            const isOwner = ticket.walletAddress === clientInfo.walletAddress;
            if (!isAdmin && !isOwner) return;

            const message = await storage.addTicketMessage({
              ticketId: data.ticketId,
              senderWallet: clientInfo.walletAddress,
              senderRole: isAdmin ? "admin" : "user",
              message: data.message,
            });

            if (ticket.status === "open" && isAdmin) {
              await storage.updateTicketStatus(data.ticketId, "in_progress");
            }

            const payload = { type: "new_message", message, ticketId: data.ticketId };
            ws.send(JSON.stringify(payload));
            broadcast(data.ticketId, payload, clientInfo.walletAddress);

            if (isAdmin) {
              const ownerClients = clients.get(ticket.walletAddress) || [];
              for (const oc of ownerClients) {
                if (oc.ws.readyState === WebSocket.OPEN && oc.ticketId !== data.ticketId) {
                  oc.ws.send(JSON.stringify({ type: "ticket_updated", ticketId: data.ticketId }));
                }
              }
            } else {
              for (const admin of getAdminClients()) {
                if (admin.ticketId !== data.ticketId) {
                  admin.ws.send(JSON.stringify({ type: "ticket_updated", ticketId: data.ticketId }));
                }
              }
            }
            break;
          }

          case "close_ticket": {
            if (!clientInfo || !data.ticketId) return;
            const isAdmin = clientInfo.walletAddress === ADMIN_WALLET.toLowerCase();
            if (!isAdmin) return;
            const updated = await storage.updateTicketStatus(data.ticketId, "closed");
            if (updated) {
              const payload = { type: "ticket_closed", ticket: updated };
              broadcast(data.ticketId, payload);
              ws.send(JSON.stringify(payload));
            }
            break;
          }

          case "reopen_ticket": {
            if (!clientInfo || !data.ticketId) return;
            const updated = await storage.updateTicketStatus(data.ticketId, "open");
            if (updated) {
              const payload = { type: "ticket_reopened", ticket: updated };
              broadcast(data.ticketId, payload);
              ws.send(JSON.stringify(payload));
            }
            break;
          }
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    });

    ws.on("close", () => {
      if (clientInfo) {
        const userClients = clients.get(clientInfo.walletAddress);
        if (userClients) {
          const idx = userClients.indexOf(clientInfo);
          if (idx >= 0) userClients.splice(idx, 1);
          if (userClients.length === 0) clients.delete(clientInfo.walletAddress);
        }
      }
    });
  });

  return wss;
}
