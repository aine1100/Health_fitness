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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
import { BleManager, Device, Service, Characteristic } from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import Modal from "react-native-modal";
import axios from "axios";

// Backend API URL (replace with your ngrok or deployed URL)
const API_URL = "https://node-serverv-1-0-1.onrender.com/api/sensor/ble";

// AsyncStorage key for last connected device
const LAST_DEVICE_KEY = "lastConnectedDevice";

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

// Create a BLE manager instance
let bleManager: BleManager | null = null;
try {
  bleManager = new BleManager();
  console.log("BleManager initialized successfully");
} catch (error) {
  console.error("Failed to initialize BleManager:", error);
  Alert.alert("Initialization Error", "Failed to initialize Bluetooth. Please restart the app.");
}

export default function HomeScreen() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [isBluetoothEnabled, setIsBluetoothEnabled] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [autoConnecting, setAutoConnecting] = useState(false);
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

  // Check Bluetooth status and attempt auto-connection
  useEffect(() => {
    if (!bleManager) {
      console.error("BleManager is not initialized");
      Alert.alert("Error", "Bluetooth initialization failed. Please restart the app.");
      return;
    }

    const checkBluetoothStatus = async () => {
      try {
        const state = await bleManager!.state();
        console.log("Bluetooth state:", state);
        setIsBluetoothEnabled(state === "PoweredOn");
        if (state === "PoweredOn" && !connectedDevice && !autoConnecting) {
          console.log("Bluetooth enabled, attempting auto-connection...");
          autoConnectToDevice();
        }
      } catch (error) {
        console.error("Bluetooth status check error:", error);
        Alert.alert("Error", "Failed to check Bluetooth status.");
      }
    };

    checkBluetoothStatus();

    const subscription = bleManager!.onStateChange((state) => {
      console.log("Bluetooth state changed:", state);
      setIsBluetoothEnabled(state === "PoweredOn");
      if (state === "PoweredOn" && !connectedDevice && !autoConnecting) {
        console.log("Bluetooth turned on, attempting auto-connection...");
        autoConnectToDevice();
      } else if (state !== "PoweredOn") {
        Alert.alert("Bluetooth Disabled", "Please enable Bluetooth in your device settings.");
      }
    }, true);

    return () => {
      subscription.remove();
      
      console.log("BleManager Cleanup");
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
              ]
            : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

        const granted = await PermissionsAndroid.requestMultiple(permissions);
        const allGranted = permissions.every((perm) => granted[perm] === PermissionsAndroid.RESULTS.GRANTED);
        console.log("Permissions granted:", allGranted, granted);
        if (!allGranted) {
          Alert.alert("Permission Denied", "Bluetooth and location permissions are required to connect to devices.");
        }
        return allGranted;
      } catch (error) {
        console.error("Permission request error:", error);
        Alert.alert("Error", "Failed to request permissions.");
        return false;
      }
    }
    return true;
  };

  // Auto-connect to a previously connected or discoverable device
  const autoConnectToDevice = async () => {
    if (connectedDevice || autoConnecting || scanning) {
      console.log("Auto-connection skipped: already connected or in progress");
      return;
    }

    try {
      setAutoConnecting(true);
      setModalVisible(true);
      console.log("Starting auto-connection scan...");

      if (!bleManager) {
        throw new Error("BleManager not initialized");
      }

      const hasPermissions = await requestBluetoothPermissions();
      if (!hasPermissions) {
        console.log("Auto-connection failed: permissions not granted");
        throw new Error("Bluetooth permissions not granted");
      }

      const state = await bleManager.state();
      console.log("Current Bluetooth state:", state);
      if (state !== "PoweredOn") {
        console.log("Auto-connection failed: Bluetooth not enabled");
        throw new Error("Bluetooth is not enabled");
      }

      // Get last connected device ID
      const lastDeviceId = await AsyncStorage.getItem(LAST_DEVICE_KEY);
      console.log("Last connected device ID:", lastDeviceId);

      let foundDevice: Device | null = null;
      const discoveredDevices = new Map<string, Device>();

      bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error("Auto-connection scan error:", error);
          setAutoConnecting(false);
          setModalVisible(false);
          Alert.alert("Connection Error", `Failed to scan: ${error.message}`);
          return;
        }

        if (device && device.name) {
          console.log("Discovered device:", {
            id: device.id,
            name: device.name,
            rssi: device.rssi,
          });
          discoveredDevices.set(device.id, device);

          // Prioritize last connected device or take first named device
          if (!foundDevice && (device.id === lastDeviceId || !lastDeviceId)) {
            foundDevice = device;
            bleManager!.stopDeviceScan();
            connectToDevice(device);
          }
        }
      });

      setTimeout(() => {
        bleManager!.stopDeviceScan();
        setAutoConnecting(false);
        setModalVisible(false);
        if (!foundDevice) {
          console.log("Auto-connection failed: no devices found");
          setDevices(Array.from(discoveredDevices.values()));
          Alert.alert(
            "No Devices Found",
            "Could not find a paired device. Ensure it is in range and discoverable, then try scanning manually."
          );
        }
      }, 5000);
    } catch (error) {
      console.error("Auto-connection error:", error);
      Alert.alert("Error", `Failed to auto-connect: ${(error as Error).message}`);
      setAutoConnecting(false);
      setModalVisible(false);
    }
  };

  // Manual scan for BLE devices
  const scanForDevices = async () => {
    try {
      console.log("Starting manual BLE scan...");
      setScanning(true);
      setModalVisible(true);
      setDevices([]);

      if (!bleManager) {
        console.error("BleManager not initialized");
        throw new Error("BleManager not initialized");
      }

      const hasPermissions = await requestBluetoothPermissions();
      if (!hasPermissions) {
        console.log("Manual scan failed: permissions not granted");
        throw new Error("Bluetooth permissions not granted");
      }

      const state = await bleManager.state();
      console.log("Current Bluetooth state:", state);
      if (state !== "PoweredOn") {
        console.log("Manual scan failed: Bluetooth not enabled");
        throw new Error("Bluetooth is not enabled");
      }

      setIsBluetoothEnabled(true);

      const discoveredDevices = new Map<string, Device>();
      bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error("Manual scan error:", error);
          setScanning(false);
          setModalVisible(false);
          Alert.alert("Scan Error", `Failed to scan: ${error.message}`);
          return;
        }

        if (device && device.name) {
          console.log("Discovered device:", {
            id: device.id,
            name: device.name,
            rssi: device.rssi,
            isConnectable: device.isConnectable,
          });
          discoveredDevices.set(device.id, device);
          setDevices(Array.from(discoveredDevices.values()));
        }
      });

      setTimeout(() => {
        console.log("Stopping manual BLE scan");
        bleManager!.stopDeviceScan();
        setScanning(false);
        setModalVisible(false);
        if (discoveredDevices.size === 0) {
          Alert.alert("No Devices Found", "No Bluetooth devices were detected. Ensure devices are nearby and discoverable.");
        }
      }, 10000);
    } catch (error) {
      console.error("Manual scan error:", error);
      Alert.alert("Error", `Failed to scan for devices: ${(error as Error).message}`);
      setScanning(false);
      setModalVisible(false);
    }
  };

  // Connect to a device and discover services/characteristics
  const connectToDevice = async (device: Device) => {
    try {
      console.log("Connecting to device:", device.name);
      setConnecting(true);
      setModalVisible(true);

      if (!bleManager) {
        throw new Error("BleManager not initialized");
      }

      bleManager.stopDeviceScan();
      const connectedDevice = await device.connect();
      await connectedDevice.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connectedDevice);

      // Store device ID in AsyncStorage
      await AsyncStorage.setItem(LAST_DEVICE_KEY, device.id);
      console.log("Stored device ID:", device.id);

      console.log("Connected to device:", connectedDevice.name);

      // Discover all services and characteristics
      const services = await connectedDevice.services();
      for (const service of services) {
        const characteristics = await service.characteristics();
        console.log(`Service UUID: ${service.uuid}`);
        characteristics.forEach((char) => {
          console.log(
            `  Characteristic UUID: ${char.uuid}, Notifiable: ${char.isNotifiable}, Readable: ${char.isReadable}`
          );
        });

        // Monitor notifiable characteristics
        for (const char of characteristics) {
          if (char.isNotifiable) {
            await connectedDevice.monitorCharacteristicForService(
              service.uuid,
              char.uuid,
              (error, characteristic) => {
                if (error) {
                  console.error(`Monitor error for ${char.uuid}:`, error);
                  return;
                }
                if (characteristic?.value) {
                  const parsedData = parseCharacteristicData(service.uuid, char.uuid, characteristic);
                  setData((prev) => ({
                    ...prev,
                    ...parsedData,
                    lastUpdated: new Date().toISOString(),
                  }));
                  sendToBackend({
                    ...parsedData,
                    deviceId: device.id,
                    deviceType: `ble_${service.uuid}_${char.uuid}`,
                  });
                }
              }
            );
          }
        }
      }

      connectedDevice.onDisconnected((error, device) => {
        console.log("Disconnected from device:", device.name, error);
        setConnectedDevice(null);
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
        Alert.alert("Disconnected", `Lost connection to ${device.name || "device"}.`);
      });
    } catch (error) {
      console.error("Connection error:", error);
      Alert.alert("Error", `Failed to connect to ${device.name || "device"}: ${(error as any).message}`);
      setConnectedDevice(null);
    } finally {
      setConnecting(false);
      setAutoConnecting(false);
      setModalVisible(false);
    }
  };

  // Parse characteristic data (log raw data for Hub900 customization)
  const parseCharacteristicData = (serviceUUID: string, charUUID: string, characteristic: Characteristic) => {
    const rawData = Buffer.from(characteristic.value!, "base64");
    console.log(`Characteristic ${charUUID} data for service ${serviceUUID}:`, rawData);
    // Return empty object; customize parsing for Hub900 when SDK details are available
    return {};
  };

  // Send data to backend
  const sendToBackend = async (data: Partial<SensorData> & { deviceId: string; deviceType: string }) => {
    try {
      await axios.post(API_URL, {
        ...data,
        lastUpdated: new Date().toISOString(),
      });
      console.log("Sent to backend:", data);
    } catch (error) {
      console.error("Error sending data to backend:", error);
    }
  };

  // Disconnect from device
  const disconnectFromDevice = async () => {
    if (connectedDevice && bleManager) {
      try {
        await connectedDevice.cancelConnection();
        setConnectedDevice(null);
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
      onPress={() => connectToDevice(item)}
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
      <View style={styles.content}>
        <Text style={styles.title}>Home</Text>
        <Text style={styles.subtitle}>Welcome to the home screen</Text>

        {connectedDevice ? (
          <View style={styles.connectedContainer}>
            <Text style={styles.connectedText}>Connected to: {connectedDevice.name || "Device"}</Text>
            <TouchableOpacity style={styles.disconnectButton} onPress={disconnectFromDevice}>
              <Text style={styles.buttonText}>Disconnect</Text>
            </TouchableOpacity>
            <View style={styles.dataContainer}>
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
          </View>
        ) : (
          <View>
            <Text style={styles.statusText}>
              {autoConnecting ? "Connecting to paired device..." : "No device connected"}
            </Text>
            <TouchableOpacity
              style={[styles.button, (scanning || connecting || autoConnecting) && styles.buttonDisabled]}
              onPress={scanForDevices}
              disabled={scanning || connecting || autoConnecting}
            >
              <Icon name="bluetooth" size={24} color="white" style={styles.buttonIcon} />
              <Text style={styles.buttonText}>
                {scanning ? "Scanning..." : connecting || autoConnecting ? "Connecting..." : "Scan for Bluetooth Devices"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {devices.length > 0 && !connectedDevice && (
          <FlatList
            data={devices}
            renderItem={renderDeviceItem}
            keyExtractor={(item) => item.id}
            style={styles.deviceList}
          />
        )}

        <Modal isVisible={modalVisible} style={styles.modal}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color="#1E88E5" />
            <Text style={styles.modalText}>
              {scanning ? "Scanning for Bluetooth Devices..." : "Connecting to Device..."}
            </Text>
          </View>
        </Modal>
      </View>
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
  dataText: {
    color: "white",
    fontSize: 16,
    marginVertical: 5,
  },
});