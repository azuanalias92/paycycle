export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatMonthYear(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(dateString: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dateString));
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function sortCommitments(commitments: Commitment[]) {
  return [...commitments].sort((a, b) => {
    // Unpaid (pending) first
    const aPaid = isCommitmentPaid(a);
    const bPaid = isCommitmentPaid(b);
    if (aPaid && !bPaid) return 1;
    if (!aPaid && bPaid) return -1;
    // Then alphabetical by title
    return a.title.localeCompare(b.title);
  });
}

export function isCommitmentPaid(commitment: Commitment) {
  return (
    commitment.status === "completed" ||
    commitment.paid_amount >= commitment.amount
  );
}

export function getCurrentMonthStartIso(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
  ).toISOString();
}

export function isDateInCurrentMonth(dateString: string) {
  const value = new Date(dateString);
  const now = new Date();
  return (
    value.getUTCFullYear() === now.getUTCFullYear() &&
    value.getUTCMonth() === now.getUTCMonth()
  );
}

export function normalizeDemoCommitmentForCurrentMonth(
  commitment: Commitment
): Commitment {
  const hasCurrentMonthActivity = isDateInCurrentMonth(commitment.updated_at);
  const paidAmount = hasCurrentMonthActivity ? commitment.paid_amount : 0;
  return {
    ...commitment,
    due_date: getCurrentMonthStartIso(),
    paid_amount: paidAmount,
    status: paidAmount >= commitment.amount ? "completed" : "pending",
  };
}

export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

import type { Commitment } from "./types";

// ── Categories ──
export const CATEGORIES = ["Loan", "Bill", "Saving"] as const;
export type CategoryTag = (typeof CATEGORIES)[number];

export function getCategoryBreakdown(commitments: Commitment[]) {
  const totalAmount = commitments.reduce((s, c) => s + c.amount, 0);

  const breakdown: Record<string, { amount: number; percentage: number }> = {};

  for (const cat of CATEGORIES) {
    const amount = commitments
      .filter((c) => (c.category ?? "").toLowerCase() === cat.toLowerCase())
      .reduce((s, c) => s + c.amount, 0);
    breakdown[cat] = {
      amount,
      percentage: totalAmount > 0 ? Math.round((amount / totalAmount) * 100) : 0,
    };
  }

  // Uncategorized / other
  const categorized = Object.values(breakdown).reduce((s, v) => s + v.amount, 0);
  const otherAmount = totalAmount - categorized;
  if (otherAmount > 0 || totalAmount === 0) {
    breakdown["Other"] = {
      amount: otherAmount,
      percentage: totalAmount > 0 ? Math.round((otherAmount / totalAmount) * 100) : 0,
    };
  }

  return { totalAmount, breakdown };
}
