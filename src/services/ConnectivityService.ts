import SyncService from './SyncService';

class ConnectivityService {
  private isOnline = navigator.onLine;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
  }

  private handleOnline(): void {
    console.log('Connection restored');
    this.isOnline = true;
    this.startAutoSync();
    this.performSync();
  }

  private handleOffline(): void {
    console.log('Connection lost');
    this.isOnline = false;
    this.stopAutoSync();
  }

  private startAutoSync(): void {
    if (this.syncInterval) return;

    // Sync every 5 minutes when online
    this.syncInterval = setInterval(() => {
      if (this.isOnline) {
        this.performSync();
      }
    }, 5 * 60 * 1000);
  }

  private stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async performSync(): Promise<void> {
    if (!this.isOnline) {
      console.log('Cannot sync while offline');
      return;
    }

    try {
      await SyncService.performSync();
    } catch (error) {
      console.error('Sync error:', error);
    }
  }

  getConnectionStatus(): boolean {
    return this.isOnline;
  }

  destroy(): void {
    this.stopAutoSync();
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }
}

export default new ConnectivityService();