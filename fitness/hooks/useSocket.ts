import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

// Use different URLs based on platform
const WS_URL = Platform.select({
  web: 'ws://localhost:9000',
  default: 'ws://10.0.2.2:9000' // For Android emulator
});

interface SensorData {
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

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [sensorData, setSensorData] = useState<SensorData | null>(null);

  useEffect(() => {
    if (!WS_URL) {
      console.error("WebSocket URL not configured for platform");
      return;
    }

    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      console.log("WebSocket connected to", WS_URL);
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'sensor_data') {
          setSensorData(data.data);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      setIsConnected(false);
    };

    socket.onclose = () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
    };

    return () => {
      socket.close();
    };
  }, []);

  return { isConnected, sensorData };
} 