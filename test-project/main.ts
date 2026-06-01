import express from "express";
import { Pace } from "pace-node";

const app = express();

const pace = new Pace({
    apiKey: "pace_live_bdrP2kfeKgGkyS0CLoZe9HNpNK8J7e2V",
    mode: "active",
    debug: "compact",
});

const PORT = Number(process.env.PORT || 5001);
app.use(express.json());

app.get("/", (req: any, res: any) => {
    res.send("Running!");
});

// GET route for easy testing in browser
app.get(
    "/api/generate",
    pace.limit({
        algorithm: "fixed_window",
        limit: 5,
        window: "1m",
    }),
    async (req: any, res: any) => {
        res.json({ success: true, method: "GET" });
    }
);

app.post(
    "/api/generate",
    pace.limit({
        algorithm: "fixed_window",
        limit: 5,
        window: "1m",
    }),
    async (req: any, res: any) => {
        res.json({ success: true, method: "POST" });
    }
);

app.listen(PORT, () => {
    console.log(`6. Server is listening on http://localhost:${PORT}`);
    console.log(`7. Visit http://localhost:${PORT}/api/generate in your browser to trigger rate limiting & metrics`);
});