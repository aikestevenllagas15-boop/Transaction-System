// src/routes/sync.js
// GET /api/sync/summary
// What Finance shares with the Central Server: payment status, assessment
// summaries, outstanding balances, and financial reports — never the raw
// transaction table or student PII beyond what's needed.

import { Router } from "express";
import { db } from "../db.js";

const router = Router();

router.get("/summary", (req, res) => {
  const all = db.prepare("SELECT * FROM transactions WHERE status != 'Voided'").all();

  const totalCollected = all.filter((t) => t.status === "Paid").reduce((s, t) => s + t.amount, 0);
  const totalOutstanding = all.filter((t) => t.status === "Pending").reduce((s, t) => s + t.amount, 0);
  const totalDiscountsGranted = all.reduce((s, t) => s + (t.discount_amount || 0), 0);

  const byFeeType = {};
  for (const t of all) {
    byFeeType[t.fee_type] = (byFeeType[t.fee_type] || 0) + t.amount;
  }

  const studentsWithBalance = [...new Set(all.filter((t) => t.status === "Pending").map((t) => t.student_no))];

  res.json({
    generatedAt: new Date().toISOString(),
    syncedFields: ["paymentStatus", "assessmentSummary", "outstandingBalance", "financialReport"],
    financialReport: {
      totalCollected,
      totalOutstanding,
      totalDiscountsGranted,
      transactionCount: all.length,
      byFeeType,
    },
    studentsWithOutstandingBalance: studentsWithBalance.length,
  });
});

export default router;
