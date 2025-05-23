import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';

// Define the sensor data interface based on your server's data structure
export interface SensorData {
  deviceId: string | null;
  deviceType: string | null;
  heartRate: number | null;
  boxingHand: string | null;
  boxingPunchType: string | null;
  boxingPower: number | null;
  boxingSpeed: number | null;
  cadenceWheel: number | null;
  sosAlert: boolean;
  battery: number | null;
  steps: number | null;
  calories: number | null;
  temperature: number | null;
  oxygen: number | null;
  lastUpdated: string | null;
}

class SocketService {
  private socket: Socket | null = null;
  private serverUrl: string = Platform.select({
    ios: 'http://fitnessserver2-production.up.railway.app',
    android: 'http://fitnessserver2-production.up.railway.app', // Android emulator localhost
    default: 'http://fitnessserver2-production.up.railway.app',
  });

  // Callbacks for data updates
  private onDataUpdateCallbacks: ((data: SensorData) => void)[] = [];
  private onConnectionStatusCallbacks: ((status: boolean) => void)[] = [];

  connect() {
    if (this.socket?.connected) return;

    this.socket = io(this.serverUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.notifyConnectionStatus(true);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.notifyConnectionStatus(false);
    });

    this.socket.on('sensorData', (data: SensorData) => {
      this.notifyDataUpdate(data);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.notifyConnectionStatus(false);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Subscribe to data updates
  onDataUpdate(callback: (data: SensorData) => void) {
    this.onDataUpdateCallbacks.push(callback);
    return () => {
      this.onDataUpdateCallbacks = this.onDataUpdateCallbacks.filter(cb => cb !== callback);
    };
  }

  // Subscribe to connection status updates
  onConnectionStatus(callback: (status: boolean) => void) {
    this.onConnectionStatusCallbacks.push(callback);
    return () => {
      this.onConnectionStatusCallbacks = this.onConnectionStatusCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifyDataUpdate(data: SensorData) {
    this.onDataUpdateCallbacks.forEach(callback => callback(data));
  }

  private notifyConnectionStatus(status: boolean) {
    this.onConnectionStatusCallbacks.forEach(callback => callback(status));
  }

  // Method to manually send data to server
  sendData(data: Partial<SensorData>) {
    if (this.socket?.connected) {
      this.socket.emit('sensorData', data);
    }
  }
}

// Create a singleton instance
export const socketService = new SocketService(); 