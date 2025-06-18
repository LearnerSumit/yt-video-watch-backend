// src/server.js
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { nanoid } from 'nanoid';
import { handleSocketConnections } from './services/socketHandler.js';

// Load environment variables from .env file
dotenv.config();

const app = express();
const server = http.createServer(app);

const corsOptions = {
    origin: "*", // Allow all origins
    methods: ["GET", "POST"],
};

app.use(cors(corsOptions));

const io = new SocketIOServer(server, {
    cors: corsOptions,
});

// Middleware to parse JSON bodies
app.use(express.json());



// --- Keep-Alive Self Ping (Every 10 minutes) ---
if (process.env.SELF_URL) {
    setInterval(() => {
        fetch(`${process.env.SELF_URL}`)
            .then(res => console.log(`[KeepAlive] Ping successful: ${res.status}`))
            .catch(err => console.error('[KeepAlive] Ping failed:', err.message));
    }, 10 * 60 * 1000); // Every 10 minutes
}

// --- API Routes ---
app.get('/', (req, res) => {
    res.send('Watch Party Server is running!');
});

// Endpoint to create a new room
app.post('/api/rooms', (req, res) => {
    const roomId = nanoid(8);
    res.status(201).json({ roomId });
});

// --- Socket.IO Connection Handling ---
handleSocketConnections(io);

// --- Server Startup ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});