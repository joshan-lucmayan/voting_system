/** Validate email format. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Validate school ID format — alphanumeric with hyphens, 4-40 chars. */
export function isValidSchoolId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9\-]{2,38}[A-Za-z0-9]$/.test(id);
}

/** Check if email belongs to a school domain (basic check). */
export function isSchoolEmail(email: string): boolean {
  // Accept any email for now — schools use various domains
  // In production, restrict to known school domains
  return isValidEmail(email);
}

/** Validate password strength. */
export function isValidPassword(password: string): boolean {
  return password.length >= 6 && password.length <= 128;
}

/** Sanitize a string input — trim and limit length. */
export function sanitize(input: string, maxLength: number): string {
  return input.trim().slice(0, maxLength);
}

/** Validate a name (letters, spaces, hyphens, apostrophes). */
export function isValidName(name: string): boolean {
  return /^[A-Za-z\s\-']+$/.test(name) && name.length >= 1 && name.length <= 80;
}

/** Validate a grade string. */
export function isValidGrade(grade: string): boolean {
  return grade.length <= 30;
}
