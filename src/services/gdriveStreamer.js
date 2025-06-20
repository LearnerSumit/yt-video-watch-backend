// src/services/gdriveStreamer.js
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

// --- Google API Client (No Changes Here) ---
const credentials = JSON.parse(process.env.GOOGLE_API_CREDENTIALS);
const { client_id, client_secret } = credentials.web;
const REDIRECT_URI = 'https://developers.google.com/oauthplayground';
const oauth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);
oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_API_REFRESH_TOKEN,
});
const drive = google.drive({
    version: 'v3',
    auth: oauth2Client,
});
// ---------------------------------------------


// --- THE NEW, SMART STREAMING HANDLER ---
export const streamGdriveFile = async (req, res) => {
    const fileId = req.params.fileId;
    if (!fileId) {
        return res.status(400).send('Error: Missing Google Drive File ID');
    }

    try {
        // 1. Get file metadata (size, type)
        const fileMeta = await drive.files.get({
            fileId: fileId,
            fields: 'size, mimeType',
        });

        const fileSize = fileMeta.data.size;
        const mimeType = fileMeta.data.mimeType;

        // 2. Check for a Range header from the browser
        const range = req.headers.range;

        if (range) {
            // Browser wants a specific chunk of the video (seeking)
            console.log(`[GDRIVE] Received range request: ${range}`);
            
            const CHUNK_SIZE = 10 ** 6; // 1MB chunk
            const start = Number(range.replace(/\D/g, ""));
            const end = Math.min(start + CHUNK_SIZE, fileSize - 1);

            const contentLength = end - start + 1;

            // 3. Set headers for a partial content response (206)
            const headers = {
                "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": contentLength,
                "Content-Type": mimeType,
            };

            res.writeHead(206, headers); // 206 means "Partial Content"

            // 4. Ask Google Drive for ONLY that specific chunk
            const driveStream = await drive.files.get(
                { fileId: fileId, alt: 'media' },
                { 
                    responseType: 'stream',
                    headers: { 'Range': `bytes=${start}-${end}` } // Pass the range header to Google
                }
            );
            driveStream.data.pipe(res);

        } else {
            // Browser is asking for the file for the first time
            console.log('[GDRIVE] Received initial request (no range)');

            // 5. Set headers for a full content response (200)
            const headers = {
                "Content-Length": fileSize,
                "Content-Type": mimeType,
            };
            res.writeHead(200, headers);

            // 6. Stream the entire file from the beginning
            const driveStream = await drive.files.get(
                { fileId: fileId, alt: 'media' },
                { responseType: 'stream' }
            );
            driveStream.data.pipe(res);
        }

    } catch (error) {
        console.error(`[GDRIVE] API Error for fileId: ${fileId}.`, error.message);
        res.status(404).send('Error: File not found or access denied.');
    }
};