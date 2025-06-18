// src/services/socketHandler.js

// In-memory store for active room data.
// Key: roomId, Value: { users: [], videoState: {}, videoId: '...' }
const rooms = {};

export const handleSocketConnections = (io) => {
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.id}`);

        // --- Room Management ---
        socket.on('join-room', ({ roomId, user }) => {
            if (!roomId) return;

            socket.join(roomId);
            const userWithSocketId = { ...user, id: socket.id, roomId };

            if (!rooms[roomId]) {
                // This is the first user, they set the initial state
                rooms[roomId] = {
                    users: [],
                    videoState: { isPlaying: false, time: 0, speed: 1 },
                    currentVideoId: null,
                };
            }

            // ✅ Only add if not already present (avoid duplicates on refresh)
            const existingUserIndex = rooms[roomId].users.findIndex(
                (u) => u.id === socket.id
            );
            if (existingUserIndex === -1) {
                rooms[roomId].users.push(userWithSocketId);
            }

            // Send current room state to the newly joined user
            socket.emit('room-state', {
                users: rooms[roomId].users,
                videoState: rooms[roomId].videoState,
                currentVideoId: rooms[roomId].currentVideoId,
            });

            // Notify everyone else in the room about the new user
            socket.to(roomId).emit('user-joined', userWithSocketId);

            console.log(`User ${user.name} (${socket.id}) joined room ${roomId}`);
        });

        // --- Video Synchronization ---
        socket.on('player-state-change', ({ roomId, state }) => {
            if (rooms[roomId]) {
                rooms[roomId].videoState = state;
                // Broadcast the new state to everyone else
                socket.to(roomId).emit('player-state-update', state);
            }
        });

        socket.on('change-video', ({ roomId, videoId }) => {
            if (rooms[roomId]) {
                rooms[roomId].currentVideoId = videoId;
                // Reset state for new video
                rooms[roomId].videoState = { isPlaying: true, time: 0, speed: 1 };
                // Inform all clients in the room about the new video
                io.to(roomId).emit('video-changed', videoId);
            }
        });

        // --- Chat & Reactions ---
        socket.on('send-message', ({ roomId, message }) => {
            // Broadcast the message to all clients in the room
            io.to(roomId).emit('new-message', message);
        });

        socket.on('send-reaction', ({ roomId, reaction }) => {
            // Broadcast the reaction to all clients in the room
            io.to(roomId).emit('new-reaction', { ...reaction, id: socket.id });
        });

        // --- Disconnect Handling ---
        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.id}`);
            // Find which room the user was in and remove them
            for (const roomId in rooms) {
                const room = rooms[roomId];
                const userIndex = room.users.findIndex(user => user.id === socket.id);

                if (userIndex !== -1) {
                    const departingUser = room.users.splice(userIndex, 1)[0];
                    io.to(roomId).emit('user-left', departingUser.id);
                    console.log(`User ${departingUser.name} left room ${roomId}`);

                    // If the room is now empty, clean it up from memory
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