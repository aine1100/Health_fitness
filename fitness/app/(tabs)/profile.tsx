import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useEffect, useState } from "react";
import { useSocket } from "../../hooks/useSocket";

// Backend API URL
const API_URL = "http://localhost:9000";

interface DeviceData {
  deviceId: string;
  deviceType: string;
  name: string;
  connected: boolean;
  lastSeen: string;
  latest_data?: {
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
    timestamp: string;
  };
}

export default function ProfileScreen() {
  const [selectedDevice, setSelectedDevice] = useState<DeviceData | null>(null);
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const { isConnected: isSocketConnected } = useSocket();

  // Fetch connected devices
  const fetchDevices = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/devices`);
      setDevices(response.data);
      if (response.data.length > 0 && !selectedDevice) {
        setSelectedDevice(response.data[0]);
      }
    } catch (error) {
      console.error("Error fetching devices:", error);
    }
  };

  // Fetch devices on mount and periodically
  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch historical data for selected device
  const fetchDeviceData = async (deviceId: string) => {
    try {
      const response = await axios.get(`${API_URL}/api/devices/${deviceId}/data?limit=100`);
      return response.data;
    } catch (error) {
      console.error("Error fetching device data:", error);
      return [];
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Device Data</Text>
        <View style={styles.profileIcon}>
          <Image
            source={{ uri: "https://via.placeholder.com/28" }}
            style={{ width: 28, height: 28, borderRadius: 14 }}
          />
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Connection Status */}
        <View style={styles.connectionStatus}>
          <Text style={styles.statusText}>
            Server Connection: {isSocketConnected ? "Connected" : "Disconnected"}
          </Text>
        </View>

        {/* Device Selection */}
        <View style={styles.deviceSelector}>
          <Text style={styles.sectionTitle}>Select Device</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deviceList}>
            {devices.map((device) => (
              <TouchableOpacity
                key={device.deviceId}
                style={[
                  styles.deviceButton,
                  selectedDevice?.deviceId === device.deviceId && styles.selectedDevice,
                ]}
                onPress={() => setSelectedDevice(device)}
              >
                <Text style={styles.deviceButtonText}>{device.name}</Text>
                <Text style={styles.deviceStatus}>
                  {device.connected ? "Connected" : "Disconnected"}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Selected Device Data */}
        {selectedDevice ? (
          <View style={styles.dataContainer}>
            <Text style={styles.dataTitle}>{selectedDevice.name}</Text>
            <Text style={styles.deviceType}>Type: {selectedDevice.deviceType}</Text>
            <Text style={styles.deviceStatus}>
              Last Seen: {new Date(selectedDevice.lastSeen).toLocaleString()}
            </Text>

            {selectedDevice.latest_data && (
              <View style={styles.sensorData}>
                <Text style={styles.dataText}>
                  Heart Rate: {selectedDevice.latest_data.heartRate || "N/A"} bpm
                </Text>
                <Text style={styles.dataText}>
                  Battery: {selectedDevice.latest_data.battery || "N/A"}%
                </Text>
                {selectedDevice.latest_data.boxingHand && (
                  <Text style={styles.dataText}>
                    Boxing Hand: {selectedDevice.latest_data.boxingHand}
                  </Text>
                )}
                {selectedDevice.latest_data.boxingPunchType && (
                  <Text style={styles.dataText}>
                    Punch Type: {selectedDevice.latest_data.boxingPunchType}
                  </Text>
                )}
                {selectedDevice.latest_data.boxingPower && (
                  <Text style={styles.dataText}>
                    Power: {selectedDevice.latest_data.boxingPower} kg
                  </Text>
                )}
                {selectedDevice.latest_data.boxingSpeed && (
                  <Text style={styles.dataText}>
                    Speed: {selectedDevice.latest_data.boxingSpeed} m/s
                  </Text>
                )}
                {selectedDevice.latest_data.cadenceWheel && (
                  <Text style={styles.dataText}>
                    Cadence: {selectedDevice.latest_data.cadenceWheel} laps
                  </Text>
                )}
                <Text style={styles.dataText}>
                  SOS Alert: {selectedDevice.latest_data.sosAlert ? "Active" : "Inactive"}
                </Text>
                <Text style={styles.dataText}>
                  Steps: {selectedDevice.latest_data.steps || "N/A"}
                </Text>
                <Text style={styles.dataText}>
                  Calories: {selectedDevice.latest_data.calories || "N/A"} kcal
                </Text>
                <Text style={styles.dataText}>
                  Temperature: {selectedDevice.latest_data.temperature || "N/A"}°C
                </Text>
                <Text style={styles.dataText}>
                  Oxygen: {selectedDevice.latest_data.oxygen || "N/A"}%
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.dataContainer}>
            <Text style={styles.dataText}>No device selected</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  profileIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  connectionStatus: {
    backgroundColor: "#1E1E1E",
    padding: 15,
    borderRadius: 8,
    marginVertical: 10,
  },
  statusText: {
    color: "#BBBBBB",
    fontSize: 16,
    textAlign: "center",
  },
  deviceSelector: {
    marginVertical: 10,
  },
  sectionTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
  },
  deviceList: {
    flexDirection: "row",
  },
  deviceButton: {
    backgroundColor: "#1E1E1E",
    padding: 15,
    borderRadius: 8,
    marginRight: 10,
    minWidth: 150,
  },
  selectedDevice: {
    backgroundColor: "#1E88E5",
  },
  deviceButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "500",
  },
  deviceStatus: {
    color: "#BBBBBB",
    fontSize: 14,
    marginTop: 5,
  },
  dataContainer: {
    backgroundColor: "#1E1E1E",
    padding: 15,
    borderRadius: 8,
    marginVertical: 10,
  },
  dataTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  deviceType: {
    color: "#BBBBBB",
    fontSize: 14,
    marginBottom: 5,
  },
  sensorData: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "#3A3A3A",
  },
  dataText: {
    color: "white",
    fontSize: 16,
    marginVertical: 5,
  },
});