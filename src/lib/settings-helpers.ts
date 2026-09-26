import "server-only";
import { getSettings } from "@/lib/settings";
import { registrationsRemaining } from "@/lib/registration";

export { getSettings };

/** Team slots left against the configured cap. 0 when the cap is reached. */
export async function registrationsRemainingSafe(maxTeams?: number): Promise<number> {
  const cap = maxTeams ?? (await getSettings()).maxTeams;
  return registrationsRemaining(cap);
}
