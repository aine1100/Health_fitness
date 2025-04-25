import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import MetricCard from "./components/metric-card";
import { io } from "socket.io-client";

const screenWidth = Dimensions.get("window").width;

// Backend API URL (use ngrok or public IP for device testing)
const API_URL = "http://localhost:3000/api/sensor";

interface SensorData {
  deviceId: number | null;
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

export default function UserDetailScreen() {
  const [activeTab, setActiveTab] = useState<"thisWeek" | "lastWeek" | "thisMonth">("lastWeek");
  const [sensorData, setSensorData] = useState<SensorData>({
    deviceId: null,
    deviceType: null,
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

  // Fetch sensor data on mount
  useEffect(() => {
    const fetchSensorData = async () => {
      try {
        const response = await axios.get(API_URL);
        setSensorData(response.data);
      } catch (error) {
        console.error("Error fetching sensor data:", error);
      }
    };

    fetchSensorData();
  }, []);

  // Real-time updates with Socket.IO
  useEffect(() => {
    const socket = io("http://localhost:3000");
    socket.on("connect", () => {
      console.log("Connected to Socket.IO");
    });
    socket.on("sensorData", (data: SensorData) => {
      setSensorData(data);
    });
    socket.on("disconnect", () => {
      console.log("Disconnected from Socket.IO");
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Derive metrics for MetricCard
  const metrics = {
    points: sensorData.oxygen || 100, // Oxygen as points
    calories: sensorData.calories || (sensorData.steps ? Math.round(sensorData.steps * 0.04) : 900), // Calories from steps
    heartRate: sensorData.heartRate || 155, // Heart rate
    average: sensorData.boxingPower ? Math.round(sensorData.boxingPower * 0.1) : 90, // Average from boxing power
  };

  // Sample historical data for chart (replace with backend data if available)
  const chartData = [50, 60, 70, metrics.heartRate || 155, 80, 90, 100]; // Use heart rate for trend

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Info</Text>
        <View style={styles.profileIcon}>
          <Image
            source={{ uri: "https://via.placeholder.com/28" }}
            style={{ width: 28, height: 28, borderRadius: 14 }}
          />
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={styles.dateLabel}>JULY-DEC</Text>
        <Text style={styles.dateValue}>July 15, 2023</Text>

        {sensorData.sosAlert && (
          <View style={styles.sosBadge}>
            <Text style={styles.sosText}>SOS Alert!</Text>
          </View>
        )}

        <View style={styles.timeSlots}>
          <View style={styles.timeSlot}>
            <Text style={styles.timeText}>10:00</Text>
          </View>
          <View style={[styles.timeSlot, styles.activeTimeSlot]}>
            <Text style={styles.activeTimeText}>12:00</Text>
          </View>
          <View style={styles.timeSlot}>
            <Text style={styles.timeText}>15:00</Text>
          </View>
        </View>

        <View style={styles.metricsGrid}>
          <MetricCard
            title="Points"
            value={metrics.points.toString()} // Convert number to string
            color="#1DB954"
            icon="trophy"
            chartType="line"
          />
          <MetricCard
            title="Calories"
            value={metrics.calories.toString()} // Convert number to string
            unit="kcal"
            color="#4A9DFF"
            icon="flame"
            chartType="bar"
          />
          <MetricCard
            title="Heart Rate"
            value={metrics.heartRate.toString()} // Convert number to string
            unit="bpm"
            color="#FF4A55"
            icon="heart"
            chartType="line"
            lineStyle="heartbeat"
          />
          <MetricCard
            title="Average"
            value={metrics.average.toString()} // Convert number to string
            unit="Percent"
            color="#FFA94A"
            icon="stats-chart"
            chartType="bar"
          />
        </View>

        <View style={styles.overviewSection}>
          <Text style={styles.overviewTitle}>Recent Overview</Text>

          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "thisWeek" && styles.activeTab]}
              onPress={() => setActiveTab("thisWeek")}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "thisWeek" && styles.activeTabText,
                ]}
              >
                This Week
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "lastWeek" && styles.activeTab]}
              onPress={() => setActiveTab("lastWeek")}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "lastWeek" && styles.activeTabText,
                ]}
              >
                Last Week
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "thisMonth" && styles.activeTab]}
              onPress={() => setActiveTab("thisMonth")}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "thisMonth" && styles.activeTabText,
                ]}
              >
                This Month
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.chartContainer}>
            <CustomLineChart data={chartData} />

            <View style={styles.totalPointsContainer}>
              <Text style={styles.totalPointsValue}>{metrics.points * 7}</Text>
              <View style={styles.pointsChangeBadge}>
                <Text style={styles.pointsChangeText}>+10%</Text>
              </View>
              <Text style={styles.totalPointsLabel}>POINTS</Text>
            </View>
          </View>

          <View style={styles.bottomMetrics}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{metrics.heartRate}</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{metrics.calories}</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{metrics.average}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface CustomLineChartProps {
  data: number[];
}

function CustomLineChart({ data }: CustomLineChartProps) {
  const maxValue = Math.max(...data);

  return (
    <View style={styles.lineChartContainer}>
      {data.map((value: number, index: number) => {
        const height = (value / maxValue) * 100;
        return (
          <View key={index} style={styles.lineChartColumn}>
            <View
              style={[
                styles.lineChartBar,
                {
                  height: `${height}%`,
                },
              ]}
            />
            {index === 3 && (
              <View style={styles.lineChartDot}>
                <View style={styles.lineChartInnerDot} />
              </View>
            )}
          </View>
        );
      })}
      <View style={styles.lineChartLine} />
    </View>
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
  dateLabel: {
    color: "#888",
    fontSize: 12,
    marginTop: 16,
  },
  dateValue: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 4,
  },
  sosBadge: {
    backgroundColor: "#FF4A55",
    padding: 8,
    borderRadius: 8,
    marginVertical: 10,
    alignSelf: "center",
  },
  sosText: {
    color: "white",
    fontWeight: "bold",
  },
  timeSlots: {
    flexDirection: "row",
    marginTop: 20,
    marginBottom: 16,
  },
  timeSlot: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 12,
    borderRadius: 16,
  },
  activeTimeSlot: {
    backgroundColor: "#1DB954",
  },
  timeText: {
    color: "#888",
  },
  activeTimeText: {
    color: "white",
    fontWeight: "500",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 8,
  },
  overviewSection: {
    marginTop: 24,
    marginBottom: 80,
  },
  overviewTitle: {
    color: "#888",
    fontSize: 14,
    marginBottom: 12,
  },
  tabsContainer: {
    flexDirection: "row",
    marginBottom: 16,
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    borderRadius: 16,
  },
  activeTab: {
    backgroundColor: "#1DB954",
  },
  tabText: {
    color: "#888",
    fontSize: 12,
  },
  activeTabText: {
    color: "white",
  },
  chartContainer: {
    backgroundColor: "#1E1E1E",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    position: "relative",
    height: 220,
  },
  lineChartContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingBottom: 20,
    height: "100%",
  },
  lineChartColumn: {
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
    position: "relative",
  },
  lineChartBar: {
    width: 2,
    backgroundColor: "#1DB954",
    borderRadius: 1,
  },
  lineChartLine: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#1DB95420",
  },
  lineChartDot: {
    position: "absolute",
    bottom: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#1DB95430",
    justifyContent: "center",
    alignItems: "center",
  },
  lineChartInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1DB954",
  },
  totalPointsContainer: {
    position: "absolute",
    bottom: 24,
    left: 24,
  },
  totalPointsValue: {
    color: "white",
    fontSize: 36,
    fontWeight: "bold",
  },
  pointsChangeBadge: {
    backgroundColor: "rgba(29, 185, 84, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  pointsChangeText: {
    color: "#1DB954",
    fontSize: 12,
    fontWeight: "500",
  },
  totalPointsLabel: {
    color: "#888",
    fontSize: 12,
    marginTop: 4,
  },
  bottomMetrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  metricItem: {
    flex: 1,
    alignItems: "center",
  },
  metricValue: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
});