import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ user: null });
    }
    return Response.json({ user });
  } catch {
    return Response.json({ user: null });
  }
}
