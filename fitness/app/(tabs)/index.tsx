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
  web: 'http://localhost:9000',
  default: 'http://10.0.2.2:9000' // For Android emulator
});

const WS_URL = Platform.select({
  web: 'ws://localhost:9000',
  default: 'ws://10.0.2.2:9000' // For Android emulator
});

// CL900 Hub Service UUIDs
const CL900_SERVICE_UUID = "0000FFE0-0000-1000-8000-00805F9B34FB";
const CL900_CHARACTERISTIC_UUID = "0000FFE1-0000-1000-8000-00805F9B34FB";

// AsyncStorage keys
const LAST_DEVICE_KEY = "lastConnectedDevice";
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
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [isBluetoothEnabled, setIsBluetoothEnabled] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [autoConnecting, setAutoConnecting] = useState(false);
  const [hubConnected, setHubConnected] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([]);
  const [connectionStatus, setConnectionStatus] = useState("Disconnected");
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
    };

    return () => {
      socket.close();
    };
  }, []);

  // Check Bluetooth status and attempt auto-connection
  useEffect(() => {
    if (Platform.OS === 'web') {
      setConnectionStatus("Bluetooth not available on web");
      return;
    }

    if (!bleManager) {
      setConnectionStatus("Bluetooth not initialized");
      return;
    }

    const checkBluetoothStatus = async () => {
      try {
        const state = await bleManager.state();
        console.log("Bluetooth state:", state);
        setIsBluetoothEnabled(state === "PoweredOn");
        if (state === "PoweredOn" && !connectedDevice && !autoConnecting) {
          console.log("Bluetooth enabled, attempting auto-connection...");
          autoConnectToHub();
        }
      } catch (error: any) {
        console.error("Bluetooth status check error:", error);
        setConnectionStatus("Bluetooth error: " + (error?.message || "Unknown error"));
      }
    };

    checkBluetoothStatus();

    const subscription = bleManager.onStateChange((state) => {
      console.log("Bluetooth state changed:", state);
      setIsBluetoothEnabled(state === "PoweredOn");
      if (state === "PoweredOn" && !connectedDevice && !autoConnecting) {
        console.log("Bluetooth turned on, attempting auto-connection...");
        autoConnectToHub();
      } else if (state !== "PoweredOn") {
        setConnectionStatus("Bluetooth disabled");
      }
    }, true);

    return () => {
      subscription.remove();
    };
  }, [connectedDevice, autoConnecting]);

  // Request Bluetooth permissions for Android
  const requestBluetoothPermissions = async () => {
    if (Platform.OS === "android") {
      try {
        const permissions =
          Platform.Version >= 31
            ? [
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
              ]
            : [
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
              ];

        const granted = await PermissionsAndroid.requestMultiple(permissions);
        const allGranted = Object.values(granted).every(
          (result) => result === PermissionsAndroid.RESULTS.GRANTED
        );
        
        console.log("Permissions granted:", allGranted, granted);
        
        if (!allGranted) {
          Alert.alert(
            "Permission Required",
            "Bluetooth and location permissions are required to connect to devices. Please enable them in your device settings.",
            [
              {
                text: "Open Settings",
                onPress: () => {
                  if (Platform.OS === 'android') {
                    Linking.openSettings();
                  }
                },
              },
              {
                text: "Cancel",
                style: "cancel",
              },
            ]
          );
          return false;
        }
        return true;
      } catch (error) {
        console.error("Permission request error:", error);
        Alert.alert(
          "Error",
          "Failed to request permissions. Please enable Bluetooth and location permissions manually in your device settings.",
          [
            {
              text: "Open Settings",
              onPress: () => {
                if (Platform.OS === 'android') {
                  Linking.openSettings();
                }
              },
            },
            {
              text: "Cancel",
              style: "cancel",
            },
          ]
        );
        return false;
      }
    }
    return true;
  };

  // Enable Bluetooth
  const enableBluetooth = async () => {
    try {
      if (!bleManager) {
        throw new Error("Bluetooth manager not initialized");
      }

      const state = await bleManager.state();
      if (state === "PoweredOff") {
        Alert.alert(
          "Bluetooth Required",
          "Please enable Bluetooth to connect to devices.",
          [
            {
              text: "Enable Bluetooth",
              onPress: async () => {
                try {
                  if (Platform.OS === 'android') {
                    await Linking.openSettings();
                  } else {
                    // On iOS, we can only direct to settings
                    await Linking.openURL('app-settings:');
                  }
                } catch (error) {
                  console.error("Failed to open Bluetooth settings:", error);
                  Alert.alert("Error", "Failed to open Bluetooth settings. Please enable Bluetooth manually.");
                }
              },
            },
            {
              text: "Cancel",
              style: "cancel",
            },
          ]
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error("Bluetooth enable error:", error);
      Alert.alert("Error", "Failed to check Bluetooth status. Please ensure Bluetooth is enabled.");
      return false;
    }
  };

  // Auto-connect to CL900 hub
  const autoConnectToHub = async () => {
    if (connectedDevice || autoConnecting || scanning) {
      console.log("Auto-connection skipped: already connected or in progress");
      return;
    }

    try {
      setAutoConnecting(true);
      setModalVisible(true);
      console.log("Starting auto-connection scan for CL900 hub...");

      if (!bleManager) {
        throw new Error("Bluetooth manager not initialized");
      }

      // First check and request permissions
      const hasPermissions = await requestBluetoothPermissions();
      if (!hasPermissions) {
        throw new Error("Bluetooth permissions not granted");
      }

      // Then check and enable Bluetooth
      const isBluetoothEnabled = await enableBluetooth();
      if (!isBluetoothEnabled) {
        throw new Error("Bluetooth is not enabled");
      }

      // Get last connected hub ID
      const lastHubId = await AsyncStorage.getItem(HUB_ID_KEY);
      console.log("Last connected hub ID:", lastHubId);

      let foundHub: Device | null = null;
      const discoveredDevices = new Map<string, Device>();

      bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error("Auto-connection scan error:", error);
          setAutoConnecting(false);
          setModalVisible(false);
          Alert.alert(
            "Connection Error",
            `Failed to scan: ${error.message}. Please ensure Bluetooth is enabled and try again.`
          );
          return;
        }

        if (device && device.name && device.name.includes("CL900")) {
          console.log("Discovered CL900 hub:", {
            id: device.id,
            name: device.name,
            rssi: device.rssi,
          });
          discoveredDevices.set(device.id, device);

          if (!foundHub && (device.id === lastHubId || !lastHubId)) {
            foundHub = device;
            bleManager.stopDeviceScan();
            connectToHub(device);
          }
        }
      });

      // Scan for 10 seconds
      setTimeout(() => {
        bleManager.stopDeviceScan();
        setAutoConnecting(false);
        setModalVisible(false);
        if (!foundHub) {
          console.log("Auto-connection failed: no CL900 hub found");
          setDevices(Array.from(discoveredDevices.values()));
          Alert.alert(
            "No CL900 Hub Found",
            "Could not find a CL900 hub. Please ensure:\n\n" +
            "1. The hub is powered on\n" +
            "2. The hub is in range\n" +
            "3. The hub is in pairing mode\n\n" +
            "Try scanning again or check the hub's status.",
            [
              {
                text: "Try Again",
                onPress: autoConnectToHub,
              },
              {
                text: "Cancel",
                style: "cancel",
              },
            ]
          );
        }
      }, 10000);
    } catch (error) {
      console.error("Auto-connection error:", error);
      Alert.alert(
        "Connection Error",
        `Failed to connect: ${(error as Error).message}. Please check your Bluetooth settings and try again.`
      );
      setAutoConnecting(false);
      setModalVisible(false);
    }
  };

  // Connect to CL900 hub
  const connectToHub = async (device: Device) => {
    try {
      console.log("Connecting to CL900 hub:", device.name);
      setConnecting(true);
      setModalVisible(true);

      if (!bleManager) {
        throw new Error("Bluetooth manager not initialized");
      }

      bleManager.stopDeviceScan();
      const connectedDevice = await device.connect();
      await connectedDevice.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connectedDevice);
      setHubConnected(true);

      // Store hub ID in AsyncStorage
      await AsyncStorage.setItem(HUB_ID_KEY, device.id);
      console.log("Stored hub ID:", device.id);

      // Notify server about hub connection
      await axios.post(`${API_URL}/api/sensor/ble`, {
        type: "hub_connect",
        hubId: device.id,
        deviceId: device.id,
        deviceType: "CL900",
        name: device.name || "CL900 Hub",
      });

      // Monitor CL900 characteristic
      await connectedDevice.monitorCharacteristicForService(
        CL900_SERVICE_UUID,
        CL900_CHARACTERISTIC_UUID,
        (error, characteristic) => {
          if (error) {
            console.error("Monitor error:", error);
            return;
          }
          if (characteristic?.value) {
            const parsedData = parseCL900Data(characteristic.value);
            setData(prev => ({
              ...prev,
              ...parsedData,
              lastUpdated: new Date().toISOString(),
            }));
            sendToBackend({
              ...parsedData,
              deviceId: device.id,
              deviceType: "CL900",
            });
          }
        }
      );

      connectedDevice.onDisconnected((error, device) => {
        console.log("Disconnected from CL900 hub:", device.name, error);
        setConnectedDevice(null);
        setHubConnected(false);
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
        Alert.alert("Disconnected", `Lost connection to ${device.name || "CL900 hub"}.`);
      });
    } catch (error) {
      console.error("Connection error:", error);
      Alert.alert("Error", `Failed to connect to CL900 hub: ${(error as any).message}`);
      setConnectedDevice(null);
      setHubConnected(false);
    } finally {
      setConnecting(false);
      setAutoConnecting(false);
      setModalVisible(false);
    }
  };

  // Parse CL900 data
  const parseCL900Data = (value: string) => {
    try {
      const buffer = Buffer.from(value, 'base64');
      // Implement CL900 specific data parsing here
      // This is a placeholder - you'll need to implement the actual parsing based on CL900 protocol
      return {
        heartRate: buffer[0] || null,
        battery: buffer[1] || null,
        // Add other data parsing as needed
      };
    } catch (error) {
      console.error("Error parsing CL900 data:", error);
      return {};
    }
  };

  // Send data to backend
  const sendToBackend = async (data: Partial<SensorData> & { deviceId: string; deviceType: string }) => {
    try {
      await axios.post(`${API_URL}/api/sensor/ble`, {
        ...data,
        lastUpdated: new Date().toISOString(),
      });
      console.log("Sent to backend:", data);
    } catch (error) {
      console.error("Error sending data to backend:", error);
    }
  };

  // Disconnect from hub
  const disconnectFromHub = async () => {
    if (connectedDevice && bleManager) {
      try {
        await connectedDevice.cancelConnection();
        setConnectedDevice(null);
        setHubConnected(false);
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
      } catch (error) {
        console.error("Disconnect error:", error);
        Alert.alert("Error", "Failed to disconnect: " + (error as Error).message);
      }
    }
  };

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
          {Platform.OS !== 'web' && (
            <Text style={styles.statusText}>
              Hub Connection: {hubConnected ? "Connected" : "Disconnected"}
            </Text>
          )}
          {isSocketConnected && socketData && (
            <Text style={styles.statusText}>
              Last Update: {socketData.lastUpdated ? new Date(socketData.lastUpdated).toLocaleTimeString() : "N/A"}
            </Text>
          )}
        </View>

        {/* Hub Connection Section */}
        {Platform.OS === 'web' ? (
          <View style={styles.connectionStatus}>
            <Text style={styles.statusText}>
              Bluetooth is not available on web platform
            </Text>
          </View>
        ) : connectedDevice ? (
          <View style={styles.connectedContainer}>
            <Text style={styles.connectedText}>Connected to: {connectedDevice.name || "CL900 Hub"}</Text>
            <TouchableOpacity style={styles.disconnectButton} onPress={disconnectFromHub}>
              <Text style={styles.buttonText}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.statusText}>
              {autoConnecting ? "Connecting to CL900 hub..." : "No hub connected"}
            </Text>
            <TouchableOpacity
              style={[styles.button, (scanning || connecting || autoConnecting) && styles.buttonDisabled]}
              onPress={autoConnectToHub}
              disabled={scanning || connecting || autoConnecting}
            >
              <Icon name="bluetooth" size={24} color="white" style={styles.buttonIcon} />
              <Text style={styles.buttonText}>
                {scanning ? "Scanning..." : connecting || autoConnecting ? "Connecting..." : "Connect to CL900 Hub"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Connected Devices List */}
        {hubConnected && connectedDevices.length > 0 && (
          <View style={styles.dataContainer}>
            <Text style={styles.dataTitle}>Connected Devices</Text>
            {connectedDevices.map((device) => (
              <View key={device.id} style={styles.deviceDataContainer}>
                <Text style={styles.deviceName}>{device.name}</Text>
                <Text style={styles.deviceType}>Type: {device.type}</Text>
                <Text style={styles.deviceStatus}>
                  Last Seen: {new Date(device.lastSeen).toLocaleTimeString()}
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
        {hubConnected && (
          <View style={styles.dataContainer}>
            <Text style={styles.dataTitle}>Hub Sensor Data</Text>
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
        )}

        {/* Device List */}
        {devices.length > 0 && !connectedDevice && (
          <FlatList
            data={devices}
            renderItem={renderDeviceItem}
            keyExtractor={(item) => item.id}
            style={styles.deviceList}
          />
        )}

        {/* Loading Modal */}
        <Modal isVisible={modalVisible} style={styles.modal}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color="#1E88E5" />
            <Text style={styles.modalText}>
              {scanning ? "Scanning for CL900 Hub..." : "Connecting to Hub..."}
            </Text>
          </View>
        </Modal>
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