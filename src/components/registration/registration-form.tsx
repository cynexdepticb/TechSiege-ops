"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  Loader2,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";

import { Field } from "@/components/ui/fields";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/registration/progress";
import { cn, slugify } from "@/lib/utils";
import { clearStarted, hasStarted, markStarted, track } from "@/lib/funnel";
import { toast } from "sonner";

type Track = { id: string; name: string; description: string; capacity: number | null; taken: number };

type Member = {
  name: string;
  email: string;
  phone: string;
  college: string;
  year: string;
  isLeader: boolean;
};

type Team = {
  name: string;
  college: string;
  city: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  projectIdea: string;
  trackId: string;
};

const STEPS = ["Team", "Track", "Members", "Verify", "Review"] as const;

const emptyTeam = (college = ""): Team => ({
  name: "",
  college,
  city: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  projectIdea: "",
  trackId: "",
});

const emptyMember = (college = ""): Member => ({
  name: "",
  email: "",
  phone: "",
  college,
  year: "",
  isLeader: false,
});

export function RegistrationForm({
  tracks,
  registrationOpen,
  minMembers,
  maxMembers,
}: {
  tracks: Track[];
  registrationOpen: boolean;
  minMembers: number;
  maxMembers: number;
}) {
  const [step, setStep] = useState(0);
  const [team, setTeam] = useState<Team>(emptyTeam());
  const [members, setMembers] = useState<Member[]>([emptyMember(), emptyMember()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{
    code: string;
    name: string;
    track: string;
    emailed: number;
    recipients: number;
    undelivered: string[];
  } | null>(null);
  const [availability, setAvailability] = useState<{ name?: string; email?: string; track?: string }>({});
  const [draftToken, setDraftToken] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const initialised = useRef(false);
  const stepRef = useRef(0);
  const doneRef = useRef(false);
  stepRef.current = step;

  /** First real input counts as starting the form. */
  const markIntent = useCallback(() => {
    if (hasStarted()) return;
    markStarted();
    track("FORM_START");
  }, []);

  const setField = <K extends keyof Team>(key: K, value: Team[K]) => {
    if (value) markIntent();
    setTeam((t) => ({ ...t, [key]: value }));
  };

  const setMember = (i: number, patch: Partial<Member>) => {
    if (Object.values(patch).some((v) => v !== "" && v !== false)) markIntent();
    setMembers((list) => list.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  };

  const makeLeader = (i: number) =>
    setMembers((list) => list.map((m, idx) => ({ ...m, isLeader: idx === i })));

  /* ── availability checks, debounced ── */
  const check = useCallback(async (action: "check-name" | "check-email" | "check-track", value: string) => {
    if (!value.trim()) return true;
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(action === "check-email" ? { email: value } : action === "check-name" ? { name: value } : { trackId: value }) }),
      });
      const data = await res.json();
      if (action === "check-name") setAvailability((a) => ({ ...a, name: data.available ? undefined : "A team with this name already exists." }));
      if (action === "check-email") setAvailability((a) => ({ ...a, email: data.available ? undefined : "This email is already on a team." }));
      if (action === "check-track") setAvailability((a) => ({ ...a, track: data.available ? undefined : (data.reason ?? "This track is full.") }));
      return Boolean(data.available);
    } catch {
      return true; // never block on a network hiccup
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void check("check-name", team.name), 500);
    return () => clearTimeout(t);
  }, [team.name, check]);

  useEffect(() => {
    const lead = members.find((m) => m.isLeader) ?? members[0];
    const email = lead?.email ?? "";
    const t = setTimeout(() => void check("check-email", email), 500);
    return () => clearTimeout(t);
  }, [members, check]);

  useEffect(() => {
    if (!team.trackId) return;
    const t = setTimeout(() => void check("check-track", team.trackId), 300);
    return () => clearTimeout(t);
  }, [team.trackId, check]);

  /* ── draft autosave, once the lead's email is known ── */
  useEffect(() => {
    if (initialised.current) return;
    const lead = members.find((m) => m.isLeader) ?? members[0];
    if (!lead?.email || !lead.email.includes("@")) return;
    initialised.current = true;
    void saveDraft(lead.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  /* ── funnel telemetry ── */
  useEffect(() => {
    track("PAGE_VIEW");
  }, []);

  useEffect(() => {
    // Report an abandonment if they leave mid-form. `done` flips to non-null on
    // a successful submit and clearStarted() drops the flag, so a completed
    // registration never double-counts as abandoned. Refs keep the listener
    // registered once instead of on every keystroke.
    const onHide = () => {
      if (!hasStarted() || doneRef.current) return;
      track("FORM_ABANDON", { step: stepRef.current + 1 });
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  async function saveDraft(email?: string) {
    const target = email ?? (members.find((m) => m.isLeader) ?? members[0])?.email;
    if (!target?.includes("@")) return;
    setSavingDraft(true);
    try {
      const res = await fetch("/api/register/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target, step, payload: { team, members } }),
      });
      const data = await res.json();
      if (data.ok) {
        setDraftToken(data.resumeToken);
        setSavedAt(new Date());
      }
    } finally {
      setSavingDraft(false);
    }
  }

  /* ── per-step validation ── */
  function validateStep(s: number): boolean {
    const next: Record<string, string> = {};
    if (s === 0) {
      if (team.name.trim().length < 3) next["team.name"] = "At least 3 characters";
      if (team.college.trim().length < 2) next["team.college"] = "Required";
      if (team.contactName.trim().length < 2) next["team.contactName"] = "Required";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(team.contactEmail)) next["team.contactEmail"] = "Enter a valid email";
      if (!/^[+\d][\d\s-]{7,19}$/.test(team.contactPhone.trim())) next["team.contactPhone"] = "Enter a valid phone";
      if (availability.name) next["team.name"] = availability.name;
      if (availability.email) next["team.contactEmail"] = availability.email;
    }
    if (s === 1) {
      if (!team.trackId) next["team.trackId"] = "Choose a track";
      else if (availability.track) next["team.trackId"] = availability.track;
    }
    if (s === 2) {
      if (members.length < minMembers) next.members = `Add at least ${minMembers} members`;
      if (members.length > maxMembers) next.members = `A team can have at most ${maxMembers} members`;
      const seen = new Set<string>();
      members.forEach((m, i) => {
        if (m.name.trim().length < 2) next[`members.${i}.name`] = "Required";
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.email)) next[`members.${i}.email`] = "Valid email required";
        else {
          const key = m.email.toLowerCase();
          if (seen.has(key)) next[`members.${i}.email`] = "Duplicate in this form";
          seen.add(key);
        }
      });
      if (!members.some((m) => m.isLeader)) next.leader = "Mark one member as the leader";
    }
    if (s === 3) {
      // College verification: every member's college should match the team's.
      const mismatch = members.find((m) => slugify(m.college) !== slugify(team.college));
      if (mismatch) next.verify = `${mismatch.name || "A member"} listed a different college. Fix it or update the team college.`;
      if (team.projectIdea.trim().length > 0 && team.projectIdea.trim().length < 20)
        next["team.projectIdea"] = "Give us at least a sentence, or leave it blank";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const next = () => {
    if (!validateStep(step)) return;
    const to = Math.min(step + 1, STEPS.length - 1);
    setStep(to);
    track("FORM_STEP", { step: to + 1 });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => {
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  };

  async function submit() {
    if (!validateStep(4)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", team, members }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrors(data.fields ?? {});
        toast.error(data.error ?? "Registration failed.");
        // Send them back to the step most likely responsible.
        if (data.fields?.["trackId"]) setStep(1);
        else if (data.fields?.["members.0.email"]) setStep(2);
        else if (data.fields?.["team.name"]) setStep(0);
        return;
      }
      if (draftToken) {
        await fetch(`/api/register/draft?token=${draftToken}`, { method: "DELETE" }).catch(() => {});
      }
      setDone({
        code: data.team.code,
        name: data.team.name,
        track: data.team.track,
        emailed: data.emailed,
        recipients: data.recipients,
        undelivered: data.undelivered ?? [],
      });
      // The server already logged FORM_COMPLETE against the new team; clear the
      // in-progress flag so closing the tab isn't also logged as an abandon.
      doneRef.current = true;
      clearStarted();
      toast.success("Team registered");
    } catch {
      toast.error("Network error. Your draft is saved — try again.");
    } finally {
      setBusy(false);
    }
  }

  const selectedTrack = useMemo(() => tracks.find((t) => t.id === team.trackId), [tracks, team.trackId]);

  if (!registrationOpen) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <TriangleAlert className="mx-auto size-8 text-warning" />
          <h2 className="mt-3 text-lg font-semibold">Registration is closed</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            All team slots are taken. Contact the organisers if you need a late entry.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <CircleCheck className="mx-auto size-10 text-success" />
          <h2 className="mt-4 text-xl font-semibold">You&rsquo;re registered</h2>
          <p className="mt-1 text-muted-foreground">
            Team <span className="font-medium text-foreground">{done.name}</span> · {done.track}
          </p>
          <div className="mx-auto mt-5 inline-flex flex-col items-center rounded-lg border border-border bg-muted/40 px-8 py-5">
            <span className="text-[11px] tracking-widest text-muted-foreground uppercase">Team ID</span>
            <span className="mt-1 font-mono text-2xl font-semibold tracking-wider">{done.code}</span>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">
            {done.undelivered.length === 0
              ? `A registration confirmation email with your team ID is on its way to all ${done.recipients} member${done.recipients === 1 ? "" : "s"}. Once your payment is verified, individual PDF tickets with check-in QR codes will be sent.`
              : done.emailed > 0
                ? `Confirmation emails reached ${done.emailed} of ${done.recipients} members. We could not reach ${done.undelivered.length}, so please check with your team lead — and quote your team ID if anyone asks.`
                : `We could not send the confirmation emails. Your registration is safe and your team ID above is valid — the organisers can send it to you, so quote your team ID if asked.`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Keep your team ID safe — you&rsquo;ll need it for check-in on event day.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Progress steps={STEPS} current={step} />

      <Card>
        <CardContent className="p-6">
          {step === 0 ? (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Team details</h2>
              <Field label="Team name" htmlFor="t-name" required error={errors["team.name"]} hint="Pick something you'll want on the leaderboard.">
                <Input
                  id="t-name"
                  value={team.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="Autonomous Agents that Actually Finish"
                  maxLength={80}
                  aria-invalid={Boolean(errors["team.name"])}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="College / institution" htmlFor="t-college" required error={errors["team.college"]}>
                  <Input
                    id="t-college"
                    value={team.college}
                    onChange={(e) => setField("college", e.target.value)}
                    maxLength={160}
                    aria-invalid={Boolean(errors["team.college"])}
                  />
                </Field>
                <Field label="City" htmlFor="t-city" error={errors["team.city"]}>
                  <Input id="t-city" value={team.city} onChange={(e) => setField("city", e.target.value)} maxLength={100} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Team lead's name" htmlFor="t-cname" required error={errors["team.contactName"]}>
                  <Input id="t-cname" value={team.contactName} onChange={(e) => setField("contactName", e.target.value)} maxLength={100} />
                </Field>
                <Field label="Team lead's email" htmlFor="t-cemail" required error={errors["team.contactEmail"]} hint="Registration confirmations and event tickets are sent here.">
                  <Input id="t-cemail" type="email" value={team.contactEmail} onChange={(e) => setField("contactEmail", e.target.value)} aria-invalid={Boolean(errors["team.contactEmail"])} />
                </Field>
              </div>
              <Field label="Team lead's phone" htmlFor="t-cphone" required error={errors["team.contactPhone"]}>
                <Input id="t-cphone" value={team.contactPhone} onChange={(e) => setField("contactPhone", e.target.value)} placeholder="+91 98765 43210" aria-invalid={Boolean(errors["team.contactPhone"])} />
              </Field>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Choose your track</h2>
              <p className="text-sm text-muted-foreground">
                Pick the one that best matches what you intend to build. You can be moved later by an
                organiser if your idea shifts.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {tracks.map((t) => {
                  const full = t.capacity !== null && t.taken >= t.capacity;
                  const active = team.trackId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setField("trackId", t.id)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-lg border p-4 text-left transition-colors",
                        active ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
                        full && !active && "opacity-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{t.name}</span>
                        {active ? <Check className="size-4 shrink-0 text-primary" /> : null}
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground">{t.description}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t.capacity === null
                          ? `${t.taken} teams`
                          : full
                            ? "Full"
                            : `${t.taken} of ${t.capacity} slots used`}
                      </p>
                    </button>
                  );
                })}
              </div>
              {errors["team.trackId"] || availability.track ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors["team.trackId"] ?? availability.track}
                </p>
              ) : null}
            </section>
          ) : null}

          {step === 2 ? (
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Members</h2>
                <Badge variant="muted">
                  {members.length} / {maxMembers}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Between {minMembers} and {maxMembers} people. Each person can only be on one team across the
                whole event.
              </p>
              {errors.members ? (
                <p role="alert" className="text-sm text-destructive">{errors.members}</p>
              ) : null}
              {errors.leader ? <p role="alert" className="text-sm text-destructive">{errors.leader}</p> : null}

              <ul className="space-y-4">
                {members.map((m, i) => (
                  <li key={i} className="rounded-lg border border-border p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Member {i + 1}</span>
                        {m.isLeader ? <Badge variant="default">Lead</Badge> : null}
                      </div>
                      <div className="flex gap-1">
                        {!m.isLeader ? (
                          <Button type="button" variant="ghost" size="sm" onClick={() => makeLeader(i)}>
                            Make lead
                          </Button>
                        ) : null}
                        {members.length > minMembers ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove member ${i + 1}`}
                            onClick={() => setMembers((list) => list.filter((_, idx) => idx !== i))}
                          >
                            <Trash2 />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Full name" htmlFor={`m${i}-name`} required error={errors[`members.${i}.name`]}>
                        <Input id={`m${i}-name`} value={m.name} onChange={(e) => setMember(i, { name: e.target.value })} maxLength={100} />
                      </Field>
                      <Field label="Email" htmlFor={`m${i}-email`} required error={errors[`members.${i}.email`]}>
                        <Input id={`m${i}-email`} type="email" value={m.email} onChange={(e) => setMember(i, { email: e.target.value })} />
                      </Field>
                      <Field label="Phone" htmlFor={`m${i}-phone`} error={errors[`members.${i}.phone`]}>
                        <Input id={`m${i}-phone`} value={m.phone} onChange={(e) => setMember(i, { phone: e.target.value })} placeholder="+91 …" />
                      </Field>
                      <Field label="Branch & year" htmlFor={`m${i}-year`} error={errors[`members.${i}.year`]}>
                        <Input id={`m${i}-year`} value={m.year} onChange={(e) => setMember(i, { year: e.target.value })} placeholder="CSE · 3rd year" />
                      </Field>
                    </div>
                  </li>
                ))}
              </ul>

              {members.length < maxMembers ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMembers((list) => [...list, emptyMember(team.college)])}
                >
                  <Plus /> Add member
                </Button>
              ) : null}
            </section>
          ) : null}

          {step === 3 ? (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Verify and describe</h2>
              <p className="text-sm text-muted-foreground">
                Everyone on the team should be from the same college. Correct the college above if this
                is wrong.
              </p>
              {errors.verify ? (
                <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {errors.verify}
                </p>
              ) : null}
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium">{team.college || "—"}</p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {members.map((m, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span className="truncate">{m.name || `Member ${i + 1}`}</span>
                      <span className={cn("text-xs", slugify(m.college) === slugify(team.college) ? "text-success" : "text-warning")}>
                        {m.college || "no college set"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <Field
                label="What are you building?"
                htmlFor="t-idea"
                error={errors["team.projectIdea"]}
                hint="Optional, but a sentence here helps mentors prepare."
              >
                <Textarea
                  id="t-idea"
                  value={team.projectIdea}
                  onChange={(e) => setField("projectIdea", e.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="An agent that triages support tickets, calls the right tools and drafts a reply for human approval."
                />
              </Field>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="space-y-5">
              <h2 className="text-lg font-semibold">Review and submit</h2>

              <div className="rounded-lg border border-border">
                <Row label="Team" value={team.name} />
                <Row label="Track" value={selectedTrack?.name ?? "—"} />
                <Row label="College" value={`${team.college}${team.city ? `, ${team.city}` : ""}`} />
                <Row label="Lead" value={`${team.contactName} · ${team.contactEmail} · ${team.contactPhone}`} />
                <Row label="Members" value={`${members.length} (${members.filter((m) => m.isLeader).length} lead)`} />
                {team.projectIdea ? <Row label="Idea" value={team.projectIdea} /> : null}
              </div>

              <div className="rounded-lg border border-border">
                <p className="border-b border-border px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Member list
                </p>
                <ul className="divide-y divide-border/60">
                  {members.map((m, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="truncate">
                        {m.name || "—"} {m.isLeader ? <Badge variant="default" className="ml-1">Lead</Badge> : null}
                      </span>
                      <span className="truncate text-muted-foreground">{m.email}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-muted-foreground">
                By submitting you confirm everyone listed has agreed to take part, and that the work you
                submit is your own. You&rsquo;ll receive a registration confirmation with your team ID by email. Individual admission tickets with QR codes will follow once payment is verified.
              </p>
            </section>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={back} disabled={step === 0 || busy}>
          <ArrowLeft /> Back
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void saveDraft()}
            disabled={savingDraft}
            title="Your progress is saved automatically once you enter a lead email"
          >
            {savingDraft ? <Loader2 className="animate-spin" /> : <Save />}
            {savedAt ? "Saved" : "Save draft"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>
              Continue <ArrowRight />
            </Button>
          ) : (
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />} Submit registration
            </Button>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {draftToken
          ? "Progress is saved. You can close this tab and resume with the same email."
          : "Enter your team lead's email and progress saves automatically."}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/60 px-4 py-2.5 last:border-0 sm:flex-row sm:gap-4">
      <span className="w-28 shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
