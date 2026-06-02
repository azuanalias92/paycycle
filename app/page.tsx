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
  ChevronRight,
  LogOut,
  Circle,
  CheckCircle2,
  Pencil,
  Trash2,
  X,
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
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
          <h2 className="mt-4 text-2xl font-extrabold text-[#0f172a]">Loading PayCycle</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#475569]">
            Preparing your monthly commitment dashboard.
          </p>
        </div>
      </div>
    );
  }

  // ── Auth screen ──
  if (!session) {
    return (
      <div className="flex min-h-screen flex-col justify-center px-6 pb-8 pt-12">
        {/* Logo */}
        <div className="mx-auto mb-6 flex h-[108px] w-[108px] items-center justify-center rounded-3xl bg-blue-600">
          <span className="text-5xl font-black text-white">P</span>
        </div>
        <h1 className="mb-2 text-center text-2xl font-extrabold text-[#0f172a]">PayCycle</h1>
        <h2 className="text-center text-[32px] font-extrabold leading-tight text-[#0f172a]">
          Track your monthly commitments with confidence.
        </h2>
        <p className="mt-3.5 text-center text-base leading-relaxed text-[#475569]">
          Sign in with Google to see this month&apos;s commitments, add new ones,
          and mark them as paid with a satisfying chime.
        </p>

        {authError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-rose-50 p-3.5">
            <p className="text-sm font-bold text-red-700">Login failed</p>
            <p className="mt-1 text-sm text-red-800">{authError}</p>
          </div>
        )}

        <button
          onClick={openGoogleSignIn}
          className="mt-7 flex min-h-[54px] w-full items-center justify-center rounded-2xl bg-blue-600 px-4 font-bold text-white hover:bg-blue-700 active:scale-[0.99] transition-all"
        >
          Continue with Google
        </button>

        {authenticating && (
          <div className="mt-4 flex items-center gap-2.5">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <p className="text-xs text-[#64748b]">
              Finish Google sign-in in your browser. PayCycle will reopen automatically.
            </p>
          </div>
        )}

        <button
          onClick={handleTemporaryBypass}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-slate-200 px-4 font-bold text-[#0f172a] hover:bg-slate-300 transition-colors"
        >
          Temporary bypass login
        </button>

        <p className="mt-3.5 text-center text-xs text-[#64748b]">
          Google sign-in opens in your browser and returns to PayCycle when it finishes.
        </p>
      </div>
    );
  }

  // ── Dashboard ──
  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 pb-28 pt-4">
      {/* Header */}
      <div className="rounded-2xl bg-white p-4 shadow-sm shadow-black/5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600">PayCycle</p>
            <h1 className="mt-1.5 text-2xl font-extrabold text-[#0f172a]">
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
                  className="h-12 w-12 rounded-2xl bg-blue-100 object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
                  <span className="text-lg font-extrabold text-blue-700">
                    {getInitials(session.user.name)}
                  </span>
                </div>
              )}
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-14 z-50 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                <div className="px-3 py-2">
                  <p className="text-sm font-bold text-[#0f172a]">{session.user.name}</p>
                  <p className="text-xs text-[#64748b]">{session.user.email}</p>
                </div>
                <hr className="mx-2 border-slate-100" />
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
        {session.mode === "demo" && (
          <p className="mt-2 text-xs leading-tight text-blue-700">
            Demo mode. Commitments are stored locally on this device.
          </p>
        )}
      </div>

      {/* Error */}
      {dashboardError && (
        <div className="mt-3.5 rounded-xl border border-red-200 bg-rose-50 p-3.5">
          <p className="text-sm font-bold text-red-700">Something needs attention</p>
          <p className="mt-1 text-sm text-red-800">{dashboardError}</p>
        </div>
      )}

      {/* Summary */}
      <div className="mt-4.5">
        <h2 className="text-lg font-extrabold text-[#0f172a]">Summary</h2>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <SummaryCard label="Commitments" value={`${summary.count}`} accent="bg-blue-600" />
          <SummaryCard label="Paid" value={formatCurrency(summary.paidAmount)} accent="bg-green-600" />
          <SummaryCard label="Remaining" value={formatCurrency(summary.remainingAmount)} accent="bg-orange-500" />
          <SummaryCard label="Total planned" value={formatCurrency(summary.totalAmount)} accent="bg-purple-600" />
        </div>
        <p className="mt-2.5 text-xs text-[#475569]">
          {summary.paidCount}/{summary.count} paid this month.
        </p>
      </div>

      {/* List */}
      <div className="mt-4.5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-[#0f172a]">List</h2>
          {loadingCommitments && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
        </div>

        {commitments.length === 0 ? (
          <div className="mt-2.5 rounded-2xl bg-white p-4">
            <p className="text-base font-bold text-[#0f172a]">No recurring commitments yet.</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[#64748b]">
              Add one and PayCycle will bill it again on the 1st of every month.
            </p>
          </div>
        ) : (
          <div className="mt-2.5 space-y-2.5">
            {commitments.map((commitment) => {
              const remaining = Math.max(commitment.amount - commitment.paid_amount, 0);
              const isBusy = payingCommitmentId === commitment.id;
              const paid = isCommitmentPaid(commitment);

              return (
                <div key={commitment.id} className="relative group">
                  {/* Edit/Delete overlay */}
                  <div className="absolute inset-0 z-10 hidden group-hover:flex items-center justify-end gap-2 rounded-2xl bg-blue-50/90 px-4">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(commitment); }}
                      className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(commitment); }}
                      className="rounded-xl bg-red-100 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-200 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Card */}
                  <button
                    onClick={() => handleMarkAsPaid(commitment)}
                    disabled={paid || isBusy}
                    className={`w-full rounded-2xl border p-3.5 text-left transition-all ${
                      paid
                        ? "border-green-200 bg-green-50"
                        : "border-transparent bg-white shadow-sm shadow-black/5 hover:scale-[0.99] active:scale-[0.98]"
                    } disabled:opacity-100`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-extrabold text-[#0f172a] truncate">
                          {commitment.title}
                        </p>
                        <p className="mt-1 text-xs text-[#64748b] truncate">
                          {commitment.category ? `${commitment.category} • ` : ""}
                          Renews on the 1st of every month
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-bold ${
                          paid
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
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
                    <div className="mt-3.5 grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-xs text-[#64748b]">Total</p>
                        <p className="text-sm font-bold text-[#0f172a]">
                          {formatCurrency(commitment.amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#64748b]">Paid</p>
                        <p className="text-sm font-bold text-[#0f172a]">
                          {formatCurrency(commitment.paid_amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#64748b]">Remaining</p>
                        <p className="text-sm font-bold text-[#0f172a]">
                          {formatCurrency(remaining)}
                        </p>
                      </div>
                    </div>
                    {isBusy && (
                      <div className="mt-4 flex items-center gap-2.5">
                        <Loader2 className="h-4 w-4 animate-spin text-green-600" />
                        <p className="text-xs text-green-700">
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
        className="fixed bottom-6 right-6 z-40 flex h-[62px] w-[62px] items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-black/20 hover:bg-blue-700 active:scale-95 transition-all"
      >
        <Plus className="h-7 w-7" />
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3">
          <div
            className="w-full max-w-md rounded-[28px] bg-white p-5 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-extrabold text-[#0f172a]">
                  {editingCommitment ? "Edit commitment" : "New commitment"}
                </h3>
                <p className="mt-1 text-sm text-[#64748b]">
                  {editingCommitment
                    ? "Update this recurring monthly item."
                    : "Add a monthly item to your dashboard."}
                </p>
              </div>
              <button onClick={closeModal} className="shrink-0">
                <X className="h-5 w-5 text-blue-600" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">Title</label>
                <input
                  placeholder="Netflix subscription"
                  className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="89.90"
                  className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">Category</label>
                <input
                  placeholder="Utilities"
                  className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
            </div>

            <button
              disabled={submittingCommitment}
              onClick={handleSave}
              className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-blue-600 px-4 font-bold text-white hover:bg-blue-700 disabled:opacity-75 transition-all"
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

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-3.5 shadow-sm shadow-black/5">
      <div className={`h-1 w-8 rounded-full ${accent}`} />
      <p className="mt-3 text-xs text-[#64748b]">{label}</p>
      <p className="mt-1.5 text-lg font-extrabold text-[#0f172a]">{value}</p>
    </div>
  );
}
