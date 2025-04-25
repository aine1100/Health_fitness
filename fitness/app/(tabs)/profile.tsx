import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useEffect, useState } from "react";
import UserCard from "../components/user-card";
import { io } from "socket.io-client";

// Backend API URL (adjust for production or testing)
const API_URL = "http://localhost:3000/api/sensor"; // Use ngrok or public IP for device testing

export default function ProfileScreen() {
  // State to store full Hub900 sensor data
  const [sensorData, setSensorData] = useState({
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

  // Fetch sensor data on component mount
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
    socket.on("sensorData", (data) => {
      setSensorData(data);
    });
    socket.on("disconnect", () => {
      console.log("Disconnected from Socket.IO");
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Derive metrics for UserCard
  const userMetrics = {
    name: "John Doe", // Replace with dynamic user data if available
    average: sensorData.heartRate || 97, // Heart rate as average
    calories: sensorData.calories || (sensorData.steps ? Math.round(sensorData.steps * 0.04) : 150), // Estimate from steps
    points: sensorData.oxygen || 100, // Oxygen as points
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Info</Text>
        <View style={styles.profileIcon}>
          <Image
            source={{ uri: "https://via.placeholder.com/28" }} // Replace with user profile image
            style={{ width: 28, height: 28, borderRadius: 14 }}
          />
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Display multiple users or groups */}
        <UserCard {...userMetrics} />
        <UserCard {...userMetrics} />
        <UserCard {...userMetrics} />
        <UserCard {...userMetrics} />
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
    marginBottom: 120,
  },
});