function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = curr;
  }
  return prev[n];
}

/** 0 (no similarity) to 1 (identical). */
export function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export type MatchConfidence = "exact" | "fuzzy" | "none";

export interface CourseMatchCandidate {
  id: string;
  name: string;
  prefix: string;
}

/** Finds the closest course by name/prefix — exact, substring, then fuzzy similarity. */
export function findBestCourseMatch(
  query: string,
  courses: CourseMatchCandidate[],
): { course: CourseMatchCandidate | null; confidence: MatchConfidence } {
  const q = query.trim().toLowerCase();
  if (!q || courses.length === 0) return { course: null, confidence: "none" };

  const exact = courses.find(
    (c) => c.name.toLowerCase() === q || c.prefix.toLowerCase() === q,
  );
  if (exact) return { course: exact, confidence: "exact" };

  const substring = courses.find((c) => {
    const name = c.name.toLowerCase();
    return name.includes(q) || q.includes(name);
  });
  if (substring) return { course: substring, confidence: "fuzzy" };

  let best: { course: CourseMatchCandidate; score: number } | null = null;
  for (const c of courses) {
    const score = stringSimilarity(q, c.name.toLowerCase());
    if (!best || score > best.score) best = { course: c, score };
  }
  if (best && best.score >= 0.55) return { course: best.course, confidence: "fuzzy" };
  return { course: null, confidence: "none" };
}
