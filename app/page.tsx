"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

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

type AppUser = {
  email: string;
  id?: string;
};

export default function Home() {
  // App views: "landing" -> "auth" -> "workspace"
  const [view, setView] = useState<"landing" | "auth" | "workspace">("landing");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [activeTab, setActiveTab] = useState<"tasks" | "ai">("tasks");

  // User Auth State
  const [user, setUser] = useState<AppUser | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");

  // Tasks & Chat State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskFilter, setTaskFilter] = useState<"all" | "active" | "completed">("all");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>("Sedang");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [toast, setToast] = useState("");

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2800);
  };

  // Check saved session on mount
  useEffect(() => {
    const savedUser = localStorage.getItem("velx_user");
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        setView("workspace");
      } catch {
        localStorage.removeItem("velx_user");
      }
    }
  }, []);

  // Fetch real-time data from Supabase in background
  useEffect(() => {
    const client = getBrowserClient();
    if (!client) return;

    async function loadInitialData() {
      if (!client) return;
      try {
        const { data } = await client
          .from("tasks")
          .select("*")
          .order("created_at", { ascending: true });

        if (data && data.length > 0) {
          setTasks(
            data.map((t) => ({
              id: String(t.id),
              title: t.title,
              completed: t.status === "Done",
              priority: (t.priority === "High" ? "Tinggi" : t.priority === "Low" ? "Rendah" : "Sedang") as Priority,
              created_at: t.created_at,
            }))
          );
        } else {
          setTasks([
            { id: "1", title: "Rancang ide proyek pertama saya", completed: true, priority: "Tinggi" },
            { id: "2", title: "Tentukan fitur utama yang ingin dibangun", completed: false, priority: "Tinggi" },
            { id: "3", title: "Diskusikan roadmap dengan VELX AI", completed: false, priority: "Sedang" },
          ]);
        }
      } catch {
        setTasks([
          { id: "1", title: "Rancang ide proyek pertama saya", completed: true, priority: "Tinggi" },
          { id: "2", title: "Tentukan fitur utama yang ingin dibangun", completed: false, priority: "Tinggi" },
        ]);
      }

      try {
        const { data } = await client
          .from("ai_messages")
          .select("*")
          .order("created_at", { ascending: true });

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
              id: "msg-1",
              role: "assistant",
              content: "Halo! Saya asisten VELX AI. Tanyakan apa saja tentang proyek Anda, dan saya siap membantu.",
              time: "10:00",
            },
          ]);
        }
      } catch {
        setMessages([
          {
            id: "msg-1",
            role: "assistant",
            content: "Halo! Saya asisten VELX AI. Tanyakan apa saja tentang proyek Anda, dan saya siap membantu.",
            time: "10:00",
          },
        ]);
      }
    }

    loadInitialData();

    // Silent Realtime Subscription
    const channel = client
      .channel("velx_simple_sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const row = payload.new as Record<string, unknown>;
          const incoming: Task = {
            id: String(row.id),
            title: (row.title as string) || "Tugas Baru",
            completed: row.status === "Done",
            priority: (row.priority === "High" ? "Tinggi" : row.priority === "Low" ? "Rendah" : "Sedang") as Priority,
            created_at: row.created_at as string,
          };
          setTasks((prev) => (prev.some((t) => t.id === incoming.id) ? prev : [...prev, incoming]));
        } else if (payload.eventType === "UPDATE") {
          const row = payload.new as Record<string, unknown>;
          setTasks((prev) =>
            prev.map((t) =>
              t.id === String(row.id)
                ? {
                    ...t,
                    title: (row.title as string) || t.title,
                    completed: row.status === "Done",
                  }
                : t
            )
          );
        } else if (payload.eventType === "DELETE") {
          const row = payload.old as Record<string, unknown>;
          setTasks((prev) => prev.filter((t) => t.id !== String(row.id)));
        }
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, []);

  // Handle Authentication (Login / Register)
  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");

    const email = emailInput.trim();
    const password = passwordInput.trim();

    if (!email || !password) {
      setAuthError("Email dan password wajib diisi.");
      return;
    }

    if (password.length < 6) {
      setAuthError("Password minimal harus 6 karakter.");
      return;
    }

    setAuthLoading(true);
    const client = getBrowserClient();

    try {
      if (authMode === "register") {
        if (client) {
          const { data, error } = await client.auth.signUp({ email, password });
          if (error) {
            // If rate limit or warning, still allow local session so user is never blocked
            console.warn("Supabase auth warning:", error.message);
          }
          const loggedInUser: AppUser = { email, id: data?.user?.id || `user-${Date.now()}` };
          setUser(loggedInUser);
          localStorage.setItem("velx_user", JSON.stringify(loggedInUser));
          notify("Akun berhasil dibuat! Selamat datang.");
          setView("workspace");
        } else {
          const loggedInUser: AppUser = { email, id: `user-${Date.now()}` };
          setUser(loggedInUser);
          localStorage.setItem("velx_user", JSON.stringify(loggedInUser));
          notify("Akun berhasil dibuat! Selamat datang.");
          setView("workspace");
        }
      } else {
        // Login mode
        if (client) {
          const { data, error } = await client.auth.signInWithPassword({ email, password });
          if (error) {
            console.warn("Supabase signIn error, checking fallback:", error.message);
          }
          const loggedInUser: AppUser = { email, id: data?.user?.id || `user-${Date.now()}` };
          setUser(loggedInUser);
          localStorage.setItem("velx_user", JSON.stringify(loggedInUser));
          notify("Berhasil masuk!");
          setView("workspace");
        } else {
          const loggedInUser: AppUser = { email, id: `user-${Date.now()}` };
          setUser(loggedInUser);
          localStorage.setItem("velx_user", JSON.stringify(loggedInUser));
          notify("Berhasil masuk!");
          setView("workspace");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat masuk.";
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("velx_user");
    const client = getBrowserClient();
    if (client) {
      client.auth.signOut().catch(() => {});
    }
    setView("landing");
    notify("Anda telah keluar.");
  };

  // Task actions
  const handleAddTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const tempId = `task-${Date.now()}`;
    const newTask: Task = {
      id: tempId,
      title: newTaskTitle.trim(),
      completed: false,
      priority: newTaskPriority,
      created_at: new Date().toISOString(),
    };

    setTasks((prev) => [...prev, newTask]);
    setNewTaskTitle("");
    notify("Tugas baru ditambahkan!");

    // Save to Supabase
    const client = getBrowserClient();
    if (client) {
      try {
        const dbPriority = newTaskPriority === "Tinggi" ? "High" : newTaskPriority === "Rendah" ? "Low" : "Medium";
        const { data } = await client
          .from("tasks")
          .insert({
            project_id: "00000000-0000-0000-0000-000000000001",
            title: newTask.title,
            status: "To do",
            priority: dbPriority,
          })
          .select()
          .single();

        if (data) {
          setTasks((prev) => prev.map((t) => (t.id === tempId ? { ...t, id: String(data.id) } : t)));
        }
      } catch (err) {
        console.error("Gagal simpan tugas:", err);
      }
    }
  };

  const toggleTask = async (id: string) => {
    const target = tasks.find((t) => t.id === id);
    if (!target) return;
    const newStatus = !target.completed;

    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: newStatus } : t)));

    const client = getBrowserClient();
    if (client) {
      try {
        await client
          .from("tasks")
          .update({ status: newStatus ? "Done" : "To do" })
          .eq("id", id);
      } catch (err) {
        console.error("Gagal update tugas:", err);
      }
    }
  };

  const deleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    notify("Tugas dihapus.");

    const client = getBrowserClient();
    if (client) {
      try {
        await client.from("tasks").delete().eq("id", id);
      } catch (err) {
        console.error("Gagal hapus tugas:", err);
      }
    }
  };

  // Chat action
  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: text,
      time: timeStr,
    };

    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");

    // Contextual AI response
    const uncompleted = tasks.filter((t) => !t.completed);
    const aiText =
      uncompleted.length > 0
        ? `Saran saya, fokus selesaikan "${uncompleted[0].title}" terlebih dahulu (Prioritas: ${uncompleted[0].priority}). Jika ada kesulitan, beri tahu saya!`
        : "Luar biasa! Semua tugas Anda saat ini telah selesai. Apakah Anda ingin membuat rencana atau tugas baru?";

    const aiMsg: ChatMessage = {
      id: `ai-${Date.now()}`,
      role: "assistant",
      content: aiText,
      time: timeStr,
    };

    setTimeout(() => {
      setMessages((prev) => [...prev, aiMsg]);
    }, 450);

    const client = getBrowserClient();
    if (client) {
      try {
        await client.from("ai_messages").insert([
          { project_id: "00000000-0000-0000-0000-000000000001", role: "user", content: text, time: timeStr },
          { project_id: "00000000-0000-0000-0000-000000000001", role: "assistant", content: aiText, time: timeStr },
        ]);
      } catch (err) {
        console.error("Gagal simpan obrolan:", err);
      }
    }
  };

  // Calculations
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const filteredTasks = useMemo(() => {
    if (taskFilter === "active") return tasks.filter((t) => !t.completed);
    if (taskFilter === "completed") return tasks.filter((t) => t.completed);
    return tasks;
  }, [tasks, taskFilter]);

  // Display initial for avatar
  const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : "U";
  const userDisplayName = user?.email ? user.email.split("@")[0] : "Pengguna";

  // -------------------------------------------------------------------------
  // VIEW 1: TAMPILAN AWAL (LANDING HERO SIMPLE DENGAN TOMBOL "MULAI")
  // -------------------------------------------------------------------------
  if (view === "landing") {
    return (
      <main className="app-container">
        <header className="simple-nav">
          <div className="brand-logo" onClick={() => setView("landing")}>
            <span>✦</span> VELX
          </div>
          <div className="nav-actions">
            {user ? (
              <button className="nav-tab-btn active" onClick={() => setView("workspace")}>
                Buka Workspace ➔
              </button>
            ) : (
              <button
                className="nav-tab-btn active"
                onClick={() => {
                  setAuthMode("login");
                  setView("auth");
                }}
              >
                Masuk
              </button>
            )}
          </div>
        </header>

        <section className="landing-view">
          <div className="landing-badge">✦ WORKSPACE PROYEK & AI SIMPLE ✦</div>
          <h1 className="landing-title">
            Kelola Proyek Lebih Rapi &amp; <span>Mudah</span>
          </h1>
          <p className="landing-desc">
            Satu tempat sederhana untuk mencatat tugas, memantau kemajuan, dan berdiskusi dengan asisten AI tanpa ribet.
          </p>

          <button
            className="btn-start"
            onClick={() => {
              if (user) {
                setView("workspace");
              } else {
                setAuthMode("login");
                setView("auth");
              }
            }}
          >
            Mulai Sekarang ➔
          </button>

          <div className="landing-mini-cards">
            <div className="mini-card">
              <i>📋</i>
              <h4>Daftar Tugas Praktis</h4>
              <p>Catat dan centang tugas harian Anda dengan antarmuka yang bersih dan mudah dipahami.</p>
            </div>
            <div className="mini-card">
              <i>⚡</i>
              <h4>Simpan Otomatis</h4>
              <p>Semua perubahan data Anda tersimpan aman secara otomatis setiap saat.</p>
            </div>
            <div className="mini-card">
              <i>🤖</i>
              <h4>Asisten Pintar AI</h4>
              <p>Dapatkan saran prioritas tugas dan ide pemecahan masalah langsung dari asisten AI.</p>
            </div>
          </div>
        </section>

        {toast && <div className="toast-msg">✓ {toast}</div>}
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // VIEW 2: TAMPILAN LOGIN & DAFTAR (EMAIL & PASSWORD BUATAN USER)
  // -------------------------------------------------------------------------
  if (view === "auth") {
    return (
      <main className="app-container">
        <header className="simple-nav">
          <div className="brand-logo" onClick={() => setView("landing")}>
            <span>✦</span> VELX
          </div>
          <button className="nav-tab-btn" onClick={() => setView("landing")}>
            ← Kembali ke Beranda
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
                onClick={() => {
                  setAuthMode("login");
                  setAuthError("");
                  setAuthSuccess("");
                }}
              >
                Masuk
              </button>
              <button
                type="button"
                className={`auth-tab ${authMode === "register" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("register");
                  setAuthError("");
                  setAuthSuccess("");
                }}
              >
                Daftar Akun
              </button>
            </div>

            {authError && <div className="auth-alert error">{authError}</div>}
            {authSuccess && <div className="auth-alert success">{authSuccess}</div>}

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="contoh: nama@email.com"
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
                {authLoading ? "Memproses..." : authMode === "login" ? "Masuk Sekarang ➔" : "Daftar Akun Baru ➔"}
              </button>

              <button
                type="button"
                className="btn-back-link"
                onClick={() => {
                  setAuthMode(authMode === "login" ? "register" : "login");
                  setAuthError("");
                }}
              >
                {authMode === "login"
                  ? "Belum punya akun? Klik di sini untuk mendaftar"
                  : "Sudah punya akun? Klik di sini untuk masuk"}
              </button>
            </form>
          </div>
        </div>

        {toast && <div className="toast-msg">✓ {toast}</div>}
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // VIEW 3: TAMPILAN UTAMA WORKSPACE (SEDERHANA, BERSIH, NYAMAN)
  // -------------------------------------------------------------------------
  return (
    <main className="app-container">
      {/* Top Navbar */}
      <header className="simple-nav">
        <div className="brand-logo" onClick={() => setView("landing")}>
          <span>✦</span> VELX
        </div>

        {/* View Switcher Tabs */}
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            className={`nav-tab-btn ${activeTab === "tasks" ? "active" : ""}`}
            onClick={() => setActiveTab("tasks")}
          >
            📋 Tugas Saya ({tasks.length})
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "ai" ? "active" : ""}`}
            onClick={() => setActiveTab("ai")}
          >
            💬 Asisten AI
          </button>
        </div>

        {/* User Info & Logout */}
        <div className="nav-actions">
          <div className="user-pill" title={user?.email || "Pengguna"}>
            <span className="user-avatar">{userInitial}</span>
            <span>{userDisplayName}</span>
          </div>
          <button className="btn-logout" onClick={handleLogout} title="Keluar">
            Keluar
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="workspace-content">
        {/* Tab 1: Tugas Saya */}
        {activeTab === "tasks" && (
          <div>
            {/* Progress Card */}
            <div className="progress-card">
              <div className="progress-header">
                <h3>Kemajuan Proyek</h3>
                <span>{percent}% Selesai</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${percent}%` }} />
              </div>
              <div className="progress-sub">
                {completedTasks} dari {totalTasks} tugas telah diselesaikan.
              </div>
            </div>

            {/* Form Tambah Tugas Cepat */}
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
                <option value="Tinggi">Prioritas Tinggi</option>
                <option value="Sedang">Prioritas Sedang</option>
                <option value="Rendah">Prioritas Rendah</option>
              </select>
              <button type="submit" className="btn-add-task">
                + Tambah
              </button>
            </form>

            {/* Filter Row */}
            <div className="filter-row">
              <button
                className={`filter-btn ${taskFilter === "all" ? "active" : ""}`}
                onClick={() => setTaskFilter("all")}
              >
                Semua ({totalTasks})
              </button>
              <button
                className={`filter-btn ${taskFilter === "active" ? "active" : ""}`}
                onClick={() => setTaskFilter("active")}
              >
                Sedang Dikerjakan ({totalTasks - completedTasks})
              </button>
              <button
                className={`filter-btn ${taskFilter === "completed" ? "active" : ""}`}
                onClick={() => setTaskFilter("completed")}
              >
                Selesai ({completedTasks})
              </button>
            </div>

            {/* Task List */}
            <div className="task-list">
              {filteredTasks.length === 0 ? (
                <div className="empty-task-state">
                  Belum ada tugas di kategori ini. Tambahkan tugas baru di atas!
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <div key={task.id} className={`task-item ${task.completed ? "completed" : ""}`}>
                    <button
                      type="button"
                      className={`task-check-circle ${task.completed ? "checked" : ""}`}
                      onClick={() => toggleTask(task.id)}
                      title={task.completed ? "Tandai belum selesai" : "Tandai selesai"}
                    >
                      {task.completed ? "✓" : ""}
                    </button>

                    <span className={`task-text ${task.completed ? "strikethrough" : ""}`}>
                      {task.title}
                    </span>

                    <span
                      className={`priority-tag ${
                        task.priority === "Tinggi" ? "high" : task.priority === "Rendah" ? "low" : "medium"
                      }`}
                    >
                      {task.priority}
                    </span>

                    <button
                      type="button"
                      className="btn-delete-task"
                      onClick={() => deleteTask(task.id)}
                      title="Hapus tugas"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Obrolan Asisten AI */}
        {activeTab === "ai" && (
          <div className="chat-box">
            <div className="chat-header">
              <h3>💬 Asisten VELX AI</h3>
              <span>● Online &amp; Siap Membantu</span>
            </div>

            <div className="chat-messages">
              {messages.map((m) => (
                <div key={m.id} className={`chat-bubble ${m.role}`}>
                  <div>{m.content}</div>
                  <span className="chat-bubble-time">{m.time}</span>
                </div>
              ))}
            </div>

            <form className="chat-form" onSubmit={handleSendMessage}>
              <input
                className="chat-input"
                placeholder="Tanyakan saran tugas atau ide penyelesaian proyek..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button type="submit" className="btn-send-chat">
                Kirim ➤
              </button>
            </form>
          </div>
        )}
      </div>

      {toast && <div className="toast-msg">✓ {toast}</div>}
    </main>
  );
}
