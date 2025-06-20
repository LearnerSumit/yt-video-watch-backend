/**
 * socketHandler.js
 * 
 * This file now handles a more flexible video data structure to support
 * multiple video sources (e.g., YouTube, Google Drive, direct links).
 * 
 * The key change is moving from a simple `currentVideoId` string to a
 * `currentVideo` object, which looks like: { source: 'youtube', id: '...' }
 * or { source: 'gdrive', id: 'https://...' }.
 * 
 * UPDATED: Now also integrates a modular voice chat handler for WebRTC signaling.
 */

// --- NEW --- Import the voice chat handlers
import { handleVoiceChat, handleVoiceDisconnect } from './voiceHandler.js';

// In-memory store for active room data.
// UPDATED: The user object now includes a 'voiceState'.
// Key: roomId, Value: { users: [ { ..., voiceState: { isJoined, isMuted } } ], ... }
const rooms = {};

export const handleSocketConnections = (io) => {
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.id}`);

        // --- NEW --- Plug in the voice chat event handlers for this socket
        handleVoiceChat(io, socket, rooms);

        // --- Room Management ---
        socket.on('join-room', ({ roomId, user }) => {
            if (!roomId) return;

            socket.join(roomId);
            
            // UPDATED: Add initial voiceState to the user object
            const userWithSocketId = { 
                ...user, 
                id: socket.id, 
                roomId,
                // Users are not in voice chat by default
                voiceState: { isJoined: false, isMuted: false }
            };

            if (!rooms[roomId]) {
                // This is the first user, they set the initial state
                rooms[roomId] = {
                    users: [],
                    videoState: { isPlaying: false, time: 0, speed: 1 },
                    currentVideo: null,
                };
            }

            // Only add if not already present (avoid duplicates on refresh)
            const existingUserIndex = rooms[roomId].users.findIndex(
                (u) => u.id === socket.id
            );
            if (existingUserIndex === -1) {
                rooms[roomId].users.push(userWithSocketId);
            } else {
                // If user exists (e.g., on reconnect), update their data
                rooms[roomId].users[existingUserIndex] = userWithSocketId;
            }

            // Send current room state to the newly joined user
            // The room state now implicitly contains the voice state of all users.
            socket.emit('room-state', {
                users: rooms[roomId].users,
                videoState: rooms[roomId].videoState,
                currentVideo: rooms[roomId].currentVideo,
            });

            // Notify everyone else in the room about the new user
            socket.to(roomId).emit('user-joined', userWithSocketId);

            console.log(`User ${user.name} (${socket.id}) joined room ${roomId}`);
        });

        // --- Video Synchronization ---
        socket.on('player-state-change', ({ roomId, state }) => {
            if (rooms[roomId]) {
                rooms[roomId].videoState = state;
                socket.to(roomId).emit('player-state-update', state);
            }
        });

        socket.on('change-video', ({ roomId, video }) => {
            if (rooms[roomId]) {
                rooms[roomId].currentVideo = video;
                rooms[roomId].videoState = { isPlaying: true, time: 0, speed: 1 };
                io.to(roomId).emit('video-changed', video);
            }
        });

        // --- Chat & Reactions ---
        socket.on('send-message', ({ roomId, message }) => {
            io.to(roomId).emit('new-message', message);
        });

        socket.on('send-reaction', ({ roomId, reaction }) => {
            io.to(roomId).emit('new-reaction', { ...reaction, id: socket.id });
        });

        // --- Disconnect Handling ---
        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.id}`);
            for (const roomId in rooms) {
                const room = rooms[roomId];
                const userIndex = room.users.findIndex(user => user.id === socket.id);

                if (userIndex !== -1) {
                    const departingUser = room.users.splice(userIndex, 1)[0];
                    io.to(roomId).emit('user-left', departingUser.id);
                    console.log(`User ${departingUser.name} left room ${roomId}`);

                    // --- NEW --- Call the voice disconnect handler for cleanup
                    if (departingUser.voiceState?.isJoined) {
                        handleVoiceDisconnect(io, roomId, departingUser.id);
                    }

                    if (room.users.length === 0) {
                        delete rooms[roomId];
                        console.log(`Room ${roomId} is now empty and has been closed.`);
                    }
                    break;
                }
            }
        });
    });
};