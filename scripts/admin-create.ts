/**
 * Trusted administrator provisioning CLI.
 *
 * Usage:
 *   npm run admin:create -- --school-id ADM-002 --email admin@school.edu \
 *     --password '...' --first-name Jane --last-name Doe
 *
 * - Creates an admin profile directly in the database.
 * - Never prints or logs the password.
 * - Public signup can never create admins; this script is the only
 *   provisioning path in v1.
 */
import { pathToFileURL } from "node:url";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { loadEnvFile, requireDatabaseUrl } from "@/db/env";
import { profiles } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import {
  isValidEmail,
  isValidName,
  isValidPassword,
  isValidSchoolId,
} from "@/lib/validators";

interface AdminArgs {
  schoolId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

function parseArgs(argv: string[]): AdminArgs | null {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "";
    if (!value) {
      console.error(`ERROR: --${key} requires a value.`);
      return null;
    }
    map.set(key, value);
    i++;
  }

  const required: Array<[string, string]> = [
    ["school-id", "--school-id is required."],
    ["email", "--email is required."],
    ["password", "--password is required (it will not be stored in shell history by this script)."],
    ["first-name", "--first-name is required."],
    ["last-name", "--last-name is required."],
  ];
  for (const [key, message] of required) {
    if (!map.has(key)) {
      console.error(`ERROR: ${message}`);
      return null;
    }
  }

  return {
    schoolId: (map.get("school-id") ?? "").trim(),
    email: (map.get("email") ?? "").trim().toLowerCase(),
    password: map.get("password") ?? "",
    firstName: (map.get("first-name") ?? "").trim(),
    lastName: (map.get("last-name") ?? "").trim(),
  };
}

async function main() {
  loadEnvFile();
  requireDatabaseUrl();

  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error("\nUsage:");
    console.error(
      "  npm run admin:create -- --school-id ADM-002 --email admin@school.edu \\\n" +
        "    --password '...' --first-name Jane --last-name Doe",
    );
    process.exit(1);
  }

  const errors: string[] = [];
  if (!isValidSchoolId(args.schoolId))
    errors.push("School ID must be 4-40 characters (letters, numbers, hyphens).");
  if (!isValidEmail(args.email)) errors.push("Invalid email address.");
  if (!isValidPassword(args.password))
    errors.push("Password must be between 6 and 128 characters.");
  if (!isValidName(args.firstName)) errors.push("Invalid first name.");
  if (!isValidName(args.lastName)) errors.push("Invalid last name.");
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exit(1);
  }

  const existing = await db
    .select({ id: profiles.id, schoolId: profiles.schoolId, email: profiles.email })
    .from(profiles)
    .where(
      or(eq(profiles.schoolId, args.schoolId), eq(profiles.email, args.email)),
    )
    .limit(2);

  if (existing.some((p) => p.schoolId === args.schoolId)) {
    console.error(`ERROR: An account with School ID "${args.schoolId}" already exists.`);
    process.exit(1);
  }
  if (existing.some((p) => p.email === args.email)) {
    console.error(`ERROR: An account with email "${args.email}" already exists.`);
    process.exit(1);
  }

  try {
    const passwordHash = await hashPassword(args.password);
    const [admin] = await db
      .insert(profiles)
      .values({
        schoolId: args.schoolId,
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        fullName: `${args.firstName} ${args.lastName}`,
        passwordHash,
        role: "admin",
      })
      .returning({ id: profiles.id, schoolId: profiles.schoolId });

    console.log("Administrator created successfully.");
    console.log(`  ID:        ${admin.id}`);
    console.log(`  School ID: ${admin.schoolId}`);
    console.log("The password was hashed (bcrypt, 12 rounds) and is not displayed.");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      console.error("ERROR: A profile with this School ID or email already exists.");
      process.exit(1);
    }
    throw error;
  }

  process.exit(0);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(
      "Admin creation failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}
