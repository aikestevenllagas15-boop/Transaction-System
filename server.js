// server.js
// Finance System — Express API + static prototype frontend.
// Run: npm install && npm start   (Node 22.5+ required for node:sqlite)

import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";

import studentsRouter from "./src/routes/students.js";
import transactionsRouter from "./src/routes/transactions.js";
import syncRouter from "./src/routes/sync.js";
import { login } from "./src/middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

// ---- API ----
app.post("/api/auth/login", login);
app.use("/api/students", studentsRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/sync", syncRouter);

app.get("/api/health", (req, res) => res.json({ ok: true, service: "finance-system", time: new Date().toISOString() }));

// ---- static prototype UI ----
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---- error fallback ----
app.use((err, req, res, next) => {
  console.error(err);
  const isSqliteSchemaIssue = /no such column|no such table|has no column named/i.test(err?.message || "");
  res.status(500).json({
    error: isSqliteSchemaIssue
      ? "Database schema is out of date for this build. Stop the server and delete data/finance.db, then run npm start again to recreate it (migrations also run automatically on startup)."
      : "Internal server error.",
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Finance System API + UI running at http://localhost:${PORT}`);
  console.log(`Demo login → username: cashier   password: csfj2026`);
});
