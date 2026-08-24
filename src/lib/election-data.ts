import { db } from "@/db";
import {
  candidates,
  elections,
  electionPositions,
  electionVoters,
  profiles,
} from "@/db/schema";
import { IDS } from "@/lib/election-ids";
import { hashPassword } from "@/lib/password";

export { IDS };

let seeded = false;

export async function ensureDemoElection() {
  if (seeded) return;
  seeded = true;

  const studentHash = await hashPassword("student123");
  const adminHash = await hashPassword("admin123");

  await db
    .insert(profiles)
    .values([
      {
        id: IDS.student,
        schoolId: "STU-2026-1842",
        email: "alex.morgan@northfield.edu",
        firstName: "Alex",
        lastName: "Morgan",
        fullName: "Alex Morgan",
        passwordHash: studentHash,
        grade: "Grade 11",
        role: "student",
      },
      {
        id: IDS.admin,
        schoolId: "ADM-001",
        email: "elections@northfield.edu",
        firstName: "Evelyn",
        lastName: "Reed",
        fullName: "Dr. Evelyn Reed",
        passwordHash: adminHash,
        role: "admin",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(elections)
    .values({
      id: IDS.election,
      title: "Student Council General Election",
      schoolYear: "2025-2026",
      description:
        "Choose the student leaders who will represent Northfield Academy.",
      state: "open",
      showLiveResults: false,
      startsAt: new Date("2025-01-01T08:00:00Z"),
      endsAt: new Date("2030-12-31T16:00:00Z"),
      createdBy: IDS.admin,
    })
    .onConflictDoNothing();

  await db
    .insert(electionPositions)
    .values([
      {
        id: IDS.president,
        electionId: IDS.election,
        name: "President",
        description:
          "Leads the student council and represents the student body.",
        displayOrder: 1,
      },
      {
        id: IDS.vicePresident,
        electionId: IDS.election,
        name: "Vice President",
        description: "Supports council leadership and student initiatives.",
        displayOrder: 2,
      },
      {
        id: IDS.secretary,
        electionId: IDS.election,
        name: "Secretary",
        description:
          "Coordinates council records and communication.",
        displayOrder: 3,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(candidates)
    .values([
      {
        id: IDS.candidateMaya,
        positionId: IDS.president,
        name: "Maya Chen",
        grade: "Grade 11",
        introduction: "Student organizer and peer mentor",
        platform:
          "A more connected campus, stronger student voice, and practical wellbeing programs.",
        imageUrl: "/candidates/maya.svg",
        approved: true,
        displayOrder: 1,
      },
      {
        id: IDS.candidateLiam,
        positionId: IDS.president,
        name: "Liam Okafor",
        grade: "Grade 12",
        introduction: "Debate captain and student ambassador",
        platform:
          "Transparent council decisions, inclusive events, and better study spaces for everyone.",
        imageUrl: "/candidates/liam.svg",
        approved: true,
        displayOrder: 2,
      },
      {
        id: IDS.candidateSofia,
        positionId: IDS.vicePresident,
        name: "Sofia Reyes",
        grade: "Grade 11",
        introduction: "Community volunteer and arts advocate",
        platform:
          "Belonging through arts, service, and student-led clubs with fair access to funding.",
        imageUrl: "/candidates/sofia.svg",
        approved: true,
        displayOrder: 1,
      },
      {
        id: IDS.candidateEthan,
        positionId: IDS.secretary,
        name: "Ethan Nguyen",
        grade: "Grade 10",
        introduction: "School paper editor and class officer",
        platform:
          "Clear council updates, open meeting notes, and simpler ways to share student ideas.",
        imageUrl: "/candidates/ethan.svg",
        approved: true,
        displayOrder: 1,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(electionVoters)
    .values({ electionId: IDS.election, voterId: IDS.student, eligible: true })
    .onConflictDoNothing();
}
