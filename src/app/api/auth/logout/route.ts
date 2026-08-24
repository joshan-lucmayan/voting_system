import { destroySession } from "@/lib/auth";

export async function POST() {
  try {
    await destroySession();
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Failed to logout." },
      { status: 500 },
    );
  }
}
