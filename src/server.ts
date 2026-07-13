import express from 'express';
import path from 'path';
import open from 'open';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

app.listen(PORT, async () => {
    console.log(`Invoice Generator is running at http://localhost:${PORT}`);
    try {
        await open(`http://localhost:${PORT}`);
    } catch (err) {
        console.log("Could not open browser automatically. Please open the URL manually.");
    }
});
