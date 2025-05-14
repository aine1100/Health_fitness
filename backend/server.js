const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const path = require('path');
const { Pool } = require('pg');



const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Database configuration
const pool = new Pool({
  connectionString: 'postgresql://stoneproofdb_user:ijOfAUPNMogj7YCsFpmcnqUgkHgG7FXG@dpg-d009jevgi27c73b2a7vg-a.oregon-postgres.render.com/stoneproofdb',
  ssl: { rejectUnauthorized: false },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Store connected clients and devices
const clients = new Set();
const devices = new Map();

// Initialize database tables
async function initializeDatabase() {
  try {
    // Create devices table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        device_id TEXT UNIQUE,
        device_type TEXT,
        name TEXT,
        connected BOOLEAN DEFAULT false,
        last_seen TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create device_data table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_data (
        id SERIAL PRIMARY KEY,
        device_id TEXT REFERENCES devices(device_id),
        heart_rate INTEGER,
        cadence INTEGER,
        power INTEGER,
        speed FLOAT,
        jumps INTEGER,
        battery INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('New client connected');

  // Send current devices to new client
  ws.send(JSON.stringify({
    type: 'devices',
    data: Array.from(devices.values())
  }));

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      await handleWebSocketMessage(ws, data);
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected');
  });
});

// Handle WebSocket messages
async function handleWebSocketMessage(ws, data) {
  switch (data.type) {
    case 'hub_connect':
      await handleHubConnection(ws, data);
      break;
    case 'device_data':
      await handleDeviceData(ws, data);
      break;
    case 'get_connected_devices':
      const connectedDevices = await getConnectedDevices();
      ws.send(JSON.stringify({
        type: 'connected_devices',
        data: connectedDevices
      }));
      break;
    default:
      console.log('Unknown message type:', data.type);
  }
}

// Handle hub connection
async function handleHubConnection(ws, data) {
  try {
    const { hubId, deviceId, deviceType, name } = data;
    
    // Update or insert device in database
    await pool.query(`
      INSERT INTO devices (device_id, device_type, name, connected, last_seen)
      VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP)
      ON CONFLICT (device_id) 
      DO UPDATE SET 
        connected = true,
        last_seen = CURRENT_TIMESTAMP
    `, [deviceId, deviceType, name]);

    // Add to active devices
    devices.set(deviceId, {
      id: deviceId,
      type: deviceType,
      name: name,
      connected: true,
      hubId: hubId,
      lastSeen: new Date()
    });

    broadcastDevices();
  } catch (error) {
    console.error('Error handling hub connection:', error);
  }
}

// Handle device data
async function handleDeviceData(ws, data) {
  try {
    const { deviceId, ...sensorData } = data;
    
    // Store data in database
    await pool.query(`
      INSERT INTO device_data (
        device_id, heart_rate, cadence, power, speed, jumps, battery
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      deviceId,
      sensorData.heartRate || null,
      sensorData.cadence || null,
      sensorData.power || null,
      sensorData.speed || null,
      sensorData.jumps || null,
      sensorData.battery || null
    ]);

    // Update device in memory
    if (devices.has(deviceId)) {
      const device = devices.get(deviceId);
      device.data = sensorData;
      device.lastSeen = new Date();
      broadcastDevices();
    }
  } catch (error) {
    console.error('Error handling device data:', error);
  }
}

// Get connected devices from database
async function getConnectedDevices() {
  try {
    const result = await pool.query(`
      SELECT d.*, 
        (SELECT json_agg(dd ORDER BY dd.timestamp DESC LIMIT 1)
         FROM device_data dd
         WHERE dd.device_id = d.device_id) as latest_data
      FROM devices d
      WHERE d.connected = true
      AND d.last_seen > NOW() - INTERVAL '5 minutes'
    `);
    return result.rows;
  } catch (error) {
    console.error('Error getting connected devices:', error);
    return [];
  }
}

// Broadcast device updates to all connected clients
function broadcastDevices() {
  const message = JSON.stringify({
    type: 'devices',
    data: Array.from(devices.values())
  });

  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// REST API endpoints
app.get('/api/devices', async (req, res) => {
  try {
    const devices = await getConnectedDevices();
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

app.get('/api/devices/:id/data', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100 } = req.query;
    
    const result = await pool.query(`
      SELECT * FROM device_data
      WHERE device_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `, [id, limit]);
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch device data' });
  }
});

// Start server
const PORT = process.env.PORT || 9000;
initializeDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // console.log(`Web interface available at http://localhost:${PORT}`);
  });
}); 