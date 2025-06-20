// src/services/voiceHandler.js

/**
 * Handles all WebRTC signaling for real-time voice chat.
 *
 * This module manages the events required for peers to establish a direct
 * connection for streaming audio. The server acts as a "signaling" server,
 * passing messages between clients but not handling the audio stream itself.
 *
 * We also manage the mute/unmute state and voice blocking for each user.
 */

// This function will be called from the main socketHandler for each connected socket.
export const handleVoiceChat = (io, socket, rooms) => {

    /**
     * A user signals their intent to join the voice chat in a room.
     */
    socket.on('join-voice-chat', ({ roomId }) => {
        if (!rooms[roomId]) return;

        // Find the user in the room's user list
        const user = rooms[roomId].users.find(u => u.id === socket.id);
        if (!user) return;

        // Get a list of all *other* users already in the voice chat
        const otherUsersInVoice = rooms[roomId].users.filter(
            u => u.id !== socket.id && u.voiceState?.isJoined
        );

        // Ensure the blockedVoiceUsers array exists on the user object
        if (!user.blockedVoiceUsers) {
            user.blockedVoiceUsers = [];
        }

        // Update the user's voice state in the central store
        user.voiceState = { isJoined: true, isMuted: false };

        // Send the list of existing voice users to the new joiner.
        // The new joiner will then initiate a connection to each of them.
        // We also include whether a user is blocked by the joining user.
        socket.emit('all-voice-users', {
            users: otherUsersInVoice.map(u => ({
                id: u.id,
                name: u.name,
                voiceState: u.voiceState,
                isBlockedByYou: user.blockedVoiceUsers.includes(u.id)
            }))
        });
        
        console.log(`User ${user.name} (${socket.id}) joined voice chat in room ${roomId}`);
    });

    /**
     * Handles mute/unmute state changes from a client.
     */
    socket.on('voice-state-change', ({ roomId, isMuted }) => {
        if (!rooms[roomId]) return;

        const user = rooms[roomId].users.find(u => u.id === socket.id);
        if (user && user.voiceState) {
            user.voiceState.isMuted = isMuted;
            // Broadcast the state change to everyone else in the room
            socket.to(roomId).emit('user-voice-state-updated', {
                userId: socket.id,
                voiceState: user.voiceState,
            });
        }
    });

    /**
     * A user wants to block another user's voice.
     */
    socket.on('block-voice-user', ({ roomId, blockedUserId }) => {
        if (!rooms[roomId] || !blockedUserId) return;

        const blockingUser = rooms[roomId].users.find(u => u.id === socket.id);
        if (!blockingUser) return;

        // Ensure the blockedVoiceUsers array exists
        if (!blockingUser.blockedVoiceUsers) {
            blockingUser.blockedVoiceUsers = [];
        }

        // Add the user to the block list if they aren't already in it
        if (!blockingUser.blockedVoiceUsers.includes(blockedUserId)) {
            blockingUser.blockedVoiceUsers.push(blockedUserId);
            console.log(`User ${blockingUser.name} (${socket.id}) blocked user ${blockedUserId}`);
        }
    });

    /**
     * Client requests the list of users they have blocked.
     * Useful for re-hydrating state on the client after a refresh.
     */
    socket.on('get-blocked-voice-users', ({ roomId }) => {
        if (!rooms[roomId]) return;

        const user = rooms[roomId].users.find(u => u.id === socket.id);
        if (!user) return;

        // Respond to the sender with their list of blocked user IDs.
        socket.emit('blocked-voice-users-list', {
            blockedUserIds: user.blockedVoiceUsers || [],
        });
    });

    /**
     * This is a generic signaling event. A user is sending a signal
     * (like an "offer" or "answer" for WebRTC) to another specific user.
     */
    socket.on('sending-signal', (payload) => {
        // The server simply relays this signal to the target user.
        io.to(payload.userToSignal).emit('user-joined-voice', {
            signal: payload.signal,
            callerID: payload.callerID,
            callerName: payload.callerName, // Pass name for better UX
        });
    });

    /**
     * A user who received an initial signal is now returning their
     * signal to the original caller.
     */
    socket.on('returning-signal', (payload) => {
        // The server relays the return signal back to the initiator.
        io.to(payload.callerID).emit('receiving-returned-signal', {
            signal: payload.signal,
            id: socket.id,
        });
    });

    /**
     * A user explicitly leaves the voice chat.
     */
    socket.on('leave-voice-chat', ({ roomId }) => {
        if (!rooms[roomId]) return;

        const user = rooms[roomId].users.find(u => u.id === socket.id);
        if (user && user.voiceState) {
            user.voiceState.isJoined = false;
        }

        // Notify others that this user has left the voice channel
        io.to(roomId).emit('user-left-voice', { userId: socket.id });
        console.log(`User ${user?.name || socket.id} left voice chat in room ${roomId}`);
    });
};

/**
 * Handles cleanup when a user disconnects completely.
 * This is called from the main 'disconnect' event handler.
 */
export const handleVoiceDisconnect = (io, roomId, userId) => {
    // Notify everyone else in the room that this user's voice connection is gone.
    io.to(roomId).emit('user-left-voice', { userId });
};