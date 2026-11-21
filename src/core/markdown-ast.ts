import type { CardMeta, IndexedCard } from "../types";

const META_RE = /<!--pe-meta:\s*(.*?)\s*-->/i;

export function serializeAlignedMeta(meta: CardMeta, includeSRCompat = true): string {
  const srEase = Math.round((2.8 - (meta.diff || 3.0) * 0.3) * 100);
  const ankiPart = meta.ankiNoteId ? ` ankiId=${meta.ankiNoteId}` : "";
  const peTag = `<!--pe-meta: id=${meta.id} due=${meta.due} ivl=${meta.ivl} reps=${meta.reps} diff=${meta.diff.toFixed(1)} s=${meta.s.toFixed(2)} d=${meta.d.toFixed(2)} lapses=${meta.lapses} attempts=${meta.attempts}${ankiPart} hist=${(meta.hist || []).join(",")} -->`;
  return includeSRCompat ? `${peTag}<!--SR:!${meta.due},${meta.ivl},${srEase}-->` : peTag;
}

export function parseCardsFromMarkdown(text: string, filePath: string, defaultDeck: string): IndexedCard[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const cards: IndexedCard[] = [];
  let inFence = false;
  let i = 0;

  // Skip YAML frontmatter
  if (lines[0] === "---") {
    const fmEnd = lines.indexOf("---", 1);
    if (fmEnd > 0) i = fmEnd + 1;
  }

  while (i < lines.length) {
    const raw = lines[i]!;
    if (/^\s*(?:>\s*)?(?:```|~~~)/.test(raw)) {
      inFence = !inFence;
      i++;
      continue;
    }
    if (inFence) {
      i++;
      continue;
    }

    const head = raw.match(/^\s*>\s*\[!question\][+-]?\s*(.*)$/i);
    if (!head) {
      i++;
      continue;
    }

    let end = i;
    while (end + 1 < lines.length && /^\s*>/.test(lines[end + 1]!)) end++;
    const block = lines.slice(i, end + 1);

    let ansIdx = -1;
    for (let b = 1; b < block.length; b++) {
      if (/^\s*>\s*>?\s*\[!answer\]/i.test(block[b]!)) {
        ansIdx = b;
        break;
      }
    }
    const qLines = (ansIdx === -1 ? block.slice(1) : block.slice(1, ansIdx)).map((l) => l.replace(/^\s*>\s?/, ""));
    const aLines = ansIdx === -1 ? [] : block.slice(ansIdx + 1).map((l) => l.replace(/^\s*>\s?(?:>\s?)?/, ""));

    let k = end + 1;
    while (k < lines.length && lines[k]!.trim() === "") k++;
    const mm = k < lines.length ? lines[k]!.match(META_RE) : null;
    const metaLine = mm ? k : -1;

    const meta: CardMeta = {
      id: `c_${i}`,
      due: new Date().toISOString().slice(0, 10),
      ivl: 1,
      reps: 0,
      diff: 3.0,
      s: 1.0,
      d: 5.0,
      lapses: 0,
      attempts: 0,
      hist: [],
    };
    if (mm && mm[1]) {
      for (const m of mm[1].matchAll(/(\w+)=(\S*)/g)) {
        const [, key, val] = m;
        if (key === "id" && val) meta.id = val;
        else if (key === "due" && val) meta.due = val;
        else if (key === "ivl") meta.ivl = Math.max(1, parseInt(val || "1", 10) || 1);
        else if (key === "reps") meta.reps = parseInt(val || "0", 10) || 0;
        else if (key === "diff") meta.diff = parseFloat(val || "3.0") || 3.0;
        else if (key === "s") meta.s = parseFloat(val || "1.0") || 1.0;
        else if (key === "d") meta.d = parseFloat(val || "5.0") || 5.0;
        else if (key === "lapses") meta.lapses = parseInt(val || "0", 10) || 0;
        else if (key === "attempts") meta.attempts = parseInt(val || "0", 10) || 0;
        else if (key === "ankiId") meta.ankiNoteId = parseInt(val || "0", 10) || undefined;
        else if (key === "hist") meta.hist = val ? val.split(",").filter(Boolean) : [];
      }
    }

    cards.push({
      key: `${filePath}::${meta.id}`,
      filePath,
      startLine: i,
      endLine: end,
      metaLine,
      questionMd: qLines.join("\n").trim(),
      answerMd: aLines.join("\n").trim(),
      deck: defaultDeck,
      tags: [],
      meta,
    });

    i = metaLine !== -1 ? metaLine + 1 : end + 1;
  }

  return cards;
}
