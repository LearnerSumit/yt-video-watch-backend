// src/controllers/roomController.js
import { nanoid } from 'nanoid';
import Room from '../models/Room.js';

/**
 * @desc    Create a new room
 * @route   POST /api/rooms
 * @access  Public
 */
export const createRoom = async (req, res) => {
    try {
        // Generate a unique, short, URL-friendly ID (e.g., 'ABC123XY')
        const roomId = nanoid(8);

        // Although we use in-memory storage for active sessions,
        // creating a record in the DB is good for persistence or future features.
        // For now, we can skip saving to the DB to keep it simple and fast.
        // If you wanted to save it:
        // const newRoom = new Room({ roomId });
        // await newRoom.save();
        
        // Return the newly generated room ID to the client
        res.status(201).json({ roomId });

    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).json({ message: 'Server error while creating room.' });
    }
};

/**
 * You can add more controller functions here in the future.
 * For example, a function to get room details from the database.
 * 
 * @desc    Get room details by ID
 * @route   GET /api/rooms/:roomId
 * @access  Public
 */
// export const getRoomDetails = async (req, res) => { ... };