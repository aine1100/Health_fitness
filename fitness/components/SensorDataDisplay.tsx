import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSocket } from '../hooks/useSocket';

export const SensorDataDisplay = () => {
  const { isConnected, sensorData } = useSocket();

  if (!isConnected) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Not connected to server</Text>
      </View>
    );
  }

  if (!sensorData) {
    return (
      <View style={styles.container}>
        <Text>Waiting for sensor data...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sensor Data</Text>
      
      {sensorData.deviceType && (
        <Text style={styles.dataRow}>Device Type: {sensorData.deviceType}</Text>
      )}
      
      {sensorData.heartRate !== null && (
        <Text style={styles.dataRow}>Heart Rate: {sensorData.heartRate} BPM</Text>
      )}
      
      {sensorData.boxingHand && (
        <Text style={styles.dataRow}>Boxing Hand: {sensorData.boxingHand}</Text>
      )}
      
      {sensorData.boxingPunchType && (
        <Text style={styles.dataRow}>Punch Type: {sensorData.boxingPunchType}</Text>
      )}
      
      {sensorData.boxingPower !== null && (
        <Text style={styles.dataRow}>Power: {sensorData.boxingPower}</Text>
      )}
      
      {sensorData.boxingSpeed !== null && (
        <Text style={styles.dataRow}>Speed: {sensorData.boxingSpeed}</Text>
      )}
      
      {sensorData.cadenceWheel !== null && (
        <Text style={styles.dataRow}>Cadence: {sensorData.cadenceWheel} RPM</Text>
      )}
      
      {sensorData.steps !== null && (
        <Text style={styles.dataRow}>Steps: {sensorData.steps}</Text>
      )}
      
      {sensorData.calories !== null && (
        <Text style={styles.dataRow}>Calories: {sensorData.calories}</Text>
      )}
      
      {sensorData.temperature !== null && (
        <Text style={styles.dataRow}>Temperature: {sensorData.temperature}°C</Text>
      )}
      
      {sensorData.oxygen !== null && (
        <Text style={styles.dataRow}>Oxygen: {sensorData.oxygen}%</Text>
      )}
      
      {sensorData.battery !== null && (
        <Text style={styles.dataRow}>Battery: {sensorData.battery}%</Text>
      )}
      
      {sensorData.sosAlert && (
        <Text style={[styles.dataRow, styles.sosAlert]}>SOS ALERT!</Text>
      )}
      
      {sensorData.lastUpdated && (
        <Text style={styles.timestamp}>
          Last Updated: {new Date(sensorData.lastUpdated).toLocaleTimeString()}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  dataRow: {
    fontSize: 16,
    marginBottom: 8,
    color: '#666',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
  },
  sosAlert: {
    color: 'red',
    fontWeight: 'bold',
    fontSize: 18,
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
    marginTop: 16,
    fontStyle: 'italic',
  },
}); 