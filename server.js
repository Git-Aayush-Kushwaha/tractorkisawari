const express = require('express');
const cors = require('cors');
const CryptoJS = require('crypto-js'); // Bypasses OpenSSL blocks

const app = express();
app.use(cors());
app.use(express.static(__dirname)); 

// Helper function using CryptoJS to safely decode the streams
function decryptUrl(encryptedUrl) {
    if (!encryptedUrl || typeof encryptedUrl !== 'string') return null;
    
    try {
        const key = CryptoJS.enc.Utf8.parse('38346591');
        
        // Decrypt using pure JS instead of Node's restricted crypto engine
        const decryptedData = CryptoJS.DES.decrypt(
            { ciphertext: CryptoJS.enc.Base64.parse(encryptedUrl) },
            key,
            { mode: CryptoJS.mode.ECB }
        );
        
        const decryptedStr = decryptedData.toString(CryptoJS.enc.Utf8);
        
        // Upgrade the default stream to high-quality 320kbps
        return decryptedStr.replace('_96.mp4', '_320.mp4').replace('_160.mp4', '_320.mp4');
    } catch (e) {
        console.error("Decryption Error:", e.message);
        return null;
    }
}

// Search Endpoint (Hits official jiosaavn.com directly)
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0 Safari/537.36'
        };
        
        // STEP 1: Search for the vibe to get the raw Song IDs
        const searchRes = await fetch(`https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&n=15&p=1&q=${encodeURIComponent(query)}`, { headers });
        const searchData = await searchRes.json();
        
        const resultsArray = searchData?.results || searchData?.data || [];
        if (resultsArray.length === 0) throw new Error("No search results found");

        const songIds = resultsArray.map(track => track.id).join(',');

        // STEP 2: Ask for the exact details of those IDs
        const detailsRes = await fetch(`https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${songIds}&_format=json`, { headers });
        const detailsData = await detailsRes.json();

        const songs = [];
        
        // Loop through the detailed response
        for (const key in detailsData) {
            const track = detailsData[key];
            if (!track || typeof track !== 'object') continue;

            const encryptedUrl = track?.more_info?.encrypted_media_url || track?.encrypted_media_url;
            let streamUrl = decryptUrl(encryptedUrl);

            // ULTIMATE FALLBACK: The Preview URL Trick
            if (!streamUrl && track?.media_preview_url) {
                streamUrl = track.media_preview_url
                    .replace('preview.saavncdn.com', 'aac.saavncdn.com')
                    .replace('_96_p', '_320');
            }

            if (streamUrl) {
                let rawTitle = track?.title || track?.song || 'Unknown Title';
                if (typeof rawTitle === 'string') {
                    rawTitle = rawTitle.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
                }
                
                songs.push({
                    id: track.id,
                    title: rawTitle,
                    artist: track?.more_info?.primary_artists || track?.primary_artists || 'Unknown Artist',
                    url: streamUrl 
                });
            }
        }

        if (songs.length === 0) {
            throw new Error("Found songs, but could not extract any audio streams");
        }

        res.json(songs);
    } catch (error) {
        console.error("Search API Error:", error.message);
        res.status(500).json({ error: 'Search failed' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`AutoWala Server running on port ${PORT}`);
});


module.exports = app;