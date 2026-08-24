import { db } from "@/db";
import { elections } from "@/db/schema";
import { eq, or, and, gte, lte } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();
    const all = await db
      .select({
        id: elections.id,
        title: elections.title,
        schoolYear: elections.schoolYear,
        description: elections.description,
        state: elections.state,
        showLiveResults: elections.showLiveResults,
        startsAt: elections.startsAt,
        endsAt: elections.endsAt,
      })
      .from(elections)
      .where(
        or(
          eq(elections.state, "open"),
          eq(elections.state, "scheduled"),
          eq(elections.state, "closed"),
          eq(elections.state, "published"),
        ),
      );

    return Response.json({ elections: all });
  } catch (error) {
    console.error("Error fetching elections:", error);
    return Response.json(
      { error: "Failed to fetch elections." },
      { status: 500 },
    );
  }
}
