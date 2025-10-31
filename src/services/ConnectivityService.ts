// services/ConnectivityService.ts
import { Network } from '@capacitor/network';

export class ConnectivityService {
  private isOnline: boolean = true;
  private listeners: ((status: boolean) => void)[] = [];

  async initialize() {
    // Check initial status
    const status = await Network.getStatus();
    this.isOnline = status.connected;

    // Listen for changes
    Network.addListener('networkStatusChange', (status) => {
      this.isOnline = status.connected;
      this.notifyListeners();
      
      if (this.isOnline) {
        this.triggerSync();
      }
    });
  }

  getStatus(): boolean {
    return this.isOnline;
  }

  subscribe(callback: (status: boolean) => void) {
    this.listeners.push(callback);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.isOnline));
  }

  private async triggerSync() {
    // Import and call sync service
    const { SyncService } = await import('./SyncService');
    await SyncService.performSync();
  }
}