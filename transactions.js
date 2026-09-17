// src/routes/transactions.js
// The Finance System's core transaction surface:
//   GET    /api/transactions            list/search the ledger
//   GET    /api/transactions/:id        one transaction
//   GET    /api/transactions/balance/:studentNo   payment status for Enrollment/Registrar
//   POST   /api/transactions            validate -> commit a new payment
//   PATCH  /api/transactions/:id/void   void an active transaction
//
// Mutating routes require a bearer token (see src/middleware/auth.js).

import { Router } from "express";
import { db, nextTransactionId } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const FEE_TYPES = ["Tuition Fee", "Miscellaneous Fee", "Laboratory Fee", "Library Fine", "ID Replacement"];
const METHODS = ["Cash", "GCash", "Bank Transfer", "Check"];
export const DISCOUNT_TYPES = [
  "None",
  "Academic Scholarship — Full",
  "Academic Scholarship — Partial",
  "Working Scholar",
  "Employee Dependent (Parent/Guardian CSFJ Staff)",
  "Sibling Discount",
  "Other / Manual",
];
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

router.get("/", (req, res) => {
  const { search, status } = req.query;
  let sql = "SELECT * FROM transactions WHERE 1=1";
  const params = [];

  if (search) {
    sql += " AND (student_name LIKE ? OR or_number LIKE ? OR id LIKE ?)";
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  sql += " ORDER BY created_at DESC";

  const rows = db.prepare(sql).all(...params);
  res.json({ count: rows.length, transactions: rows });
});

// Outstanding balance / payment status — this is the read Enrollment checks
// before finalizing a load, and Registrar checks before graduation clearance.
router.get("/balance/:studentNo", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM transactions WHERE student_no = ? AND status != 'Voided'")
    .all(req.params.studentNo);

  const paid = rows.filter((r) => r.status === "Paid").reduce((s, r) => s + r.amount, 0);
  const pending = rows.filter((r) => r.status === "Pending").reduce((s, r) => s + r.amount, 0);

  res.json({
    studentNo: req.params.studentNo,
    amountPaid: paid,
    amountPending: pending,
    clearedForEnrollment: pending === 0 && rows.some((r) => r.status === "Paid"),
    transactionCount: rows.length,
  });
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM transactions WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Transaction not found." });
  res.json(row);
});

router.post("/", requireAuth, (req, res) => {
  const {
    studentNo, studentName, program, feeType,
    grossAmount, discountType, discountPercent,
    method, orNumber, term, verified, processedBy, verifiedBy,
  } = req.body || {};

  // ---- validate ----
  const errors = [];
  if (!studentNo || !studentName) errors.push("Student is required.");
  if (!FEE_TYPES.includes(feeType)) errors.push(`feeType must be one of: ${FEE_TYPES.join(", ")}`);
  if (!(Number(grossAmount) > 0)) errors.push("grossAmount must be greater than zero.");
  if (!METHODS.includes(method)) errors.push(`method must be one of: ${METHODS.join(", ")}`);
  if (!orNumber || !String(orNumber).trim()) errors.push("orNumber is required.");
  if (!term) errors.push("term is required.");
  if (!processedBy || !String(processedBy).trim()) errors.push("processedBy (Accounting sign-off) is required.");

  const dType = discountType || "None";
  if (!DISCOUNT_TYPES.includes(dType)) errors.push(`discountType must be one of: ${DISCOUNT_TYPES.join(", ")}`);
  const dPercent = Number(discountPercent) || 0;
  if (dPercent < 0 || dPercent > 100) errors.push("discountPercent must be between 0 and 100.");
  if (dType === "None" && dPercent > 0) errors.push('discountPercent must be 0 when discountType is "None".');

  if (orNumber) {
    const dup = db
      .prepare("SELECT id FROM transactions WHERE or_number = ? AND status != 'Voided'")
      .get(String(orNumber).trim());
    if (dup) errors.push(`O.R. #${orNumber} is already recorded on an active transaction.`);
  }

  if (errors.length) return res.status(422).json({ errors });

  // ---- server computes the money math; the client's numbers are only a preview ----
  const gross = round2(grossAmount);
  const discountAmount = round2((gross * dPercent) / 100);
  const netAmount = round2(gross - discountAmount);

  // ---- commit ----
  const tx = {
    id: nextTransactionId(),
    student_no: studentNo,
    student_name: studentName,
    program: program || "—",
    fee_type: feeType,
    gross_amount: gross,
    discount_type: dType,
    discount_percent: dPercent,
    discount_amount: discountAmount,
    amount: netAmount,
    method,
    or_number: String(orNumber).trim(),
    term,
    processed_by: String(processedBy).trim(),
    verified_by: verifiedBy ? String(verifiedBy).trim() : "",
    status: verified === false ? "Pending" : "Paid",
    created_at: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO transactions (id, student_no, student_name, program, fee_type, gross_amount, discount_type, discount_percent, discount_amount, amount, method, or_number, term, processed_by, verified_by, status, created_at)
     VALUES (@id, @student_no, @student_name, @program, @fee_type, @gross_amount, @discount_type, @discount_percent, @discount_amount, @amount, @method, @or_number, @term, @processed_by, @verified_by, @status, @created_at)`
  ).run(tx);

  res.status(201).json(tx);
});

router.patch("/:id/void", requireAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM transactions WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Transaction not found." });
  if (row.status === "Voided") return res.status(409).json({ error: "Transaction is already voided." });

  db.prepare("UPDATE transactions SET status = 'Voided' WHERE id = ?").run(req.params.id);
  res.json({ ...row, status: "Voided" });
});

export default router;
