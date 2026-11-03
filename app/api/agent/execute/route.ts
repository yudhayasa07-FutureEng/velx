import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const priorities: Record<string, string> = { Tinggi: "High", Sedang: "Medium", Rendah: "Low" };

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk kembali." }, { status: 401 });

    const body = await request.json();
    const action = body?.action;
    if (!action || action.type !== "create_task") {
      return NextResponse.json({ error: "Jenis tindakan tidak diizinkan." }, { status: 400 });
    }

    const title = typeof action.title === "string" ? action.title.trim() : "";
    if (!title || title.length > 240) return NextResponse.json({ error: "Judul tugas tidak valid." }, { status: 400 });

    const priority = priorities[String(action.priority)] || "Medium";
    const description = typeof action.description === "string" ? action.description.slice(0, 1000) : "";
    const phase = typeof action.phase === "string" ? action.phase.slice(0, 80) : "General";

    const { data, error } = await supabase.from("tasks").insert({
      user_id: user.id, title, description, priority, phase, status: "To do",
    }).select("id, title, status, priority, phase, created_at").single();

    if (error) {
      console.error("VELX action execution failed:", error);
      return NextResponse.json({ error: "Database gagal menyimpan tugas. Tidak ada tindakan yang dianggap berhasil." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, task: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("VELX agent execution error:", error);
    return NextResponse.json({ error: "Terjadi gangguan saat menjalankan tindakan." }, { status: 500 });
  }
}
