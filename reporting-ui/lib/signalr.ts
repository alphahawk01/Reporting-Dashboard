import * as signalR from "@microsoft/signalr";

const API_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5165"
    : "https://downloads.premierdata-technology.com";

let hubConnection: signalR.HubConnection | null = null;

export function getHubConnection() {
  if (!hubConnection) {
    hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_URL}/operationsHub`)
      .withAutomaticReconnect()
      .build();

    hubConnection.onreconnecting(() => {
      console.log("🔄 SignalR reconnecting...");
    });

    hubConnection.onreconnected(() => {
      console.log("✅ SignalR reconnected");
    });

    hubConnection.onclose((err) => {
      console.log("❌ SignalR disconnected", err);
    });
  }

  return hubConnection;
}