// ════════════════════════════════════════════════════════════════
//  📁 FILE PATH : smartfactory/shared/downtimeReasons.ts
//  ⚙️  ACTION    : NEW FILE — create at this exact path
// ════════════════════════════════════════════════════════════════

// ============================================================
//  DOWNTIME REASONS  —  the checkbox list an operator picks from
//  when a machine stops/idles. Shared by client (render the
//  checkboxes) and server (validate the submission).
//  Add/remove reasons HERE only — both sides update together.
// ============================================================

export const DOWNTIME_REASONS = [
  'Material shortage',
  'Mechanical fault',
  'Electrical fault',
  'Power failure',
  'Quality issue / rework',
  'Changeover / setup',
  'Cleaning / maintenance',
  'Waiting for instructions',
  'Waiting for job / program',
  'Utility issue (steam / water / air)',
  'Shift break / manpower',
] as const;

export type DowntimeReason = (typeof DOWNTIME_REASONS)[number];

// The free-text escape hatch. Selecting it requires `otherText`.
export const OTHER_REASON = 'Other';

/** True when the submitted reasons are valid: every entry is a known
 *  reason (or OTHER_REASON), and at least one reason is present. */
export function validReasons(reasons: unknown): reasons is string[] {
  if (!Array.isArray(reasons) || reasons.length === 0) return false;
  const known = new Set<string>([...DOWNTIME_REASONS, OTHER_REASON]);
  return reasons.every((r) => typeof r === 'string' && known.has(r));
}

/** Human display string: "Mechanical fault, Power failure, Other: belt supplier delay" */
export function reasonsToText(reasons: string[], otherText?: string): string {
  return reasons
    .map((r) => (r === OTHER_REASON && otherText?.trim() ? `Other: ${otherText.trim()}` : r))
    .join(', ');
}