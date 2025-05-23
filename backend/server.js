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
  user: 'postgres',
  password: 'Fitness_12',
  host: 'fitness.cj22gi0ya8mv.eu-north-1.rds.amazonaws.com',
  port: 5432,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  max: 20,
  idleTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

// Add connection error handling with more detailed logging
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

pool.on('connect', () => {
  console.log('New client connected to database');
});

pool.on('acquire', () => {
  console.log('Client checked out from pool');
});

pool.on('remove', () => {
  console.log('Client removed from pool');
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Store connected clients and devices
const clients = new Set();
const devices = new Map();

// Initialize database tables with retry logic
async function initializeDatabase(retries = 5, delay = 5000) {
  for (let i = 0; i < retries; i++) {
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
      return true;
    } catch (error) {
      console.error(`Database initialization attempt ${i + 1} failed:`, error);
      if (i < retries - 1) {
        console.log(`Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error('Failed to initialize database after multiple attempts');
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
    const { type, connected, limit = 100 } = req.query;
    console.log('GET /api/devices - Query params:', { type, connected, limit });
    
    let query = `
      SELECT 
        d.*,
        (
          SELECT json_build_object(
            'heart_rate', dd.heart_rate,
            'cadence', dd.cadence,
            'power', dd.power,
            'speed', dd.speed,
            'jumps', dd.jumps,
            'battery', dd.battery,
            'timestamp', dd.timestamp
          )
          FROM device_data dd
          WHERE dd.device_id = d.device_id
          ORDER BY dd.timestamp DESC
          LIMIT 1
        ) as latest_data
      FROM devices d
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;

    if (type) {
      query += ` AND d.device_type = $${paramCount}`;
      params.push(type);
      paramCount++;
    }

    if (connected === 'true') {
      query += ` AND d.connected = true AND d.last_seen > NOW() - INTERVAL '5 minutes'`;
    } else if (connected === 'false') {
      query += ` AND (d.connected = false OR d.last_seen <= NOW() - INTERVAL '5 minutes')`;
    }

    query += ` ORDER BY d.last_seen DESC LIMIT $${paramCount}`;
    params.push(limit);

    console.log('Executing query:', query);
    console.log('With params:', params);

    const result = await pool.query(query, params);
    console.log('Query result:', result.rows);
    
    // Transform the result to handle null latest_data
    const devices = result.rows.map(device => ({
      ...device,
      latest_data: device.latest_data || null
    }));
    
    res.json(devices);
  } catch (error) {
    console.error('Error getting devices:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

app.get('/api/devices/:id/data', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100 } = req.query;
    console.log('GET /api/devices/:id/data - Params:', { id, limit });
    
    const result = await pool.query(`
      SELECT * FROM device_data
      WHERE device_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `, [id, limit]);
    
    console.log('Device data result:', result.rows);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching device data:', error);
    res.status(500).json({ error: 'Failed to fetch device data' });
  }
});

app.post('/api/devices', async (req, res) => {
  try {
    const { device_id, device_type, name } = req.body;
    
    if (!device_id || !device_type || !name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(`
      INSERT INTO devices (device_id, device_type, name, connected, last_seen)
      VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP)
      ON CONFLICT (device_id) 
      DO UPDATE SET 
        connected = true,
        last_seen = CURRENT_TIMESTAMP
      RETURNING *
    `, [device_id, device_type, name]);
    
    if (result.rows.length === 0) {
      return res.status(500).json({ error: 'Failed to insert device' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding device:', error);
    res.status(500).json({ error: 'Failed to add device' });
  }
});

app.post('/api/devices/:id/data', async (req, res) => {
  try {
    const { id } = req.params;
    const { heart_rate, cadence, power, speed, jumps, battery } = req.body;
    
    const result = await pool.query(`
      INSERT INTO device_data (
        device_id, heart_rate, cadence, power, speed, jumps, battery
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [id, heart_rate, cadence, power, speed, jumps, battery]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding device data:', error);
    res.status(500).json({ error: 'Failed to add device data' });
  }
});

// Start server with better error handling
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await initializeDatabase();
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server...');
  server.close(() => {
    console.log('Server closed');
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
});

startServer(); 