"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserClient, getSupabaseCredentials, saveSupabaseCredentials } from "@/lib/supabase/client";

type Status = "To do" | "In progress" | "Review" | "Done";
type Priority = "High" | "Medium" | "Low";

type Task = {
  id: string;
  project_id?: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  phase: string;
  created_at?: string;
};

type Message = {
  id: string;
  project_id?: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  created_at?: string;
};

const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

function Button({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={className} {...props}>{children}</button>;
}

export default function Home() {
  // Page view: "landing" is the initial presentation screen, "workspace" is the interactive command center
  const [view, setView] = useState<"landing" | "workspace">("landing");

  // Real-time Supabase state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState<"connected" | "connecting" | "offline">("connecting");
  const [lastSyncTime, setLastSyncTime] = useState<string>("");

  // Modals & UI state
  const [modal, setModal] = useState<"create" | "blueprint" | "report" | "supabase-config" | null>(null);
  const [input, setInput] = useState("");
  const [approved, setApproved] = useState(false);
  const [toast, setToast] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [isSeeding, setIsSeeding] = useState(false);

  // New task form inside modal
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPhase, setNewTaskPhase] = useState("Planning");
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>("Medium");

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };

  // Check credentials on mount
  useEffect(() => {
    const creds = getSupabaseCredentials();
    if (creds.url) setCustomUrl(creds.url);
    if (creds.key) setCustomKey(creds.key);
  }, []);

  // Fetch real-time data from Supabase
  const fetchData = useCallback(async () => {
    const client = getBrowserClient();
    if (!client) {
      setRealtimeStatus("offline");
      setIsLoading(false);
      return;
    }

    try {
      setRealtimeStatus("connecting");

      // 1. Fetch live tasks from PostgreSQL
      const { data: dbTasks, error: taskError } = await client
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: true });

      if (taskError) {
        console.warn("Could not query tasks:", taskError.message);
      } else if (dbTasks && dbTasks.length > 0) {
        setTasks(
          dbTasks.map((t) => ({
            id: String(t.id),
            project_id: t.project_id,
            title: t.title,
            description: t.description || "",
            status: t.status as Status,
            priority: t.priority as Priority,
            phase: t.phase || "General",
            created_at: t.created_at,
          }))
        );
      }

      // 2. Fetch live messages from PostgreSQL
      const { data: dbMessages, error: msgError } = await client
        .from("ai_messages")
        .select("*")
        .order("created_at", { ascending: true });

      if (msgError) {
        console.warn("Could not query messages:", msgError.message);
      } else if (dbMessages && dbMessages.length > 0) {
        setMessages(
          dbMessages.map((m) => ({
            id: String(m.id),
            project_id: m.project_id,
            role: m.role as "user" | "assistant",
            content: m.content,
            time: m.time || "10:00",
            created_at: m.created_at,
          }))
        );
      }

      setRealtimeStatus("connected");
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Supabase fetch error:", err);
      setRealtimeStatus("offline");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize and listen to Supabase Realtime channel
  useEffect(() => {
    fetchData();

    const client = getBrowserClient();
    if (!client) return;

    // Supabase Realtime Subscription channel
    const channel = client
      .channel("velx_live_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        (payload) => {
          setLastSyncTime(new Date().toLocaleTimeString());
          if (payload.eventType === "INSERT") {
            const newItem = payload.new as Record<string, unknown>;
            const formatted: Task = {
              id: String(newItem.id),
              project_id: newItem.project_id as string,
              title: (newItem.title as string) || "Untitled Task",
              description: (newItem.description as string) || "",
              status: (newItem.status as Status) || "To do",
              priority: (newItem.priority as Priority) || "Medium",
              phase: (newItem.phase as string) || "General",
              created_at: newItem.created_at as string,
            };
            setTasks((prev) => {
              if (prev.some((t) => t.id === formatted.id)) return prev;
              return [...prev, formatted];
            });
            notify(`Tugas baru tersinkronisasi: "${formatted.title}"`);
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Record<string, unknown>;
            setTasks((prev) =>
              prev.map((t) =>
                t.id === String(updated.id)
                  ? {
                      ...t,
                      title: (updated.title as string) || t.title,
                      description: (updated.description as string) || t.description,
                      status: (updated.status as Status) || t.status,
                      priority: (updated.priority as Priority) || t.priority,
                      phase: (updated.phase as string) || t.phase,
                    }
                  : t
              )
            );
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old as Record<string, unknown>;
            setTasks((prev) => prev.filter((t) => t.id !== String(deleted.id)));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ai_messages" },
        (payload) => {
          setLastSyncTime(new Date().toLocaleTimeString());
          const newMsg = payload.new as Record<string, unknown>;
          const formatted: Message = {
            id: String(newMsg.id),
            project_id: newMsg.project_id as string,
            role: (newMsg.role as "user" | "assistant") || "assistant",
            content: (newMsg.content as string) || "",
            time: (newMsg.time as string) || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            created_at: newMsg.created_at as string,
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === formatted.id)) return prev;
            return [...prev, formatted];
          });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setRealtimeStatus("offline");
        }
      });

    return () => {
      client.removeChannel(channel);
    };
  }, [fetchData]);

  // Update task status in real time
  const setStatus = async (id: string, newStatus: Status) => {
    // Optimistic UI update
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t)));
    notify(`Status tugas diperbarui ke "${newStatus}"`);

    const client = getBrowserClient();
    if (client) {
      try {
        await client.from("tasks").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", id);
      } catch (err) {
        console.error("Error updating task status:", err);
      }
    }
  };

  // Add a new task in real time
  const handleAddTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const tempId = `temp-${Date.now()}`;
    const newTask: Task = {
      id: tempId,
      project_id: DEFAULT_PROJECT_ID,
      title: newTaskTitle.trim(),
      description: "Tugas dibuat melalui antarmuka real-time VELX.",
      status: "To do",
      priority: newTaskPriority,
      phase: newTaskPhase,
      created_at: new Date().toISOString(),
    };

    // Optimistic UI update
    setTasks((prev) => [...prev, newTask]);
    setNewTaskTitle("");
    setModal(null);
    notify(`Tugas baru berhasil ditambahkan!`);

    const client = getBrowserClient();
    if (client) {
      try {
        const { data, error } = await client
          .from("tasks")
          .insert({
            project_id: DEFAULT_PROJECT_ID,
            title: newTask.title,
            description: newTask.description,
            status: newTask.status,
            priority: newTask.priority,
            phase: newTask.phase,
          })
          .select()
          .single();

        if (error) {
          console.error("Error saving task to Supabase:", error.message);
        } else if (data) {
          // Replace temp id with real database id
          setTasks((prev) => prev.map((t) => (t.id === tempId ? { ...t, id: String(data.id) } : t)));
        }
      } catch (err) {
        console.error("Supabase insert task error:", err);
      }
    }
  };

  // Send message in real time
  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsgId = `usr-${Date.now()}`;
    const userMessage: Message = {
      id: userMsgId,
      project_id: DEFAULT_PROJECT_ID,
      role: "user",
      content: prompt,
      time: timeStr,
    };

    // Optimistic update for user message
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    // Generate intelligent contextual response
    const priority = tasks.find((t) => t.status !== "Done" && t.priority === "High") ?? tasks.find((t) => t.status !== "Done");
    const aiText = priority
      ? `Berdasarkan konteks proyek VELX saat ini, fokus berikutnya adalah menyelesaikan "${priority.title}". Tugas ini berada di fase ${priority.phase} dengan prioritas ${priority.priority}.`
      : "Seluruh tugas yang direncanakan telah selesai! Anda dapat meninjau hasil atau membuat blueprint fase berikutnya.";

    const aiMsgId = `ai-${Date.now()}`;
    const aiMessage: Message = {
      id: aiMsgId,
      project_id: DEFAULT_PROJECT_ID,
      role: "assistant",
      content: aiText,
      time: timeStr,
    };

    setTimeout(() => {
      setMessages((prev) => [...prev, aiMessage]);
    }, 400);

    // Save both messages to Supabase PostgreSQL in real time
    const client = getBrowserClient();
    if (client) {
      try {
        await client.from("ai_messages").insert([
          { project_id: DEFAULT_PROJECT_ID, role: "user", content: prompt, time: timeStr },
          { project_id: DEFAULT_PROJECT_ID, role: "assistant", content: aiText, time: timeStr },
        ]);
      } catch (err) {
        console.error("Error sending message to Supabase:", err);
      }
    }
  };

  // Seed live database with initial project records
  const handleSeedDatabase = async () => {
    const client = getBrowserClient();
    if (!client) {
      notify("Silakan masukkan URL & Publishable Key Supabase terlebih dahulu.");
      return;
    }

    setIsSeeding(true);
    try {
      // 1. Insert Project
      await client
        .from("projects")
        .upsert({
          id: DEFAULT_PROJECT_ID,
          name: "VELX Platform",
          description: "Platform universal berbasis AI untuk merancang, mengeksekusi, dan menyelesaikan proyek secara real-time.",
          status: "active",
        });

      // 2. Insert Tasks
      const initialTasks = [
        { project_id: DEFAULT_PROJECT_ID, title: "Tentukan Cakupan Proyek VELX", description: "Konfirmasi target pengguna, hasil akhir, dan batasan rilis pertama.", status: "Done", priority: "High", phase: "Planning" },
        { project_id: DEFAULT_PROJECT_ID, title: "Desain Core Workspace Real-Time", description: "Bangun dashboard utama, kontrol tugas live, dan sinkronisasi real-time.", status: "In progress", priority: "High", phase: "Design" },
        { project_id: DEFAULT_PROJECT_ID, title: "Integrasi Supabase & Realtime Publication", description: "Siapkan tabel PostgreSQL, publication supabase_realtime, dan WebSocket channel.", status: "Review", priority: "High", phase: "Build" },
        { project_id: DEFAULT_PROJECT_ID, title: "Bangun AI Context Memory Assistant", description: "Menjawab pertanyaan berbasis konteks proyek dan memecah blocker pekerjaan.", status: "To do", priority: "High", phase: "Build" },
        { project_id: DEFAULT_PROJECT_ID, title: "Deploy ke Vercel & Publikasi Portofolio", description: "Konfigurasi environment variables, verifikasi build, dan publish ke publik.", status: "To do", priority: "Medium", phase: "Launch" },
      ];
      await client.from("tasks").insert(initialTasks);

      // 3. Insert Messages
      await client.from("ai_messages").insert([
        { project_id: DEFAULT_PROJECT_ID, role: "assistant", content: "Selamat datang di VELX Real-Time Assistant! Database ini terhubung secara live ke Supabase.", time: "10:00" },
        { project_id: DEFAULT_PROJECT_ID, role: "user", content: "Apa prioritas utama saat ini?", time: "10:01" },
        { project_id: DEFAULT_PROJECT_ID, role: "assistant", content: "Fokus utama adalah menyelesaikan integrasi Supabase Realtime agar seluruh data tersinkronisasi instan.", time: "10:01" },
      ]);

      notify("Database Supabase berhasil diisi dengan data real-time!");
      await fetchData();
      setModal(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`Gagal mengisi database: ${msg}`);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSaveCredentials = (e: FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim() || !customKey.trim()) {
      notify("Mohon lengkapi URL dan Key Supabase.");
      return;
    }
    saveSupabaseCredentials(customUrl, customKey);
    notify("Kredensial Supabase berhasil disimpan! Menghubungkan...");
    fetchData();
    setModal(null);
  };

  // Metrics calculations
  const totalTasks = tasks.length;
  const doneCount = tasks.filter((t) => t.status === "Done").length;
  const inProgressCount = tasks.filter((t) => t.status === "In progress").length;
  const progressPercent = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;
  const priorityTask = useMemo(
    () => tasks.find((t) => t.status !== "Done" && t.priority === "High") ?? tasks.find((t) => t.status !== "Done"),
    [tasks]
  );
  const statusCounts = (["To do", "In progress", "Review", "Done"] as Status[]).map((status) => [
    status,
    tasks.filter((t) => t.status === status).length,
  ] as const);

  // -------------------------------------------------------------------------------------
  // VIEW 1: TAMPILAN AWAL (LANDING PAGE DENGAN TOMBOL "MULAI")
  // -------------------------------------------------------------------------------------
  if (view === "landing") {
    return (
      <main className="landing-shell">
        <header className="landing-nav">
          <div className="logo">
            <i>✦</i> VELX
          </div>
          <div className="landing-nav-links">
            <div className={`realtime-badge ${realtimeStatus === "connected" ? "connected" : "disconnected"}`}>
              <span className={`pulse-dot ${realtimeStatus === "connected" ? "" : "warning"}`} />
              {realtimeStatus === "connected"
                ? `Realtime Live ${lastSyncTime ? `(${lastSyncTime})` : ""}`
                : "Supabase Standby"}
            </div>
            <button className="top-bar-btn" onClick={() => setModal("supabase-config")}>
              ⚙ Supabase
            </button>
            <button className="new" onClick={() => setView("workspace")}>
              Mulai ➔
            </button>
          </div>
        </header>

        <section className="landing-hero">
          <div className="hero-glow-bg" />
          <div className="hero-tag">
            <i>✦</i> UNIVERSAL AI-POWERED REAL-TIME WORKSPACE
          </div>
          <h1>
            Wujudkan Ide Menjadi Proyek Nyata dengan <span>Real-Time Database</span>
          </h1>
          <p>
            Platform kolaboratif bertenaga AI yang memandu Anda dari fase Discovery, Blueprint, Eksekusi Tugas,
            hingga Laporan Akhir. Terkoneksi langsung ke Supabase PostgreSQL tanpa data demo statis.
          </p>

          <div className="hero-btn-row">
            <button className="btn-mulai" onClick={() => setView("workspace")}>
              Mulai Sekarang <b>➔</b>
            </button>
            <button className="btn-outline-glow" onClick={() => setModal("supabase-config")}>
              ⚙ Status Database & Supabase
            </button>
          </div>

          <div className="hero-preview-wrapper">
            <div className="hero-preview-inner">
              <div className="preview-top-bar">
                <div>
                  <label className="section-label">LIVE WORKSPACE PREVIEW</label>
                  <h3 style={{ margin: "4px 0 0", color: "#f3fafd", fontSize: "18px" }}>VELX Platform Command Center</h3>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <span className="live-tag">● REAL-TIME SYNCHRONIZED</span>
                  <button className="top-bar-btn" onClick={() => setView("workspace")}>
                    Buka Workspace →
                  </button>
                </div>
              </div>

              <div className="metrics" style={{ marginTop: "10px" }}>
                <article>
                  <div className="card-top">
                    PROGRES PROYEK <i>⌁</i>
                  </div>
                  <div className="progress-info">
                    <div className="donut" style={{ "--progress": `${progressPercent * 3.6}deg` } as React.CSSProperties}>
                      <div>
                        <b>{progressPercent}%</b>
                        <small>selesai</small>
                      </div>
                    </div>
                    <div>
                      <strong>
                        {doneCount} <small>dari {totalTasks} tugas</small>
                      </strong>
                      <p>Dihitung secara live dari status tugas di database PostgreSQL.</p>
                    </div>
                  </div>
                </article>

                <article className="focus">
                  <div className="card-top">
                    FOKUS PRIORITAS <span>• LIVE</span>
                  </div>
                  <div className="focus-content">
                    <i />
                    <div>
                      <h3>{priorityTask?.title ?? "Semua tugas selesai"}</h3>
                      <p>{priorityTask?.description ?? "Siap untuk menyusun rilis baru."}</p>
                      <button className="link" onClick={() => setView("workspace")}>
                        Buka di Workspace →
                      </button>
                    </div>
                  </div>
                </article>

                <article className="week">
                  <div className="card-top">
                    STATUS KONEKSI <i>✦</i>
                  </div>
                  <strong>{totalTasks}</strong>
                  <span>tugas tercatat di sistem</span>
                  <div className="bars">
                    {[35, 60, 48, 85, 70, 95, 80].map((h, i) => (
                      <b key={i} style={{ height: `${h}%` }} />
                    ))}
                  </div>
                  <p>↗ Sinkronisasi WebSocket Aktif</p>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-cards">
          <div className="landing-card">
            <div className="landing-card-icon">⚡</div>
            <h3>Supabase Realtime Engine</h3>
            <p>
              Setiap perubahan tugas, perubahan status, dan obrolan AI dipublikasikan secara instan melalui
              Postgres Realtime Channel tanpa perlu refresh halaman.
            </p>
          </div>

          <div className="landing-card">
            <div className="landing-card-icon">🧠</div>
            <h3>AI Project Intelligence</h3>
            <p>
              Asisten AI kontekstual yang mengenali blueprint proyek Anda, memecah blocker, dan merekomendasikan
              prioritas tindakan berikutnya secara cerdas.
            </p>
          </div>

          <div className="landing-card">
            <div className="landing-card-icon">📊</div>
            <h3>Blueprint to Execution</h3>
            <p>
              Dari ide mentah, perumusan blueprint yang disetujui, hingga pembagian roadmap terstruktur yang
              menjamin akuntabilitas dan progres nyata.
            </p>
          </div>
        </section>

        {/* Modal: Supabase Configuration */}
        {modal === "supabase-config" && (
          <div className="backdrop">
            <div className="modal">
              <Button className="close" onClick={() => setModal(null)}>
                ×
              </Button>
              <i className="modal-icon">✦</i>
              <label>KONEKSI SUPABASE REALTIME</label>
              <h2>Konektivitas Database</h2>
              <p>
                Aplikasi ini membaca dan menulis data tugas secara langsung ke Supabase PostgreSQL dengan Realtime
                Websocket.
              </p>

              <div style={{ margin: "16px 0", padding: "12px", borderRadius: "8px", background: "rgba(0,0,0,0.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", color: "#8da4b7" }}>Status Saat Ini:</span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "bold",
                      color: realtimeStatus === "connected" ? "#61ebe7" : "#f0ab6c",
                    }}
                  >
                    {realtimeStatus === "connected" ? "🟢 Terhubung Realtime" : "🟠 Menunggu Koneksi"}
                  </span>
                </div>
                {lastSyncTime && (
                  <div style={{ fontSize: "10px", color: "#6e889a" }}>Sinkronisasi terakhir: {lastSyncTime}</div>
                )}
              </div>

              <form onSubmit={handleSaveCredentials}>
                <strong>URL Proyek Supabase</strong>
                <input
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://xyzcompany.supabase.co"
                  required
                />
                <strong>Publishable / Anon Key</strong>
                <input
                  type="password"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  required
                />
                <div className="modal-actions" style={{ marginTop: "16px" }}>
                  <Button
                    type="button"
                    className="secondary"
                    onClick={handleSeedDatabase}
                    disabled={isSeeding || !customUrl || !customKey}
                  >
                    {isSeeding ? "Mengisi Data..." : "Inisialisasi Tabel & Data Awal"}
                  </Button>
                  <Button className="primary" type="submit">
                    Simpan & Hubungkan ✓
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {toast && <div className="toast">✓ {toast}</div>}
      </main>
    );
  }

  // -------------------------------------------------------------------------------------
  // VIEW 2: WORKSPACE INTERAKTIF (SETELAH KLIK "MULAI")
  // -------------------------------------------------------------------------------------
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="logo" style={{ cursor: "pointer" }} onClick={() => setView("landing")}>
          <i>✦</i> VELX
        </div>

        <div className="workspace">
          <span>A</span> Advan&apos;s Workspace <b>⌄</b>
        </div>

        <nav>
          <Button className="nav selected" onClick={() => notify("Dashboard Proyek Aktif")}>
            <Icon>▦</Icon>Overview
          </Button>
          <Button className="nav" onClick={() => setModal("create")}>
            <Icon>▱</Icon>Tugas Baru
          </Button>
          <Button className="nav" onClick={() => document.getElementById("chat")?.focus()}>
            <Icon>✦</Icon>VELX AI<em>Live</em>
          </Button>
          <Button className="nav" onClick={() => setModal("blueprint")}>
            <Icon>✓</Icon>Blueprint
          </Button>
          <Button className="nav" onClick={() => setModal("report")}>
            <Icon>⌁</Icon>Laporan
          </Button>
          <Button className="nav" onClick={() => setModal("supabase-config")}>
            <Icon>⚙</Icon>Supabase Realtime
          </Button>
        </nav>

        <div className="bottom">
          <Button className="nav" onClick={() => setView("landing")}>
            <Icon>⌂</Icon>Kembali ke Beranda
          </Button>
          <div className="profile">
            <span>A</span>
            <div>
              <strong>Advan</strong>
              <small>Portofolio Project</small>
            </div>
            <b>•••</b>
          </div>
        </div>
      </aside>

      <section className="main">
        <header>
          <div className="crumb">
            <span style={{ cursor: "pointer" }} onClick={() => setView("landing")}>
              Beranda
            </span>{" "}
            / <strong>VELX Platform</strong>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div className={`realtime-badge ${realtimeStatus === "connected" ? "connected" : "disconnected"}`}>
              <span className={`pulse-dot ${realtimeStatus === "connected" ? "" : "warning"}`} />
              {realtimeStatus === "connected" ? "Realtime Live" : "Supabase Standby"}
            </div>
            <Button className="top-bar-btn" onClick={() => setView("landing")}>
              ⌂ Beranda
            </Button>
            <Button className="new" onClick={() => setModal("create")}>
              ＋ Tambah Tugas
            </Button>
          </div>
        </header>

        <div className="content">
          <section className="hero">
            <div>
              <label>COMMAND CENTER PROYEK REAL-TIME</label>
              <h1>Wujudkan karya terbaik Anda.</h1>
              <p>
                VELX mengubah ide menjadi rancangan terstruktur dan menghubungkan setiap tugas secara live ke
                database Supabase Anda.
              </p>
              <div className="actions">
                <Button className="primary" onClick={() => setModal("create")}>
                  Tambah tugas baru <b>→</b>
                </Button>
                <Button className="link" onClick={() => setModal("blueprint")}>
                  Lihat blueprint proyek
                </Button>
              </div>
            </div>
            <div className="orb">
              <span>✦</span>
            </div>
          </section>

          <section className="project-title">
            <div>
              <label>
                <i>✦</i> PROYEK AKTIF
              </label>
              <h2>VELX Platform</h2>
              <p>Membangun workspace bertenaga AI yang mentransformasi ide menjadi proyek terwujud.</p>
            </div>
            <Button className="more" onClick={() => setModal("supabase-config")}>
              ⚙ Supabase
            </Button>
          </section>

          <div className="tabs">
            <Button className="active">Overview</Button>
            <Button onClick={() => notify(`Total ${tasks.length} tugas tersinkronisasi`)}>
              Tugas <b>{tasks.length}</b>
            </Button>
            <Button onClick={() => setModal("blueprint")}>Blueprint</Button>
            <Button onClick={() => setModal("report")}>Laporan</Button>
          </div>

          {/* Metrics Section */}
          <section className="metrics">
            <article>
              <div className="card-top">
                PROGRES PROYEK <i>⌁</i>
              </div>
              <div className="progress-info">
                <div className="donut" style={{ "--progress": `${progressPercent * 3.6}deg` } as React.CSSProperties}>
                  <div>
                    <b>{progressPercent}%</b>
                    <small>selesai</small>
                  </div>
                </div>
                <div>
                  <strong>
                    {doneCount} <small>dari {totalTasks} tugas</small>
                  </strong>
                  <p>Setiap tugas yang diselesaikan mempercepat penyelesaian proyek.</p>
                </div>
              </div>
            </article>

            <article className="focus">
              <div className="card-top">
                FOKUS UTAMA <span>• LIVE</span>
              </div>
              <div className="focus-content">
                <i />
                <div>
                  <h3>{priorityTask?.title ?? "Semua tugas selesai"}</h3>
                  <p>{priorityTask?.description ?? "Laporan proyek siap dibuat."}</p>
                  <Button className="link" onClick={() => notify("Detail tugas ada di daftar bawah")}>
                    Buka tugas →
                  </Button>
                </div>
              </div>
            </article>

            <article className="week">
              <div className="card-top">
                AKTIVITAS REAL-TIME <i>✦</i>
              </div>
              <strong>{inProgressCount + doneCount}</strong>
              <span>tugas dalam progres & selesai</span>
              <div className="bars">
                {[28, 45, 36, 70, 58, 92, 68].map((h, i) => (
                  <b key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
              <p>↗ Sinkronisasi real-time dua arah</p>
            </article>
          </section>

          {/* Two columns: Tasks and AI Intelligence */}
          <section className="two-columns">
            <article className="panel">
              <div className="panel-head">
                <div>
                  <label>DAFTAR TUGAS REAL-TIME</label>
                  <h2>Tugas Proyek</h2>
                </div>
                <Button className="link" onClick={() => setModal("create")}>
                  + Baru →
                </Button>
              </div>

              <div className="tasks">
                {isLoading ? (
                  <div style={{ padding: "24px 0", textAlign: "center", color: "#8da4b7", fontSize: "12px" }}>
                    Memuat data tugas dari Supabase...
                  </div>
                ) : tasks.length === 0 ? (
                  <div style={{ padding: "24px 0", textAlign: "center", color: "#8da4b7", fontSize: "12px" }}>
                    Belum ada tugas di database. Klik tombol di bawah untuk menambah tugas baru!
                  </div>
                ) : (
                  tasks.slice(0, 6).map((task) => (
                    <div className="task" key={task.id}>
                      <Button
                        className={`check ${task.status === "Done" ? "checked" : ""}`}
                        onClick={() => setStatus(task.id, task.status === "Done" ? "To do" : "Done")}
                        title="Tandai selesai"
                      >
                        {task.status === "Done" ? "✓" : ""}
                      </Button>
                      <div>
                        <strong>{task.title}</strong>
                        <small>
                          {task.phase} · <b className={task.priority.toLowerCase()}>{task.priority}</b>
                        </small>
                      </div>
                      <select
                        value={task.status}
                        onChange={(e) => setStatus(task.id, e.target.value as Status)}
                      >
                        <option value="To do">To do</option>
                        <option value="In progress">In progress</option>
                        <option value="Review">Review</option>
                        <option value="Done">Done</option>
                      </select>
                    </div>
                  ))
                )}
              </div>

              <Button className="add" onClick={() => setModal("create")}>
                ＋ Tambah sebuah tugas
              </Button>
            </article>

            <article className="panel intelligence">
              <div className="ai-ball">✦</div>
              <label>INTELIJEN VELX AI</label>
              <h2>Langkah prioritas berikutnya telah siap.</h2>
              <p>
                {priorityTask
                  ? `Selesaikan "${priorityTask.title}" (${priorityTask.phase}). Ini memberikan fondasi kokoh untuk fitur berikutnya.`
                  : "Semua tugas telah diselesaikan. Evaluasi hasil dan terbitkan laporan akhir proyek."}
              </p>
              <div className="context">
                ✦ <span>Berdasarkan konteks live dari Supabase</span>
              </div>
              <Button className="link" onClick={() => document.getElementById("chat")?.focus()}>
                Tanya VELX AI →
              </Button>
            </article>
          </section>

          {/* Lower Two columns: Chat & Roadmap */}
          <section className="two-columns lower">
            <article className="panel chat">
              <div className="panel-head">
                <div>
                  <label>MEMORI PROYEK REAL-TIME</label>
                  <h2>Diskusi dengan VELX AI</h2>
                </div>
                <span className="context-pill">● Konteks Aktif</span>
              </div>

              <div className="messages">
                {messages.slice(-6).map((message) => (
                  <div className={`message ${message.role}`} key={message.id}>
                    <span>{message.role === "assistant" ? "✦" : "A"}</span>
                    <div>
                      <p>{message.content}</p>
                      <small>
                        {message.role === "assistant" ? "VELX AI" : "Anda"} · {message.time}
                      </small>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={sendMessage}>
                <input
                  id="chat"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Tanyakan langkah kerja, prioritas tugas, atau blocker proyek..."
                />
                <Button type="submit">➤</Button>
              </form>
            </article>

            <article className="panel roadmap">
              <div className="panel-head">
                <div>
                  <label>ROADMAP</label>
                  <h2>Dari Ide Menjadi Dampak</h2>
                </div>
                <Button className="link" onClick={() => setModal("blueprint")}>
                  Blueprint →
                </Button>
              </div>

              <ol>
                {[
                  ["Discovery", "Terkonfirmasi", "complete"],
                  ["Blueprint", approved ? "Disetujui" : "Siap Ditinjau", "current"],
                  ["Eksekusi", inProgressCount > 0 ? "Berjalan" : "Terencana", inProgressCount > 0 ? "current" : ""],
                  ["Peluncuran", doneCount === totalTasks && totalTasks > 0 ? "Selesai" : "Belum Dimulai", ""],
                ].map(([title, state, kind], i) => (
                  <li className={kind} key={title}>
                    <span>{kind === "complete" ? "✓" : i + 1}</span>
                    <div>
                      <strong>{title}</strong>
                      <small>{state}</small>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="review">
                <p>
                  ✦{" "}
                  {approved
                    ? "Blueprint proyek telah disetujui dan dieksekusi secara live."
                    : "Blueprint versi pertama siap untuk ditinjau dan disetujui."}
                </p>
                <Button className="link" onClick={() => setModal("blueprint")}>
                  {approved ? "Lihat Blueprint" : "Tinjau Sekarang"} →
                </Button>
              </div>
            </article>
          </section>

          {/* Pulse summary */}
          <section className="pulse">
            <div>
              <label>DETAK PROYEK REAL-TIME</label>
              <h2>Progres Aktual Berbasis Data Riil.</h2>
              <p>VELX mengalkulasi metrik secara live dari database—bukan perkiraan statis.</p>
            </div>
            <div className="breakdown">
              {statusCounts.map(([status, count]) => (
                <div key={status}>
                  <b>{count}</b>
                  <span>{status}</span>
                </div>
              ))}
            </div>
            <Button className="outline" onClick={() => setModal("report")}>
              Buat Laporan →
            </Button>
          </section>
        </div>
      </section>

      {/* Modal: Tambah Tugas Baru */}
      {modal === "create" && (
        <div className="backdrop">
          <form className="modal" onSubmit={handleAddTask}>
            <Button className="close" onClick={() => setModal(null)} type="button">
              ×
            </Button>
            <i className="modal-icon">✦</i>
            <label>TAMBAH TUGAS REAL-TIME</label>
            <h2>Buat Tugas Baru</h2>
            <p>Tugas akan langsung disimpan ke database Supabase dan disinkronkan secara live.</p>

            <strong>Judul Tugas</strong>
            <input
              required
              autoFocus
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Contoh: Implementasi autentikasi atau sinkronisasi WebSocket"
            />

            <strong>Fase Kerja</strong>
            <select
              value={newTaskPhase}
              onChange={(e) => setNewTaskPhase(e.target.value)}
              style={{
                width: "100%",
                marginTop: "7px",
                padding: "10px",
                borderRadius: "7px",
                background: "#0a192b",
                border: "1px solid #36546c",
                color: "#e6f5fd",
              }}
            >
              <option value="Planning">Planning</option>
              <option value="Design">Design</option>
              <option value="Build">Build</option>
              <option value="Launch">Launch</option>
            </select>

            <strong>Prioritas</strong>
            <select
              value={newTaskPriority}
              onChange={(e) => setNewTaskPriority(e.target.value as Priority)}
              style={{
                width: "100%",
                marginTop: "7px",
                padding: "10px",
                borderRadius: "7px",
                background: "#0a192b",
                border: "1px solid #36546c",
                color: "#e6f5fd",
              }}
            >
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>

            <Button className="primary" type="submit" style={{ marginTop: "20px" }}>
              Simpan Tugas ke Database ➔
            </Button>
          </form>
        </div>
      )}

      {/* Modal: Blueprint */}
      {modal === "blueprint" && (
        <div className="backdrop">
          <section className="modal blueprint">
            <Button className="close" onClick={() => setModal(null)}>
              ×
            </Button>
            <i className="modal-icon purple">✦</i>
            <label>BLUEPRINT · VERSI 1</label>
            <h2>VELX Platform Architecture</h2>
            <p>
              Platform AI universal untuk merancang, memantau, dan menyelesaikan proyek nyata dengan integrasi
              PostgreSQL dan WebSocket Realtime.
            </p>
            <div className="blueprint-grid">
              {[
                ["Tujuan Utama", "Mengubah gagasan awal menjadi rencana kerja terstruktur dan terukur."],
                ["Cakupan Inti", "Discovery, Blueprint terverifikasi, Real-time Task execution, AI Context memory."],
                ["Hasil Pertama", "Command Center real-time yang memperjelas tindakan prioritas berikutnya."],
                ["Kriteria Sukses", "Pembaruan status tugas dan percakapan tersinkronisasi instan antar klien."],
              ].map(([title, text]) => (
                <div key={title}>
                  <b>{title}</b>
                  <p>{text}</p>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <Button
                className="secondary"
                onClick={() => {
                  setModal(null);
                  notify("Permintaan revisi blueprint dicatat");
                }}
              >
                Minta Revisi
              </Button>
              <Button
                className="primary"
                onClick={() => {
                  setApproved(true);
                  setModal(null);
                  notify("Blueprint berhasil disetujui!");
                }}
              >
                {approved ? "Disetujui ✓" : "Setujui Blueprint ✓"}
              </Button>
            </div>
          </section>
        </div>
      )}

      {/* Modal: Laporan Proyek */}
      {modal === "report" && (
        <div className="backdrop">
          <section className="modal report">
            <Button className="close" onClick={() => setModal(null)}>
              ×
            </Button>
            <i className="modal-icon orange">⌁</i>
            <label>LAPORAN PROYEK REAL-TIME</label>
            <h2>VELX Platform — Snapshot Progres</h2>
            <div className="report-stat">
              <b>{progressPercent}%</b> tugas telah diselesaikan
            </div>
            <p>
              <strong>Selesai:</strong> {doneCount} tugas berstatus Done.{" "}
              <strong>Dalam Pengerjaan:</strong> {inProgressCount} tugas sedang aktif dikerjakan. Laporan ini dihitung
              secara langsung dari data rekaman Supabase.
            </p>
            <p>
              <strong>Rekomendasi AI:</strong>{" "}
              {priorityTask
                ? `Fokus menyelesaikan "${priorityTask.title}" untuk mempertahankan momentum kerja.`
                : "Semua tugas selesai, siap untuk publikasi hasil akhir."}
            </p>
            <Button
              className="primary"
              onClick={() => {
                setModal(null);
                notify("Laporan progres berhasil disimpan!");
              }}
            >
              Simpan Laporan ✓
            </Button>
          </section>
        </div>
      )}

      {/* Modal: Supabase Configuration */}
      {modal === "supabase-config" && (
        <div className="backdrop">
          <div className="modal">
            <Button className="close" onClick={() => setModal(null)}>
              ×
            </Button>
            <i className="modal-icon">✦</i>
            <label>KONEKSI SUPABASE REALTIME</label>
            <h2>Konfigurasi Database Live</h2>
            <p>
              Kelola koneksi Supabase Anda. Anda dapat memasukkan kredensial proyek di sini atau menyimpannya di file{" "}
              <code>.env.local</code>.
            </p>

            <div style={{ margin: "16px 0", padding: "12px", borderRadius: "8px", background: "rgba(0,0,0,0.3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", color: "#8da4b7" }}>Status Saat Ini:</span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: "bold",
                    color: realtimeStatus === "connected" ? "#61ebe7" : "#f0ab6c",
                  }}
                >
                  {realtimeStatus === "connected" ? "🟢 Terhubung Realtime" : "🟠 Menunggu Koneksi"}
                </span>
              </div>
              {lastSyncTime && (
                <div style={{ fontSize: "10px", color: "#6e889a" }}>Sinkronisasi terakhir: {lastSyncTime}</div>
              )}
            </div>

            <form onSubmit={handleSaveCredentials}>
              <strong>URL Proyek Supabase</strong>
              <input
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://xyzcompany.supabase.co"
                required
              />
              <strong>Publishable / Anon Key</strong>
              <input
                type="password"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                required
              />
              <div className="modal-actions" style={{ marginTop: "16px" }}>
                <Button
                  type="button"
                  className="secondary"
                  onClick={handleSeedDatabase}
                  disabled={isSeeding || !customUrl || !customKey}
                >
                  {isSeeding ? "Mengisi Data..." : "Inisialisasi Tabel & Data Awal"}
                </Button>
                <Button className="primary" type="submit">
                  Simpan & Hubungkan ✓
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}
