# Smart Parking System

## Group Members

| # | Name | Student ID |
|---|------|------------|
| 1 | Eyob Tadesse | UGR/30507/15 |
| 2 | Natan Meseret | UGR/31027/15 |
| 3 | Ammar Amin | UGR/30171/15 |
| 4 | Adonay Alemu | UGR/30112/15 |

---

## Project Overview

The Smart Parking System is a full-stack web application that enables real-time management of parking slots. It supports user authentication, live slot monitoring via WebSockets, vehicle check-in/check-out, automatic fee calculation, and revenue tracking — all through a clean REST API backed by a MySQL database.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js |
| Framework | Express.js v5 |
| Database | MySQL (via mysql2) |
| Real-time | Socket.IO v4 |
| Authentication | JWT (jsonwebtoken) + bcrypt |
| Frontend | HTML / CSS / JavaScript (served statically) |

---

## Project Structure

```
smart-parking/
├── server.js            # Main application server
├── package.json         # Project dependencies and scripts
├── smart_parking.sql    # Database schema
└── public/
    └── index.html       # Frontend interface
```

---

## Database Schema

Run `smart_parking.sql` to initialize the database:

```sql
CREATE DATABASE IF NOT EXISTS smart_parking;
```

### Tables

**`parking_records`** — stores all parking events

| Column | Type | Description |
|--------|------|-------------|
| id | INT (PK) | Auto-increment ID |
| slot_number | INT | Slot index (0–11) |
| entry_time | DATETIME | Time vehicle parked |
| exit_time | DATETIME | Time vehicle left |
| duration_minutes | FLOAT | Total time parked |
| amount_paid | FLOAT | Fee charged |
| status | VARCHAR(20) | `occupied` or `free` |

**`users`** — registered user accounts

| Column | Type | Description |
|--------|------|-------------|
| id | INT (PK) | Auto-increment ID |
| full_name | VARCHAR(100) | User's full name |
| email | VARCHAR(150) | Unique email address |
| password | VARCHAR(255) | bcrypt hashed password |
| created_at | DATETIME | Registration timestamp |

---

## Getting Started

### Prerequisites

- Node.js (v16+)
- MySQL Server

### Installation

1. **Clone the repository and install dependencies:**

   ```bash
   npm install
   ```

2. **Set up the database:**

   ```bash
   mysql -u root -p < smart_parking.sql
   ```

3. **Configure environment variables** (optional but recommended for production):

   ```bash
   export JWT_SECRET=your_secure_secret_here
   ```

   > By default the server uses a fallback secret. Always set `JWT_SECRET` in production.

4. **Start the server:**

   ```bash
   npm start
   ```

   The server will run at `http://localhost:3000`.

---

## API Reference

All parking endpoints require a `Bearer <token>` in the `Authorization` header.

### Auth Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Register a new user |
| POST | `/api/auth/login` | Login and receive JWT |
| GET | `/api/auth/me` | Verify token & get user info |

**Signup / Login request body:**
```json
{
  "full_name": "John Doe",
  "email": "john@example.com",
  "password": "secret123"
}
```

**Response:**
```json
{
  "token": "<jwt_token>",
  "user": { "id": 1, "full_name": "John Doe", "email": "john@example.com" }
}
```

---

### Parking Endpoints *(JWT required)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/slots` | Get status of all 12 slots |
| POST | `/api/park/:slot` | Mark a slot as occupied |
| POST | `/api/checkout/:slot` | Check out a vehicle and calculate fee |
| GET | `/api/revenue` | Get total revenue collected |
| GET | `/api/records` | Get full history of parking records |

**Slot numbers:** `0` through `11` (12 total slots)

**Checkout response:**
```json
{
  "duration": 45.3,
  "amount": 90.6
}
```

---

## Pricing

Fees are calculated automatically on checkout:

```
Fee = Duration (minutes) × 2 ETB/minute
```

---

## Real-Time Updates

The system uses **Socket.IO** for live updates. When a slot is parked or checked out, the server emits an `update` event to all connected clients:

```json
{ "source": "manual", "action": "park", "slot": 3 }
```

Connect from the frontend:
```javascript
const socket = io("http://localhost:3000");
socket.on("update", (data) => {
  console.log("Slot update:", data);
});
```

---

## Security Notes

- Passwords are hashed using **bcrypt** (10 salt rounds) — never stored in plain text.
- All parking API routes are protected by **JWT authentication** (tokens expire in 7 days).
- Always set a strong `JWT_SECRET` environment variable in production environments.

---

## License

This project was developed for academic purposes.
