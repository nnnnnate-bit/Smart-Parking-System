const express  = require("express");
const mysql    = require("mysql2");
const cors     = require("cors");
const http     = require("http");
const { Server } = require("socket.io");
const path     = require("path");
const bcrypt   = require("bcrypt");
const jwt      = require("jsonwebtoken");

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" },
    pingInterval: 5000,
    pingTimeout:  10000
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ── CONFIG ─────────────────────────────────────────────── */
const JWT_SECRET     = process.env.JWT_SECRET || "change_this_secret_in_production";
const SALT_ROUNDS    = 10;
const RATE_PER_MINUTE = 2;

/* ── MYSQL ──────────────────────────────────────────────── */
const db = mysql.createConnection({
    host:     "localhost",
    user:     "root",
    password: "root",
    database: "smart_parking"
});

db.connect((err) => {
    if (err) {
        console.error("MySQL connection error:", err);
    } else {
        console.log("MySQL connected ✓");
    }
});

/* ── COLORS ─────────────────────────────────────────────── */
const colors = [
    "#3b82f6", "#ef4444", "#10b981",
    "#f59e0b", "#8b5cf6", "#ec4899"
];

/* ── HELPERS ─────────────────────────────────────────────── */
function validSlot(slot) {
    return !isNaN(slot) && slot >= 0 && slot <= 11;
}

/* ── AUTH MIDDLEWARE ─────────────────────────────────────── */
function authenticate(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token      = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ message: "Access denied — no token provided" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ message: "Invalid or expired token" });
    }
}

/* ══════════════════════════════════════════════════════════
   AUTH ENDPOINTS
══════════════════════════════════════════════════════════ */

/* POST /api/auth/signup */
app.post("/api/auth/signup", async (req, res) => {
    const { full_name, email, password } = req.body;

    if (!full_name || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    try {
        const hash = await bcrypt.hash(password, SALT_ROUNDS);

        db.query(
            `INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)`,
            [full_name, email, hash],
            (err, result) => {
                if (err) {
                    if (err.code === "ER_DUP_ENTRY") {
                        return res.status(409).json({ message: "Email already registered" });
                    }
                    return res.status(500).json({ error: err.message });
                }

                const token = jwt.sign(
                    { id: result.insertId, email, full_name },
                    JWT_SECRET,
                    { expiresIn: "7d" }
                );

                console.log(`[Auth] New user registered: ${email}`);
                res.status(201).json({ token, user: { id: result.insertId, full_name, email } });
            }
        );
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* POST /api/auth/login */
app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    db.query(
        `SELECT * FROM users WHERE email = ? LIMIT 1`,
        [email],
        async (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            if (rows.length === 0) {
                return res.status(401).json({ message: "Invalid email or password" });
            }

            const user  = rows[0];
            const match = await bcrypt.compare(password, user.password);

            if (!match) {
                return res.status(401).json({ message: "Invalid email or password" });
            }

            const token = jwt.sign(
                { id: user.id, email: user.email, full_name: user.full_name },
                JWT_SECRET,
                { expiresIn: "7d" }
            );

            console.log(`[Auth] User logged in: ${email}`);
            res.json({ token, user: { id: user.id, full_name: user.full_name, email: user.email } });
        }
    );
});

/* GET /api/auth/me — verify token & return user info */
app.get("/api/auth/me", authenticate, (req, res) => {
    res.json({ user: req.user });
});

/* ══════════════════════════════════════════════════════════
   PROTECTED PARKING ENDPOINTS  (require JWT)
══════════════════════════════════════════════════════════ */

/* GET /api/slots */
app.get("/api/slots", authenticate, (req, res) => {
    db.query(
        `SELECT * FROM parking_records WHERE status = 'occupied'`,
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });

            const slots = Array(12).fill(null).map(() => ({
                occupied:  false,
                startTime: null,
                color:     null
            }));

            result.forEach((row) => {
                const index = parseInt(row.slot_number);
                if (index >= 0 && index < 12) {
                    slots[index] = {
                        occupied:  true,
                        startTime: row.entry_time,
                        color:     colors[index % colors.length]
                    };
                }
            });

            res.json(slots);
        }
    );
});

/* POST /api/park/:slot */
app.post("/api/park/:slot", authenticate, (req, res) => {
    const slot = parseInt(req.params.slot);

    if (!validSlot(slot)) {
        return res.status(400).json({ message: "Invalid slot number" });
    }

    db.query(
        `SELECT id FROM parking_records WHERE slot_number = ? AND status = 'occupied'`,
        [slot],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            if (rows.length > 0) {
                return res.json({ message: "Slot already occupied" });
            }

            db.query(
                `INSERT INTO parking_records (slot_number, entry_time, status, amount_paid)
                 VALUES (?, NOW(), 'occupied', 0)`,
                [slot],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });

                    io.emit("update", { source: "manual", action: "park", slot });
                    res.json({ message: "Vehicle parked" });
                }
            );
        }
    );
});

/* POST /api/checkout/:slot */
app.post("/api/checkout/:slot", authenticate, (req, res) => {
    const slot = parseInt(req.params.slot);

    if (!validSlot(slot)) {
        return res.status(400).json({ message: "Invalid slot number" });
    }

    db.query(
        `SELECT * FROM parking_records WHERE slot_number = ? AND status = 'occupied' ORDER BY id DESC LIMIT 1`,
        [slot],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });

            if (result.length === 0) {
                return res.json({ message: "No active car" });
            }

            const record   = result[0];
            const duration = (new Date() - new Date(record.entry_time)) / 60000;
            const amount   = duration * RATE_PER_MINUTE;

            db.query(
                `UPDATE parking_records
                 SET exit_time = NOW(), duration_minutes = ?, amount_paid = ?, status = 'free'
                 WHERE id = ?`,
                [duration, amount, record.id],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });

                    io.emit("update", { source: "manual", action: "checkout", slot });
                    res.json({ duration, amount });
                }
            );
        }
    );
});

/* GET /api/revenue */
app.get("/api/revenue", authenticate, (req, res) => {
    db.query(
        `SELECT IFNULL(SUM(amount_paid), 0) AS revenue FROM parking_records`,
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(result[0]);
        }
    );
});

/* GET /api/records */
app.get("/api/records", authenticate, (req, res) => {
    db.query(
        `SELECT * FROM parking_records ORDER BY id DESC`,
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(result);
        }
    );
});

/* ── SOCKET ─────────────────────────────────────────────── */
io.on("connection", (socket) => {
    console.log(`[WS] Client connected  (id: ${socket.id})`);
    socket.on("disconnect", () => {
        console.log(`[WS] Client disconnected (id: ${socket.id})`);
    });
});

/* ── FRONTEND FALLBACK ──────────────────────────────────── */
app.get("/{*path}", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ── START ──────────────────────────────────────────────── */
server.listen(3000, "0.0.0.0", () => {
    console.log("Server running on http://0.0.0.0:3000");
    console.log("");
    console.log("Auth endpoints:");
    console.log("  POST /api/auth/signup  ← register new user");
    console.log("  POST /api/auth/login   ← login & get JWT");
    console.log("  GET  /api/auth/me      ← verify token");
    console.log("");
    console.log("Parking endpoints (all require JWT):");
    console.log("  GET  /api/slots          ← get all slot states");
    console.log("  POST /api/park/:slot     ← mark slot occupied");
    console.log("  POST /api/checkout/:slot ← checkout & calculate fee");
    console.log("  GET  /api/revenue        ← total revenue");
    console.log("  GET  /api/records        ← all parking records");
});