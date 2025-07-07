import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import cronParser from "cron-parser";

const app = express();
const PORT = process.env.PORT || 3000;

// Replace this with your fixed MongoDB Atlas URI:
const MONGO_URI = "mongodb+srv://smtpmy19:RpIihgqHEpc7YjBi@cluster0.frxhg7x.mongodb.net/cronjob_saas?retryWrites=true&w=majority&appName=Cluster0";

app.use(cors());
app.use(express.json());

// ✅ Health check route for browser
app.get("/", (req, res) => {
    res.send("✅ Cronjob SaaS Backend is running.");
});

async function startServer() {
    const client = new MongoClient(MONGO_URI);

    try {
        await client.connect();
        console.log("✅ Connected to MongoDB Atlas");

        const db = client.db("cronjob_saas");
        const cronjobs = db.collection("cronjobs");

        /**
         * POST /api/add-cron
         * Add a new cron job
         */
        app.post("/api/add-cron", async (req, res) => {
            try {
                const { userId, url, method, headers, body, cronPattern } = req.body;

                if (!url || !method || !cronPattern) {
                    return res.status(400).json({
                        success: false,
                        error: "Missing required fields: url, method, cronPattern"
                    });
                }

                const interval = cronParser.parseExpression(cronPattern);
                const nextRun = interval.next().toDate();
                const now = new Date();

                const result = await cronjobs.insertOne({
                    userId: userId || null,
                    url,
                    method,
                    headers: headers || {},
                    body: body || {},
                    cronPattern,
                    nextRun,
                    lastRun: null,
                    lastStatus: null,
                    lastResponseCode: null,
                    active: true,
                    createdAt: now,
                    updatedAt: now
                });

                res.json({ success: true, id: result.insertedId });
            } catch (error) {
                console.error("❌ Error adding cron job:", error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        /**
         * GET /api/get-due-crons
         * Get cron jobs due for execution
         */
        app.get("/api/get-due-crons", async (req, res) => {
            try {
                const now = new Date();
                const dueJobs = await cronjobs.find({
                    nextRun: { $lte: now },
                    active: true
                }).toArray();

                res.json(dueJobs);
            } catch (error) {
                console.error("❌ Error fetching due crons:", error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        /**
         * POST /api/mark-run
         * Mark a cron job as executed
         */
        app.post("/api/mark-run", async (req, res) => {
            try {
                const { jobId, status, responseCode } = req.body;

                if (!jobId || !status || typeof responseCode !== "number") {
                    return res.status(400).json({
                        success: false,
                        error: "Missing jobId, status, or responseCode"
                    });
                }

                const job = await cronjobs.findOne({ _id: new ObjectId(jobId) });

                if (!job) {
                    return res.status(404).json({
                        success: false,
                        error: "Job not found"
                    });
                }

                const interval = cronParser.parseExpression(job.cronPattern);
                const nextRun = interval.next().toDate();
                const now = new Date();

                await cronjobs.updateOne(
                    { _id: new ObjectId(jobId) },
                    {
                        $set: {
                            lastRun: now,
                            lastStatus: status,
                            lastResponseCode: responseCode,
                            nextRun: nextRun,
                            updatedAt: now
                        }
                    }
                );

                res.json({ success: true });
            } catch (error) {
                console.error("❌ Error marking cron as run:", error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ✅ Start the server
        app.listen(PORT, () => {
            console.log(`🚀 Server running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("❌ Failed to connect to MongoDB:", error);
        process.exit(1);
    }
}

startServer();
