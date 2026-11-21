// Persistence: Capacitor Preferences on device, localStorage in the browser.
import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";
import type { SetRecord } from "./metrics";

const KEY_SETS = "ufl.sets.v1";
const KEY_MAX = "ufl.max.v1";
const KEY_EX = "ufl.exercises.v1";

export const DEFAULT_EXERCISES = [
  // Isometric
  "Isometric Row",
  "Isometric Deadlift Pull",
  "Isometric Curl",
  "Isometric Chest Press (strap)",
  "Isometric Overhead Press (strap)",
  "Isometric Squat (strap)",
  // Self-resisted (isokinetic)
  "SR Row",
  "SR One-Arm Row",
  "SR Rotating Pull-up / Chin-up",
  "SR One-Arm Lat Pulldown",
  "SR Military Press",
  "SR Chest Press",
  "SR One-Arm Chest Press",
  "SR Curl / Pushdown",
];

/** Training variation for an exercise name: self-resisted vs isometric. */
export function variationFor(name: string): "iso" | "self-resisted" {
  return /^SR\b|self.?resisted/i.test(name) ? "self-resisted" : "iso";
}

async function get<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = Capacitor.isNativePlatform()
      ? (await Preferences.get({ key })).value
      : localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

async function set(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  if (Capacitor.isNativePlatform()) await Preferences.set({ key, value: raw });
  else localStorage.setItem(key, raw);
}

export type MaxMap = Record<string, { kg: number; at: number }>; // key = exercise|side

// ---------- people (profiles) ----------
// Each person has their own sets and maxes. "me" keeps the original storage keys so
// data recorded before profiles existed stays with the default person.
export interface Profile { id: string; name: string }
const KEY_PROFILES = "ufl.profiles.v1";
interface ProfileState { list: Profile[]; current: string }
let profileState: ProfileState = { list: [{ id: "me", name: "Me" }], current: "me" };
function setsKey() { return profileState.current === "me" ? KEY_SETS : `ufl.p.${profileState.current}.sets`; }
function maxKey() { return profileState.current === "me" ? KEY_MAX : `ufl.p.${profileState.current}.max`; }

export const profiles = {
  async load(): Promise<ProfileState> {
    profileState = await get<ProfileState>(KEY_PROFILES, profileState);
    if (!profileState.list.length) profileState.list = [{ id: "me", name: "Me" }];
    if (!profileState.list.some((p) => p.id === profileState.current)) profileState.current = profileState.list[0].id;
    return profileState;
  },
  list(): Profile[] { return profileState.list; },
  current(): Profile { return profileState.list.find((p) => p.id === profileState.current) ?? profileState.list[0]; },
  async select(id: string) { if (profileState.list.some((p) => p.id === id)) { profileState.current = id; await set(KEY_PROFILES, profileState); } },
  async add(name: string): Promise<Profile> {
    const p: Profile = { id: "p" + Date.now().toString(36), name: name.trim() };
    profileState.list.push(p); profileState.current = p.id; await set(KEY_PROFILES, profileState); return p;
  },
  async rename(id: string, name: string) { const p = profileState.list.find((x) => x.id === id); if (p) { p.name = name.trim(); await set(KEY_PROFILES, profileState); } },
  async remove(id: string) {
    if (id === "me" || profileState.list.length <= 1) return;
    profileState.list = profileState.list.filter((p) => p.id !== id);
    if (profileState.current === id) profileState.current = profileState.list[0].id;
    await set(KEY_PROFILES, profileState);
    for (const key of [`ufl.p.${id}.sets`, `ufl.p.${id}.max`]) {
      if (Capacitor.isNativePlatform()) await Preferences.remove({ key }); else localStorage.removeItem(key);
    }
  },
};

export const store = {
  async sets(): Promise<SetRecord[]> { return get<SetRecord[]>(setsKey(), []); },
  async saveSet(rec: SetRecord) {
    const all = await this.sets();
    all.push(rec);
    // keep the file bounded: last 500 sets
    await set(setsKey(), all.slice(-500));
  },
  async updateSet(rec: SetRecord) {
    const all = await this.sets();
    const i = all.findIndex((s) => s.id === rec.id);
    if (i >= 0) all[i] = rec; else all.push(rec);
    await set(setsKey(), all);
  },
  async deleteSet(id: string) {
    const all = await this.sets();
    await set(setsKey(), all.filter((s) => s.id !== id));
  },
  async maxes(): Promise<MaxMap> { return get<MaxMap>(maxKey(), {}); },
  async setMax(exercise: string, side: string, kg: number) {
    const m = await this.maxes();
    m[`${exercise}|${side}`] = { kg, at: Date.now() };
    await set(maxKey(), m);
  },
  async deleteMax(key: string) {
    const m = await this.maxes();
    delete m[key];
    await set(maxKey(), m);
  },
  async exercises(): Promise<string[]> { return get<string[]>(KEY_EX, DEFAULT_EXERCISES); },
  async saveExercises(list: string[]) { await set(KEY_EX, list); },
};
