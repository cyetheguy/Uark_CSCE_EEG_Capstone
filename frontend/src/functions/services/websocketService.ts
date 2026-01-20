import { getDefaultSession } from '@inrupt/solid-client-authn-browser';

const baseURI = import.meta.env.VITE_BASE_URI;

export class WebSocketService {
  private websocket: WebSocket | null = null;
  private onMessageCallback: ((message: any) => void) | null = null;

  async connect(topic: string, onMessage: (message: any) => void): Promise<void> {
    try {
      this.onMessageCallback = onMessage;
      
      const session = getDefaultSession();
      const websocketURL = await this.getWebsocketLink(topic, session);
      
      this.websocket = new WebSocket(websocketURL, ['solid-0.1']);
      
      this.websocket.addEventListener("open", () => {
        console.log('WebSocket connected');
      });

      this.websocket.addEventListener("message", (message: any) => {
        try {
          const modifiedMessage = JSON.parse(message.data);
          this.onMessageCallback?.(modifiedMessage);
        } catch (error) {
          console.error("Failed to process message:", error);
        }
      });

      this.websocket.addEventListener("error", (error) => {
        console.error("WebSocket error:", error);
      });

      this.websocket.addEventListener("close", () => {
        console.log("WebSocket disconnected");
      });

    } catch (error) {
      console.error("Failed to establish WebSocket connection:", error);
      throw error;
    }
  }

  disconnect(): void {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    this.onMessageCallback = null;
  }

  private async getWebsocketLink(resourceUrl: string, session: any): Promise<string> {
    const response = await session.fetch(`${baseURI}/.notifications/WebSocketChannel2023/`, {
      method: 'POST',
      headers: {
        "content-type": "application/ld+json"
      },
      body: JSON.stringify({
        "@context": ["https://www.w3.org/ns/solid/notification/v1"],
        type: "http://www.w3.org/ns/solid/notifications#WebSocketChannel2023",
        topic: resourceUrl
      })
    });
    
    const jsonResponse = await response.json();
    return jsonResponse['receiveFrom'];
  }
}