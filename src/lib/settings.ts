import "server-only";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SETTINGS, SETTING_KEYS } from "@/lib/constants";

export type AppSettings = {
  eventName: string;
  submissionDeadline: string;
  registrationOpen: boolean;
  maxTeams: number;
};

const cache: { value: AppSettings | null; at: number } = { value: null, at: 0 };
const TTL = 5_000;

export async function getSettings(): Promise<AppSettings> {
  if (cache.value && Date.now() - cache.at < TTL) return cache.value;

  const rows = await prisma.setting.findMany();
  const map: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) map[row.key] = row.value;

  const value: AppSettings = {
    eventName: map[SETTING_KEYS.eventName] ?? DEFAULT_SETTINGS[SETTING_KEYS.eventName]!,
    submissionDeadline: map[SETTING_KEYS.submissionDeadline]!,
    registrationOpen: map[SETTING_KEYS.registrationOpen] === "true",
    maxTeams: Number(map[SETTING_KEYS.maxTeams] ?? 60),
  };

  cache.value = value;
  cache.at = Date.now();
  return value;
}

export async function setSetting(key: string, value: string, updatedBy?: string) {
  await prisma.setting.upsert({
    where: { key },
    update: { value, updatedBy },
    create: { key, value, updatedBy },
  });
  cache.value = null;
}

/** Submissions lock themselves once the deadline passes. */
export async function isSubmissionLocked(): Promise<boolean> {
  const { submissionDeadline } = await getSettings();
  return new Date(submissionDeadline).getTime() <= Date.now();
}
