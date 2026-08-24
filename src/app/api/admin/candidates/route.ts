import { NextRequest } from "next/server";
import { eq, sql, and } from "drizzle-orm";
import { db } from "@/db";
import { candidates, electionPositions, elections } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET: List all candidates (optionally for a specific election) */
export async function GET(request: NextRequest) {
  try {
    await requireAuth("admin");
    const { searchParams } = new URL(request.url);
    const electionId = searchParams.get("electionId");

    let candidateList;

    if (electionId) {
      candidateList = await db
        .select({
          id: candidates.id,
          name: candidates.name,
          grade: candidates.grade,
          introduction: candidates.introduction,
          platform: candidates.platform,
          imageUrl: candidates.imageUrl,
          approved: candidates.approved,
          displayOrder: candidates.displayOrder,
          positionId: candidates.positionId,
          positionName: electionPositions.name,
          electionId: electionPositions.electionId,
        })
        .from(candidates)
        .innerJoin(
          electionPositions,
          eq(candidates.positionId, electionPositions.id),
        )
        .where(eq(electionPositions.electionId, electionId));
    } else {
      candidateList = await db
        .select({
          id: candidates.id,
          name: candidates.name,
          grade: candidates.grade,
          introduction: candidates.introduction,
          platform: candidates.platform,
          imageUrl: candidates.imageUrl,
          approved: candidates.approved,
          displayOrder: candidates.displayOrder,
          positionId: candidates.positionId,
          positionName: electionPositions.name,
          electionId: electionPositions.electionId,
        })
        .from(candidates)
        .innerJoin(
          electionPositions,
          eq(candidates.positionId, electionPositions.id),
        );
    }

    return Response.json({ candidates: candidateList });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin candidates error:", error);
    return Response.json(
      { error: "Failed to fetch candidates." },
      { status: 500 },
    );
  }
}

/** POST: Add a new candidate */
export async function POST(request: NextRequest) {
  try {
    await requireAuth("admin");
    const body = (await request.json()) as {
      positionId?: string;
      name?: string;
      grade?: string;
      introduction?: string;
      platform?: string;
      imageUrl?: string;
    };

    if (
      !body.positionId ||
      !body.name ||
      !body.introduction ||
      !body.platform
    ) {
      return Response.json(
        {
          error:
            "Position, name, introduction, and platform are required.",
        },
        { status: 400 },
      );
    }

    const [candidate] = await db
      .insert(candidates)
      .values({
        positionId: body.positionId,
        name: body.name,
        grade: body.grade ?? "",
        introduction: body.introduction,
        platform: body.platform,
        imageUrl: body.imageUrl ?? "/candidates/placeholder.svg",
        approved: true,
      })
      .returning();

    return Response.json({ candidate });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Add candidate error:", error);
    return Response.json(
      { error: "Failed to add candidate." },
      { status: 500 },
    );
  }
}
