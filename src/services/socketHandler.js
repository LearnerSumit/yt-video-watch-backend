/**
 * socketHandler.js
 * 
 * This file now handles a more flexible video data structure to support
 * multiple video sources (e.g., YouTube, Google Drive, direct links).
 * 
 * The key change is moving from a simple `currentVideoId` string to a
 * `currentVideo` object, which looks like: { source: 'youtube', id: '...' }
 * or { source: 'gdrive', id: 'https://...' }.
 */

// In-memory store for active room data.
// UPDATED: The value now contains a 'currentVideo' object instead of a 'videoId' string.
// Key: roomId, Value: { users: [], videoState: {}, currentVideo: { source, id } }
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
                    // UPDATED: Changed from currentVideoId to a more flexible object.
                    currentVideo: null,
                };
            }

            // Only add if not already present (avoid duplicates on refresh)
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
                // UPDATED: Send the entire 'currentVideo' object.
                currentVideo: rooms[roomId].currentVideo,
            });

            // Notify everyone else in the room about the new user
            socket.to(roomId).emit('user-joined', userWithSocketId);

            console.log(`User ${user.name} (${socket.id}) joined room ${roomId}`);
        });

        // --- Video Synchronization ---
        // NO CHANGES NEEDED HERE: This event correctly syncs player state regardless of the video source.
        socket.on('player-state-change', ({ roomId, state }) => {
            if (rooms[roomId]) {
                rooms[roomId].videoState = state;
                // Broadcast the new state to everyone else
                socket.to(roomId).emit('player-state-update', state);
            }
        });

        // UPDATED: This event now accepts a 'video' object instead of a 'videoId' string.
        socket.on('change-video', ({ roomId, video }) => { // `video` is now an object like { source, id }
            if (rooms[roomId]) {
                // Store the entire video object
                rooms[roomId].currentVideo = video;
                
                // Reset state for new video
                rooms[roomId].videoState = { isPlaying: true, time: 0, speed: 1 };

                // Inform all clients in the room about the new video object
                io.to(roomId).emit('video-changed', video);
            }
        });

        // --- Chat & Reactions ---
        // NO CHANGES NEEDED HERE.
        socket.on('send-message', ({ roomId, message }) => {
            // Broadcast the message to all clients in the room
            io.to(roomId).emit('new-message', message);
        });

        socket.on('send-reaction', ({ roomId, reaction }) => {
            // Broadcast the reaction to all clients in the room
            io.to(roomId).emit('new-reaction', { ...reaction, id: socket.id });
        });

        // --- Disconnect Handling ---
        // NO CHANGES NEEDED HERE.
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