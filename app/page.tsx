"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Commitment, CreateCommitmentForm, StoredSession } from "@/lib/types";
import {
  formatCurrency,
  formatMonthYear,
  getInitials,
  sortCommitments,
  isCommitmentPaid,
} from "@/lib/helpers";
import {
  getSession,
  setSession,
  fetchCommitments,
  loadDemoCommitments,
  saveDemoCommitments,
  apiRequest,
  createDemoSession,
} from "@/lib/api";
import { buildGoogleAuthUrl, parseCallbackUrl } from "@/lib/auth";
import { playPaidSound } from "@/lib/sound";
import {
  Loader2,
  Plus,
  CheckCircle2,
  Pencil,
  Trash2,
  X,
  LogOut,
  Circle,
} from "lucide-react";

const defaultCommitmentForm = (): CreateCommitmentForm => ({
  title: "",
  amount: "",
  category: "",
});

export default function PayCycleApp() {
  // ── State ──
  const [booting, setBooting] = useState(true);
  const [session, setSessionState] = useState<StoredSession | null>(null);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [loadingCommitments, setLoadingCommitments] = useState(false);
  const [submittingCommitment, setSubmittingCommitment] = useState(false);
  const [payingCommitmentId, setPayingCommitmentId] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState<Commitment | null>(null);
  const [form, setForm] = useState<CreateCommitmentForm>(defaultCommitmentForm());
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const sessionRef = useRef<StoredSession | null>(null);

  // ── Session persistence ──
  const updateSession = useCallback((next: StoredSession | null) => {
    sessionRef.current = next;
    setSessionState(next);
    setSession(next);
  }, []);

  const persistDemo = useCallback((next: Commitment[]) => {
    const sorted = saveDemoCommitments(next);
    setCommitments(sorted);
    return sorted;
  }, []);

  // ── Bootstrap ──
  useEffect(() => {
    const stored = getSession();
    if (stored) {
      sessionRef.current = stored;
      setSessionState(stored);
    }
    setBooting(false);
  }, []);

  // ── Check for OAuth callback on mount ──
  useEffect(() => {
    if (booting) return;
    const params = new URLSearchParams(window.location.search);
    const errorMsg = params.get("error_description");
    if (errorMsg) {
      setAuthError(errorMsg);
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    const accessToken = params.get("access_token");
    if (accessToken) {
      const parsed = parseCallbackUrl(window.location.href);
      if (parsed.type === "success" && parsed.payload) {
        const nextSession: StoredSession = {
          mode: "api",
          accessToken: parsed.payload.access_token,
          refreshToken: parsed.payload.refresh_token,
          tokenType: parsed.payload.token_type,
          expiresIn: parsed.payload.expires_in,
          user: parsed.payload.user,
        };
        updateSession(nextSession);
        setAuthError(null);
        setDashboardError(null);
      } else if (parsed.type === "error") {
        setAuthError(parsed.message ?? "Authentication failed.");
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [booting, updateSession]);

  // ── Fetch commitments on session change ──
  useEffect(() => {
    if (!session) {
      setCommitments([]);
      return;
    }
    setLoadingCommitments(true);
    setDashboardError(null);
    fetchCommitmentsData().finally(() => setLoadingCommitments(false));
  }, [session]);

  async function fetchCommitmentsData() {
    try {
      const data = await fetchCommitments();
      setCommitments(sortCommitments(data));
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  // ── Summary ──
  const summary = useMemo(() => {
    const totalAmount = commitments.reduce((s, c) => s + c.amount, 0);
    const paidAmount = commitments.reduce(
      (s, c) => s + Math.min(c.paid_amount, c.amount),
      0
    );
    const paidCount = commitments.filter(isCommitmentPaid).length;
    return {
      count: commitments.length,
      totalAmount,
      paidAmount,
      remainingAmount: Math.max(totalAmount - paidAmount, 0),
      paidCount,
    };
  }, [commitments]);

  // ── Auth actions ──
  const openGoogleSignIn = useCallback(() => {
    setAuthError(null);
    setDashboardError(null);
    setAuthenticating(true);
    window.location.href = buildGoogleAuthUrl();
  }, []);

  const handleTemporaryBypass = useCallback(() => {
    setAuthError(null);
    setDashboardError(null);
    setAuthenticating(false);
    const demoSession = createDemoSession();
    updateSession(demoSession);
    setCommitments(loadDemoCommitments());
  }, [updateSession]);

  const handleLogout = useCallback(async () => {
    try {
      if (sessionRef.current?.mode === "api" && sessionRef.current.accessToken) {
        await apiRequest("/auth/logout", { method: "POST" });
      }
    } catch {
      // ignore
    }
    updateSession(null);
    setCommitments([]);
    setShowModal(false);
    setDropdownOpen(false);
  }, [updateSession]);

  // ── Commitment CRUD ──
  const openAddModal = useCallback(() => {
    setEditingCommitment(null);
    setForm(defaultCommitmentForm());
    setShowModal(true);
  }, []);

  const openEditModal = useCallback((c: Commitment) => {
    setEditingCommitment(c);
    setForm({
      title: c.title,
      amount: c.amount.toFixed(2),
      category: c.category ?? "",
    });
    setShowModal(true);
    setDropdownOpen(false);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setEditingCommitment(null);
    setForm(defaultCommitmentForm());
  }, []);

  const handleDelete = useCallback(
    async (commitment: Commitment) => {
      setDashboardError(null);
      try {
        if (sessionRef.current?.mode === "demo") {
          const current = loadDemoCommitments();
          persistDemo(current.filter((item) => item.id !== commitment.id));
          return;
        }
        await apiRequest(`/commitments/${commitment.id}`, { method: "DELETE" });
        await fetchCommitmentsData();
      } catch (err) {
        setDashboardError(err instanceof Error ? err.message : "Something went wrong.");
      }
      setDropdownOpen(false);
    },
    [persistDemo]
  );

  const handleSave = useCallback(async () => {
    const trimmedTitle = form.title.trim();
    const trimmedCategory = form.category.trim();
    const amountValue = Number(form.amount);

    if (!trimmedTitle) {
      setDashboardError("Please enter a title for your commitment.");
      return;
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setDashboardError("Please enter a positive amount.");
      return;
    }

    setSubmittingCommitment(true);
    setDashboardError(null);

    try {
      if (sessionRef.current?.mode === "demo") {
        const now = new Date().toISOString();
        const demoCommitment: Commitment = {
          id:
            editingCommitment?.id ??
            `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          user_id: sessionRef.current.user.id,
          title: trimmedTitle,
          amount: amountValue,
          paid_amount: editingCommitment?.paid_amount ?? 0,
          due_date: new Date(
            Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
          ).toISOString(),
          status: editingCommitment?.status ?? "pending",
          category: trimmedCategory || null,
          created_at: editingCommitment?.created_at ?? now,
          updated_at: now,
        };
        const current = loadDemoCommitments();
        const next = editingCommitment
          ? current.map((item) =>
              item.id === editingCommitment.id ? demoCommitment : item
            )
          : [demoCommitment, ...current];
        persistDemo(next);
        closeModal();
        return;
      }

      await apiRequest(
        editingCommitment ? `/commitments/${editingCommitment.id}` : "/commitments",
        {
          method: editingCommitment ? "PUT" : "POST",
          body: JSON.stringify({
            title: trimmedTitle,
            amount: amountValue,
            ...(trimmedCategory ? { category: trimmedCategory } : {}),
          }),
        }
      );
      closeModal();
      await fetchCommitmentsData();
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmittingCommitment(false);
    }
  }, [form, editingCommitment, closeModal, persistDemo]);

  const handleMarkAsPaid = useCallback(
    async (commitment: Commitment) => {
      if (isCommitmentPaid(commitment)) {
        setDashboardError("This commitment is already marked as paid.");
        return;
      }
      const amountToPay = Math.max(commitment.amount - commitment.paid_amount, 0);
      if (amountToPay <= 0) {
        setDashboardError("This commitment is already fully covered.");
        return;
      }

      setPayingCommitmentId(commitment.id);
      setDashboardError(null);

      try {
        if (sessionRef.current?.mode === "demo") {
          const now = new Date().toISOString();
          const current = loadDemoCommitments();
          const updated = current.map((item) =>
            item.id === commitment.id
              ? { ...item, paid_amount: item.amount, status: "completed" as const, updated_at: now }
              : item
          );
          persistDemo(updated);
          playPaidSound();
          return;
        }

        await apiRequest(`/commitments/${commitment.id}/payments`, {
          method: "POST",
          body: JSON.stringify({
            amount: amountToPay,
            payment_date: new Date().toISOString(),
            method: "digital_wallet",
            status: "completed",
            notes: `Marked as paid from PayCycle Web.`,
          }),
        });

        playPaidSound();
        await fetchCommitmentsData();
      } catch (err) {
        setDashboardError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setPayingCommitmentId(null);
      }
    },
    [persistDemo]
  );

  // ── Boot screen ──
  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center neo-card">
            <Loader2 className="h-8 w-8 animate-spin text-neo-orange" />
          </div>
          <h2 className="mt-5 text-2xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            Loading PayCycle
          </h2>
          <p className="mt-2 text-sm text-[#64748b]">
            Preparing your monthly commitment dashboard.
          </p>
        </div>
      </div>
    );
  }

  // ── Auth screen ──
  if (!session) {
    return (
      <div className="flex min-h-screen flex-col justify-center px-6 pb-12 pt-16">
        {/* Logo */}
        <div className="mx-auto mb-6 neo-avatar" style={{
          width: 100,
          height: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FF6B35",
        }}>
          <span className="text-4xl font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
            P
          </span>
        </div>

        <h1 className="mb-1 text-center text-3xl font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
          PayCycle
        </h1>
        <h2 className="text-center text-xl font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
          Track your monthly commitments with confidence.
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-center text-sm leading-relaxed text-[#475569]">
          Sign in with Google to see this month&apos;s commitments, add new ones,
          and mark them as paid with a satisfying chime.
        </p>

        {authError && (
          <div className="mt-5 neo-error p-4">
            <p className="text-sm font-bold text-red-700" style={{ fontFamily: "var(--font-heading)" }}>Login failed</p>
            <p className="mt-1 text-sm text-red-800">{authError}</p>
          </div>
        )}

        <button
          onClick={openGoogleSignIn}
          className="neo-btn neo-btn-secondary mt-7 flex min-h-[54px] w-full items-center justify-center px-4 text-base"
        >
          Continue with Google
        </button>

        {authenticating && (
          <div className="mt-4 flex items-center gap-2.5">
            <Loader2 className="h-4 w-4 animate-spin text-neo-blue" />
            <p className="text-xs text-[#64748b]">
              Finish Google sign-in in your browser. PayCycle will reopen automatically.
            </p>
          </div>
        )}

        <button
          onClick={handleTemporaryBypass}
          className="neo-btn neo-btn-light mt-4 flex min-h-[50px] w-full items-center justify-center px-4 text-base"
        >
          Demo Account
        </button>

        <p className="mx-auto mt-4 max-w-xs text-center text-xs text-[#64748b]">
          Google sign-in opens in your browser and returns to PayCycle when it finishes.
        </p>
      </div>
    );
  }

  // ── Dashboard ──
  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 pb-32 pt-4">
      {/* Header */}
      <div className="neo-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-neo-orange" style={{ fontFamily: "var(--font-heading)" }}>
              PayCycle
            </p>
            <h1 className="mt-1 text-xl font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
              {formatMonthYear(new Date())}
            </h1>
          </div>
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2"
            >
              {session.user.avatar_url ? (
                <img
                  src={session.user.avatar_url}
                  alt=""
                  className="neo-avatar h-11 w-11 object-cover"
                />
              ) : (
                <div className="neo-avatar flex h-11 w-11 items-center justify-center bg-neo-blue">
                  <span className="text-sm font-bold text-white" style={{ fontFamily: "var(--font-heading)" }}>
                    {getInitials(session.user.name)}
                  </span>
                </div>
              )}
            </button>
            {dropdownOpen && (
              <div className="neo-card absolute right-0 top-14 z-50 w-48 p-1">
                <div className="px-3 py-2">
                  <p className="text-sm font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>{session.user.name}</p>
                  <p className="text-xs text-[#64748b]">{session.user.email}</p>
                </div>
                <hr className="mx-2 border-t-2 border-[#141414]" />
                <button
                  onClick={handleLogout}
                  className="neo-btn neo-btn-red mt-1 flex w-full items-center gap-2 rounded-none px-3 py-2 text-sm shadow-none"
                  style={{ boxShadow: "none", border: "none" }}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
        {session.mode === "demo" && (
          <p className="mt-2 text-xs leading-tight text-neo-purple" style={{ fontFamily: "var(--font-heading)" }}>
            Demo mode. Commitments are stored locally on this device.
          </p>
        )}
      </div>

      {/* Error */}
      {dashboardError && (
        <div className="neo-error mt-4 p-4">
          <p className="text-sm font-bold text-red-700" style={{ fontFamily: "var(--font-heading)" }}>Something needs attention</p>
          <p className="mt-1 text-sm text-red-800">{dashboardError}</p>
        </div>
      )}

      {/* Summary */}
      <div className="mt-5">
        <h2 className="text-lg font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>Summary</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <SummaryCard label="Commitments" value={`${summary.count}`} color="#FF6B35" />
          <SummaryCard label="Paid" value={formatCurrency(summary.paidAmount)} color="#06D6A0" />
          <SummaryCard label="Remaining" value={formatCurrency(summary.remainingAmount)} color="#3A86FF" />
          <SummaryCard label="Total" value={formatCurrency(summary.totalAmount)} color="#8338EC" />
        </div>
        <p className="mt-3 text-xs text-[#475569]">
          {summary.paidCount}/{summary.count} paid this month.
        </p>
      </div>

      {/* List */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>List</h2>
          {loadingCommitments && <Loader2 className="h-4 w-4 animate-spin text-neo-orange" />}
        </div>

        {commitments.length === 0 ? (
          <div className="neo-card mt-3 p-4">
            <p className="text-base font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>No recurring commitments yet.</p>
            <p className="mt-2 text-xs leading-relaxed text-[#64748b]">
              Add one and PayCycle will bill it again on the 1st of every month.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {commitments.map((commitment) => {
              const remaining = Math.max(commitment.amount - commitment.paid_amount, 0);
              const isBusy = payingCommitmentId === commitment.id;
              const paid = isCommitmentPaid(commitment);

              return (
                <div key={commitment.id} className="relative group">
                  {/* Edit/Delete overlay */}
                  <div className="absolute inset-0 z-10 hidden group-hover:flex items-center justify-end gap-2 rounded-none px-4"
                    style={{
                      border: "3px solid #141414",
                      backgroundColor: "rgba(255, 107, 53, 0.1)",
                    }}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(commitment); }}
                      className="neo-btn neo-btn-primary flex items-center gap-1.5 px-4 py-2 text-sm"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(commitment); }}
                      className="neo-btn neo-btn-red flex items-center gap-1.5 px-4 py-2 text-sm shadow-none"
                      style={{ boxShadow: "4px 4px 0 #141414" }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Card */}
                  <button
                    onClick={() => handleMarkAsPaid(commitment)}
                    disabled={paid || isBusy}
                    className={`w-full text-left transition-all disabled:opacity-100 ${
                      paid
                        ? "neo-card-paid"
                        : "neo-card"
                    } ${isBusy ? "neo-card-pressed" : ""} p-4`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-[#141414] truncate" style={{ fontFamily: "var(--font-heading)" }}>
                          {commitment.title}
                        </p>
                        <p className="mt-1 text-xs text-[#64748b] truncate">
                          {commitment.category ? `${commitment.category} • ` : ""}
                          Renews on the 1st of every month
                        </p>
                      </div>
                      <span className={`neo-badge shrink-0 ${
                        paid ? "neo-badge-paid" : "neo-badge-pending"
                      }`}>
                        {paid ? (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Paid
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Circle className="h-3 w-3" /> Tap to pay
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-xs text-[#64748b]">Total</p>
                        <p className="text-sm font-bold text-[#141414]">
                          {formatCurrency(commitment.amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#64748b]">Paid</p>
                        <p className="text-sm font-bold text-[#141414]">
                          {formatCurrency(commitment.paid_amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#64748b]">Remaining</p>
                        <p className="text-sm font-bold text-[#141414]">
                          {formatCurrency(remaining)}
                        </p>
                      </div>
                    </div>
                    {isBusy && (
                      <div className="mt-4 flex items-center gap-2.5">
                        <Loader2 className="h-4 w-4 animate-spin text-neo-green" />
                        <p className="text-xs text-neo-green" style={{ fontFamily: "var(--font-heading)" }}>
                          Marking commitment as paid...
                        </p>
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={openAddModal}
        className="neo-fab fixed bottom-6 right-6 z-40 h-16 w-16"
      >
        <Plus className="h-7 w-7 text-[#141414]" />
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
          <div
            className="neo-modal w-full max-w-md p-5 animate-neo-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
                  {editingCommitment ? "Edit commitment" : "New commitment"}
                </h3>
                <p className="mt-1 text-sm text-[#64748b]">
                  {editingCommitment
                    ? "Update this recurring monthly item."
                    : "Add a monthly item to your dashboard."}
                </p>
              </div>
              <button onClick={closeModal} className="neo-btn neo-btn-light shrink-0 px-2 py-1 text-sm">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>Title</label>
                <input
                  placeholder="Netflix subscription"
                  className="neo-input w-full px-4 py-3 text-sm text-[#141414]"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="89.90"
                  className="neo-input w-full px-4 py-3 text-sm text-[#141414]"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>Category</label>
                <input
                  placeholder="Utilities"
                  className="neo-input w-full px-4 py-3 text-sm text-[#141414]"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
            </div>

            <button
              disabled={submittingCommitment}
              onClick={handleSave}
              className="neo-btn neo-btn-primary mt-5 flex min-h-[52px] w-full items-center justify-center px-4 text-base"
            >
              {submittingCommitment ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                editingCommitment ? "Save changes" : "Save commitment"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="neo-summary-card bg-white p-4">
      <div
        className="h-1 w-10"
        style={{ backgroundColor: color }}
      />
      <p className="mt-3 text-xs text-[#64748b]">{label}</p>
      <p className="mt-1 text-lg font-bold text-[#141414]" style={{ fontFamily: "var(--font-heading)" }}>
        {value}
      </p>
    </div>
  );
}
