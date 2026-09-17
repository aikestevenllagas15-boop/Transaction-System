// src/middleware/auth.js
// Minimal JWT auth for the prototype. In production, credentials would be
// checked against a real accounts table (hashed passwords) rather than the
// single demo cashier account below.

import jwt from "jsonwebtoken";

export const JWT_SECRET = process.env.JWT_SECRET || "finance-system-dev-secret-change-me";

const DEMO_USER = { username: "cashier", password: "csfj2026", role: "cashier" };

export function login(req, res) {
  const { username, password } = req.body || {};
  if (username !== DEMO_USER.username || password !== DEMO_USER.password) {
    return res.status(401).json({ error: "Invalid username or password." });
  }
  const token = jwt.sign({ sub: username, role: DEMO_USER.role }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, expiresIn: "8h", role: DEMO_USER.role });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token." });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}
