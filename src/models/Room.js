// src/models/Room.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const messageSchema = new Schema({
    user: {
        id: String,
        name: String,
    },
    text: String,
    timestamp: { type: Date, default: Date.now },
});

const roomSchema = new Schema({
    roomId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    currentVideoId: {
        type: String,
        default: null,
    },
    chatHistory: [messageSchema],
    createdAt: {
        type: Date,
        default: Date.now,
        expires: '24h', // Automatically delete rooms after 24 hours of inactivity
    },
});

const Room = model('Room', roomSchema);

export default Room;