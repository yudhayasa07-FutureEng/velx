"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getOptionalClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type Priority = "Tinggi" | "Sedang" | "Rendah";

type Task = {
  id: string;
  title: string;
  completed: boolean;
  priority: Priority;
  created_at?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: map DB priority string → UI priority label
// ─────────────────────────────────────────────────────────────────────────────
function toPriority(raw: string): Priority {
  if (raw === "High" || raw === "Tinggi") return "Tinggi";
  if (raw === "Low" || raw === "Rendah") return "Rendah";
  return "Sedang";
}
function toDbPriority(p: Priority): string {
  if (p === "Tinggi") return "High";
  if (p === "Rendah") return "Low";
  return "Medium";
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  // App views: landing → auth → workspace
  const [view, setView] = useState<"landing" | "auth" | "workspace">("landing");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [activeTab, setActiveTab] = useState<"tasks" | "ai">("tasks");

  // Supabase Auth state
  const [user, setUser] = useState<User | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // Task state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskFilter, setTaskFilter] = useState<"all" | "active" | "completed">("all");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>("Sedang");
  const [taskLoading, setTaskLoading] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");

  // Toast
  const [toast, setToast] = useState("");
  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2800);
  };

  // ─── Restore session on mount ───────────────────────────────────────────────
  useEffect(() => {
    const client = getOptionalClient();
    if (!client) return;

    // Check existing session
    client.auth.getSession().then(({ data: sessionData }) => {
      if (sessionData.session?.user) {
        setUser(sessionData.session.user);
        setView("workspace");
      }
    });

    // Listen to auth state changes (login / logout)
    const { data: { subscription } } = client.auth.onAuthStateChange(
      (_event: string, session: { user: User } | null) => {
        if (session?.user) {
          setUser(session.user);
          setView("workspace");
        } else {
          setUser(null);
          setView("landing");
          setTasks([]);
          setMessages([]);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ─── Load user's tasks from Supabase (no realtime) ──────────────────────────
  useEffect(() => {
    if (!user) return;
    const client = getOptionalClient();
    if (!client) return;

    setTaskLoading(true);

    type TaskRow = { id: string | number; title: string; status: string; priority: string; created_at: string };
    type MsgRow = { id: string | number; role: string; content: string; time: string; created_at: string };

    client
      .from("tasks")
      .select("id, title, status, priority, created_at")
      .order("created_at", { ascending: true })
      .then(({ data }: { data: TaskRow[] | null }) => {
        if (data && data.length > 0) {
          setTasks(
            data.map((t) => ({
              id: String(t.id),
              title: t.title,
              completed: t.status === "Done",
              priority: toPriority(t.priority),
              created_at: t.created_at,
            }))
          );
        } else {
          setTasks([]);
        }
      })
      .catch((err: Error) => console.error("Failed to load tasks:", err))
      .finally(() => setTaskLoading(false));

    // Load AI messages
    client
      .from("ai_messages")
      .select("id, role, content, time, created_at")
      .order("created_at", { ascending: true })
      .then(({ data }: { data: MsgRow[] | null }) => {
        if (data && data.length > 0) {
          setMessages(
            data.map((m) => ({
              id: String(m.id),
              role: m.role as "user" | "assistant",
              content: m.content,
              time: m.time || "10:00",
            }))
          );
        } else {
          setMessages([
            {
              id: "welcome",
              role: "assistant",
              content: `Halo! Saya VELX AI. Tugas apa yang sedang Anda kerjakan hari ini?`,
              time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            },
          ]);
        }
      })
      .catch(console.error);
  }, [user]);

  // ─── Auth: Login / Register ──────────────────────────────────────────────────
  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError("");

    const email = emailInput.trim();
    const password = passwordInput;

    if (!email || !password) {
      setAuthError("Email dan password wajib diisi.");
      return;
    }
    if (password.length < 6) {
      setAuthError("Password minimal 6 karakter.");
      return;
    }

    setAuthLoading(true);
    const client = getOptionalClient();

    if (!client) {
      setAuthError("Konfigurasi Supabase belum tersedia. Hubungi pengelola aplikasi.");
      setAuthLoading(false);
      return;
    }

    try {
      if (authMode === "register") {
        const { data, error } = await client.auth.signUp({ email, password });
        if (error) {
          if (error.message.toLowerCase().includes("already")) {
            setAuthError("Email sudah terdaftar. Silakan masuk.");
          } else {
            setAuthError(error.message);
          }
          return;
        }

        if (!data.session) {
          setPasswordInput("");
          setAuthMode("login");
          notify("Akun dibuat. Periksa email untuk verifikasi sebelum masuk.");
          return;
        }

        notify("Akun berhasil dibuat! Selamat datang 🎉");
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.message.toLowerCase().includes("invalid")) {
            setAuthError("Email atau password salah.");
          } else {
            setAuthError(error.message);
          }
          return;
        }
        notify("Berhasil masuk! 👋");
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    const client = getOptionalClient();
    if (client) await client.auth.signOut();
    notify("Anda telah keluar.");
  };

  // ─── Add Task ────────────────────────────────────────────────────────────────
  const handleAddTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !user) return;

    const client = getOptionalClient();
    if (!client) {
      notify("Tidak dapat terhubung ke database.");
      return;
    }

    const { data, error } = await client
      .from("tasks")
      .insert({
        user_id: user.id,
        title: newTaskTitle.trim(),
        status: "To do",
        priority: toDbPriority(newTaskPriority),
        phase: "General",
        description: "",
      })
      .select("id, title, status, priority, created_at")
      .single();

    if (error) {
      notify("Gagal menyimpan tugas.");
      console.error(error);
      return;
    }

    setTasks((prev) => [
      ...prev,
      {
        id: String(data.id),
        title: data.title,
        completed: false,
        priority: newTaskPriority,
        created_at: data.created_at,
      },
    ]);
    setNewTaskTitle("");
    notify("Tugas berhasil disimpan!");
  };

  // ─── Toggle Task ─────────────────────────────────────────────────────────────
  const toggleTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    const newStatus = !task.completed;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: newStatus } : t)));

    const client = getOptionalClient();
    if (client) {
      await client
        .from("tasks")
        .update({ status: newStatus ? "Done" : "To do" })
        .eq("id", id)
        .catch(console.error);
    }
  };

  // ─── Delete Task ─────────────────────────────────────────────────────────────
  const deleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    notify("Tugas dihapus.");

    const client = getOptionalClient();
    if (client) {
      await client.from("tasks").delete().eq("id", id).catch(console.error);
    }
  };

  // ─── Send Chat ───────────────────────────────────────────────────────────────
  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || !user) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text, time: timeStr };

    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");

    // Contextual reply
    const pending = tasks.filter((t) => !t.completed);
    const aiText =
      pending.length > 0
        ? `Fokus selesaikan "${pending[0].title}" (Prioritas: ${pending[0].priority}). Ada hal lain yang perlu saya bantu?`
        : "Semua tugas Anda sudah selesai. Apakah ingin merencanakan tahap berikutnya?";

    const aiMsg: ChatMessage = { id: `a-${Date.now()}`, role: "assistant", content: aiText, time: timeStr };

    setTimeout(() => setMessages((prev) => [...prev, aiMsg]), 400);

    // Save to DB
    const client = getOptionalClient();
    if (client) {
      await client
        .from("ai_messages")
        .insert([
          { user_id: user.id, role: "user", content: text, time: timeStr },
          { user_id: user.id, role: "assistant", content: aiText, time: timeStr },
        ])
        .catch(console.error);
    }
  };

  // ─── Derived metrics ─────────────────────────────────────────────────────────
  const totalTasks = tasks.length;
  const completedCount = tasks.filter((t) => t.completed).length;
  const percent = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  const filteredTasks = useMemo(() => {
    if (taskFilter === "active") return tasks.filter((t) => !t.completed);
    if (taskFilter === "completed") return tasks.filter((t) => t.completed);
    return tasks;
  }, [tasks, taskFilter]);

  const userDisplay = user?.email?.split("@")[0] ?? "Pengguna";
  const userInitial = userDisplay.charAt(0).toUpperCase();

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW 1 — LANDING
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "landing") {
    return (
      <main className="app-container">
        <header className="simple-nav">
          <div className="brand-logo">
            <span>✦</span> VELX
          </div>
          <div className="nav-actions">
            <button
              className="nav-tab-btn active"
              onClick={() => { setAuthMode("login"); setView("auth"); }}
            >
              Masuk
            </button>
          </div>
        </header>

        <section className="landing-view">
          <div className="landing-badge">✦ MANAJEMEN PROYEK DENGAN AI</div>
          <h1 className="landing-title">
            Kelola Tugas Lebih Rapi &amp; <span>Efisien</span>
          </h1>
          <p className="landing-desc">
            Satu tempat sederhana untuk mencatat tugas Anda, memantau kemajuan,
            dan berdiskusi dengan asisten AI — aman dan privat untuk setiap akun.
          </p>

          <button
            className="btn-start"
            onClick={() => { setAuthMode("login"); setView("auth"); }}
          >
            Mulai Sekarang ➔
          </button>

          <div className="landing-mini-cards">
            <div className="mini-card">
              <i>📋</i>
              <h4>Daftar Tugas Praktis</h4>
              <p>Catat dan tandai tugas selesai dengan tampilan yang bersih dan mudah.</p>
            </div>
            <div className="mini-card">
              <i>🔒</i>
              <h4>Data Pribadi & Aman</h4>
              <p>Setiap akun menyimpan datanya sendiri. Tidak ada pengguna lain yang bisa melihat tugas Anda.</p>
            </div>
            <div className="mini-card">
              <i>🤖</i>
              <h4>Asisten Pintar AI</h4>
              <p>Dapatkan saran prioritas tugas secara instan dari asisten AI berbasis konteks.</p>
            </div>
          </div>
        </section>

        {toast && <div className="toast-msg">✓ {toast}</div>}
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW 2 — AUTH (Login / Register)
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "auth") {
    return (
      <main className="app-container">
        <header className="simple-nav">
          <div className="brand-logo" style={{ cursor: "pointer" }} onClick={() => setView("landing")}>
            <span>✦</span> VELX
          </div>
          <button className="nav-tab-btn" onClick={() => setView("landing")}>
            ← Kembali
          </button>
        </header>

        <div className="auth-wrapper">
          <div className="auth-card">
            <div className="auth-header">
              <div className="brand-logo" style={{ justifyContent: "center" }}>
                <span>✦</span> VELX
              </div>
              <h2>{authMode === "login" ? "Masuk ke Akun Anda" : "Buat Akun Baru"}</h2>
              <p>Gunakan email dan password Anda sendiri</p>
            </div>

            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab ${authMode === "login" ? "active" : ""}`}
                onClick={() => { setAuthMode("login"); setAuthError(""); }}
              >
                Masuk
              </button>
              <button
                type="button"
                className={`auth-tab ${authMode === "register" ? "active" : ""}`}
                onClick={() => { setAuthMode("register"); setAuthError(""); }}
              >
                Daftar Akun
              </button>
            </div>

            {authError && <div className="auth-alert error">{authError}</div>}

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="nama@email.com"
                  required
                  autoFocus
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Minimal 6 karakter"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                />
              </div>

              <button type="submit" className="btn-auth-submit" disabled={authLoading}>
                {authLoading
                  ? "Memproses..."
                  : authMode === "login"
                  ? "Masuk ➔"
                  : "Daftar Sekarang ➔"}
              </button>

              <button
                type="button"
                className="btn-back-link"
                onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}
              >
                {authMode === "login"
                  ? "Belum punya akun? Daftar di sini"
                  : "Sudah punya akun? Masuk di sini"}
              </button>
            </form>
          </div>
        </div>

        {toast && <div className="toast-msg">✓ {toast}</div>}
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW 3 — WORKSPACE
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <main className="app-container">
      {/* Navbar */}
      <header className="simple-nav">
        <div className="brand-logo">
          <span>✦</span> VELX
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            className={`nav-tab-btn ${activeTab === "tasks" ? "active" : ""}`}
            onClick={() => setActiveTab("tasks")}
          >
            📋 Tugas ({totalTasks})
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "ai" ? "active" : ""}`}
            onClick={() => setActiveTab("ai")}
          >
            💬 Asisten AI
          </button>
        </div>

        <div className="nav-actions">
          <div className="user-pill">
            <span className="user-avatar">{userInitial}</span>
            <span>{userDisplay}</span>
          </div>
          <button className="btn-logout" onClick={handleLogout}>
            Keluar
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="workspace-content">

        {/* ── Tab 1: Tugas ── */}
        {activeTab === "tasks" && (
          <div>
            {/* Progress Bar */}
            <div className="progress-card">
              <div className="progress-header">
                <h3>Kemajuan Anda</h3>
                <span>{percent}% Selesai</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${percent}%` }} />
              </div>
              <div className="progress-sub">
                {completedCount} dari {totalTasks} tugas telah diselesaikan.
              </div>
            </div>

            {/* Add Task Form */}
            <form className="task-form" onSubmit={handleAddTask}>
              <input
                className="task-input"
                placeholder="Tulis tugas baru di sini..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
              <select
                className="task-select"
                value={newTaskPriority}
                onChange={(e) => setNewTaskPriority(e.target.value as Priority)}
              >
                <option value="Tinggi">Tinggi</option>
                <option value="Sedang">Sedang</option>
                <option value="Rendah">Rendah</option>
              </select>
              <button type="submit" className="btn-add-task">
                + Tambah
              </button>
            </form>

            {/* Filters */}
            <div className="filter-row">
              {(["all", "active", "completed"] as const).map((f) => (
                <button
                  key={f}
                  className={`filter-btn ${taskFilter === f ? "active" : ""}`}
                  onClick={() => setTaskFilter(f)}
                >
                  {f === "all" ? `Semua (${totalTasks})` : f === "active" ? `Dikerjakan (${totalTasks - completedCount})` : `Selesai (${completedCount})`}
                </button>
              ))}
            </div>

            {/* Task List */}
            <div className="task-list">
              {taskLoading ? (
                <div className="empty-task-state">Memuat tugas Anda...</div>
              ) : filteredTasks.length === 0 ? (
                <div className="empty-task-state">
                  {taskFilter === "all"
                    ? "Belum ada tugas. Tambahkan tugas baru di atas!"
                    : "Tidak ada tugas di kategori ini."}
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <div key={task.id} className={`task-item ${task.completed ? "completed" : ""}`}>
                    <button
                      type="button"
                      className={`task-check-circle ${task.completed ? "checked" : ""}`}
                      onClick={() => toggleTask(task.id)}
                    >
                      {task.completed ? "✓" : ""}
                    </button>
                    <span className={`task-text ${task.completed ? "strikethrough" : ""}`}>
                      {task.title}
                    </span>
                    <span className={`priority-tag ${task.priority === "Tinggi" ? "high" : task.priority === "Rendah" ? "low" : "medium"}`}>
                      {task.priority}
                    </span>
                    <button type="button" className="btn-delete-task" onClick={() => deleteTask(task.id)}>
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Tab 2: AI Chat ── */}
        {activeTab === "ai" && (
          <div className="chat-box">
            <div className="chat-header">
              <h3>💬 Asisten VELX AI</h3>
              <span>● Siap Membantu</span>
            </div>

            <div className="chat-messages">
              {messages.map((m) => (
                <div key={m.id} className={`chat-bubble ${m.role}`}>
                  {m.content}
                  <span className="chat-bubble-time">{m.time}</span>
                </div>
              ))}
            </div>

            <form className="chat-form" onSubmit={handleSendMessage}>
              <input
                className="chat-input"
                placeholder="Tanya saran prioritas atau kendala proyek..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button type="submit" className="btn-send-chat">➤</button>
            </form>
          </div>
        )}

      </div>

      {toast && <div className="toast-msg">✓ {toast}</div>}
    </main>
  );
}
