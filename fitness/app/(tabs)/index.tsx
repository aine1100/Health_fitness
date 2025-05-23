import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
import { BleManager, Device, Characteristic, State } from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import Modal from "react-native-modal";
import axios from "axios";
import { useSocket } from "../../hooks/useSocket";

// Backend API URL
const API_URL = Platform.select({
  web: 'http://13.51.250.12:5000',
  default: 'http://13.51.250.12:5000' // For Android emulator
});

const WS_URL = Platform.select({
  web: 'ws://13.51.250.12:5000',
  default: 'ws://13.51.250.12:5000' // For Android emulator
});

// AsyncStorage keys
const HUB_ID_KEY = "lastConnectedHub";

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

interface ConnectedDevice {
  id: string;
  type: string;
  name: string;
  connected: boolean;
  hubId: string;
  lastSeen: Date;
  data?: SensorData;
}

// Initialize BLE manager only on native platforms
let bleManager: BleManager | null = null;
if (Platform.OS !== 'web') {
  try {
    bleManager = new BleManager();
    console.log("BleManager initialized successfully");
  } catch (error) {
    console.error("Failed to initialize BleManager:", error);
  }
}

export default function HomeScreen() {
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([]);
  const [connectionStatus, setConnectionStatus] = useState("Disconnected from server");
  const [data, setData] = useState<SensorData>({
    heartRate: null,
    boxingHand: null,
    boxingPunchType: null,
    boxingPower: null,
    boxingSpeed: null,
    cadenceWheel: null,
    sosAlert: false,
    battery: null,
    steps: null,
    calories: null,
    temperature: null,
    oxygen: null,
    lastUpdated: null,
  });

  // Socket connection hook
  const { isConnected: isSocketConnected, sensorData: socketData } = useSocket();

  // Initialize WebSocket connection
  useEffect(() => {
    if (!WS_URL) {
      console.error("WebSocket URL not configured for platform");
      setConnectionStatus("Server URL not configured");
      return;
    }

    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      console.log("WebSocket connected to", WS_URL);
      setConnectionStatus("Connected to server");
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'devices') {
          setConnectedDevices(message.data);
          if (message.data && message.data.length > 0) {
            setData(prev => ({
              ...prev,
              ...(message.data[0].latest_data ? message.data[0].latest_data[0] : {}),
              lastUpdated: new Date().toISOString(),
            }));
          }
        } else if (message.type === 'device_data_update') {
          console.log("Received device_data_update, but using 'devices' message for updates.", message.data);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      setConnectionStatus("Server connection error");
    };

    socket.onclose = () => {
      console.log("WebSocket disconnected");
      setConnectionStatus("Disconnected from server");
      setConnectedDevices([]);
      setData({
        heartRate: null,
        boxingHand: null,
        boxingPunchType: null,
        boxingPower: null,
        boxingSpeed: null,
        cadenceWheel: null,
        sosAlert: false,
        battery: null,
        steps: null,
        calories: null,
        temperature: null,
        oxygen: null,
        lastUpdated: null,
      });
    };

    return () => {
      socket.close();
    };
  }, []);

  // Render device item
  const renderDeviceItem = ({ item }: { item: Device }) => (
    <TouchableOpacity
      style={styles.deviceItem}
      onPress={() => connectToHub(item)}
      disabled={connecting || autoConnecting || connectedDevice !== null}
    >
      <Text style={styles.deviceName}>{item.name || "Unknown Device"}</Text>
      <Text style={styles.deviceAddress}>{item.id}</Text>
      <Text style={styles.deviceStatus}>
        RSSI: {item.rssi} | {item.isConnectable ? "Connectable" : "Not Connectable"}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        <Text style={styles.title}>Home</Text>
        <Text style={styles.subtitle}>Welcome to the home screen</Text>

        {/* Connection Status */}
        <View style={styles.connectionStatus}>
          <Text style={styles.statusText}>
            Server Connection: {isSocketConnected ? "Connected" : "Disconnected"}
          </Text>
          {isSocketConnected && socketData && (
            <Text style={styles.statusText}>
              Last Data Update: {data.lastUpdated ? new Date(data.lastUpdated).toLocaleTimeString() : "N/A"}
            </Text>
          )}
        </View>

        {/* Connected Devices List */}
        {connectedDevices.length > 0 && (
          <View style={styles.dataContainer}>
            <Text style={styles.dataTitle}>Connected Devices (from server)</Text>
            {connectedDevices.map((device) => (
              <View key={device.id} style={styles.deviceDataContainer}>
                <Text style={styles.deviceName}>{device.name}</Text>
                <Text style={styles.deviceType}>Type: {device.type}</Text>
                <Text style={styles.deviceStatus}>
                  Last Seen: {device.lastSeen ? new Date(device.lastSeen).toLocaleTimeString() : "N/A"}
                </Text>
                {device.data && (
                  <View style={styles.deviceData}>
                    <Text style={styles.dataText}>Heart Rate: {device.data.heartRate || "N/A"} bpm</Text>
                    <Text style={styles.dataText}>Battery: {device.data.battery || "N/A"}%</Text>
                    {device.data.boxingHand && (
                      <Text style={styles.dataText}>Boxing Hand: {device.data.boxingHand}</Text>
                    )}
                    {device.data.boxingPunchType && (
                      <Text style={styles.dataText}>Punch Type: {device.data.boxingPunchType}</Text>
                    )}
                    {device.data.boxingPower && (
                      <Text style={styles.dataText}>Power: {device.data.boxingPower} kg</Text>
                    )}
                    {device.data.boxingSpeed && (
                      <Text style={styles.dataText}>Speed: {device.data.boxingSpeed} m/s</Text>
                    )}
                    {device.data.cadenceWheel && (
                      <Text style={styles.dataText}>Cadence: {device.data.cadenceWheel} laps</Text>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Hub Sensor Data Display */}
        <View style={styles.dataContainer}>
          <Text style={styles.dataTitle}>Latest Sensor Data (from server)</Text>
          <Text style={styles.dataText}>Heart Rate: {data.heartRate || "N/A"} bpm</Text>
          <Text style={styles.dataText}>Boxing Hand: {data.boxingHand || "N/A"}</Text>
          <Text style={styles.dataText}>Punch Type: {data.boxingPunchType || "N/A"}</Text>
          <Text style={styles.dataText}>Boxing Power: {data.boxingPower || "N/A"} kg</Text>
          <Text style={styles.dataText}>Boxing Speed: {data.boxingSpeed || "N/A"} m/s</Text>
          <Text style={styles.dataText}>Cadence: {data.cadenceWheel || "N/A"} laps</Text>
          <Text style={styles.dataText}>SOS Alert: {data.sosAlert ? "Active" : "Inactive"}</Text>
          <Text style={styles.dataText}>Battery: {data.battery || "N/A"}%</Text>
          <Text style={styles.dataText}>Steps: {data.steps || "N/A"}</Text>
          <Text style={styles.dataText}>Calories: {data.calories || "N/A"} kcal</Text>
          <Text style={styles.dataText}>Temperature: {data.temperature || "N/A"}°C</Text>
          <Text style={styles.dataText}>Oxygen: {data.oxygen || "N/A"}%</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "white",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: "#BBBBBB",
    textAlign: "center",
    marginBottom: 20,
  },
  connectionStatus: {
    backgroundColor: "#1E1E1E",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 16,
    color: "#BBBBBB",
    textAlign: "center",
    marginBottom: 10,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E88E5",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: "#666",
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  disconnectButton: {
    backgroundColor: "#FF4A55",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 10,
    alignItems: "center",
  },
  deviceList: {
    width: "100%",
    maxHeight: 300,
  },
  deviceItem: {
    backgroundColor: "#1E1E1E",
    padding: 15,
    borderRadius: 8,
    marginVertical: 5,
  },
  deviceName: {
    color: "white",
    fontSize: 16,
    fontWeight: "500",
  },
  deviceAddress: {
    color: "#BBBBBB",
    fontSize: 14,
  },
  deviceStatus: {
    color: "#1E88E5",
    fontSize: 14,
    marginTop: 5,
  },
  modal: {
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#1E1E1E",
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  modalText: {
    color: "white",
    fontSize: 16,
    marginTop: 10,
  },
  connectedContainer: {
    alignItems: "center",
    marginTop: 20,
  },
  connectedText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  dataContainer: {
    marginTop: 20,
    backgroundColor: "#1E1E1E",
    padding: 15,
    borderRadius: 8,
    width: "100%",
  },
  dataTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
  },
  dataText: {
    color: "white",
    fontSize: 16,
    marginVertical: 5,
  },
  deviceDataContainer: {
    backgroundColor: "#2A2A2A",
    padding: 15,
    borderRadius: 8,
    marginVertical: 8,
  },
  deviceData: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#3A3A3A",
  },
  deviceType: {
    color: "#BBBBBB",
    fontSize: 14,
    marginTop: 5,
  },
});