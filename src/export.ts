// Export sets as JSON or CSV. On Android: write to cache + share sheet.
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { repsFor, performedAt, type SetRecord } from "./metrics";

export function toCSV(sets: SetRecord[], person = ""): string {
  const head = ["person", "id", "date_performed", "recorded_at", "exercise", "side", "contraction", "handle", "mode", "duration_s", "peak_kg", "avg_kg", "output_kgs", "inroad_pct", "reps", "auto_reps", "rep_peaks"];
  const rows = sets.map((s) => [
    q(person), s.id, isoDate(performedAt(s)), new Date(s.startedAt).toISOString(), q(s.exercise), s.side, s.contraction ?? "complete", q(s.handle ?? ""), s.mode, s.durationS.toFixed(1),
    s.peak, s.avg, s.output, s.inroad, repsFor(s), s.reps?.length ?? 0, q((s.reps ?? []).map((r) => r.peak).join(" ")),
  ].join(","));
  return [head.join(","), ...rows].join("\n");
}

export function samplesCSV(s: SetRecord): string {
  return ["t_s,kg", ...s.samples.map((p) => `${p.t.toFixed(2)},${p.kg.toFixed(2)}`)].join("\n");
}

function q(v: string) { return `"${v.replace(/"/g, '""')}"`; }

export async function exportText(filename: string, text: string, mime: string) {
  if (Capacitor.isNativePlatform()) {
    const res = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: filename, files: [res.uri] });
    return;
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}


export function isoDate(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
