import type { CardDraftInput, CardFormat, CardMeta, IndexedCard } from "../types";
import { todayLocalStr } from "./fsrs-adapter";

const META_RE = /<!--\s*pe-meta:\s*(.*?)\s*-->/i;
const TAPE_IMG_RE = /<!--\s*pe-tape:\s*(.*?)\s*-->/g;

function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function stableFallbackId(filePath: string, questionMd: string, occurrence: number): string {
  const norm = questionMd.toLowerCase().replace(/\s+/g, " ").trim();
  const base = fnv1aHash(`${filePath}::${norm}`);
  return occurrence > 1 ? `h_${base}_${occurrence}` : `h_${base}`;
}

export function parseCardHeader(title: string): {
  type: string;
  difficulty: string;
  subjects: string[];
  tags: string[];
  concepts: string[];
} {
  const fields: Record<string, string> = {};
  for (const part of title.split("|")) {
    const m = part.match(/^\s*(\w+)\s*::\s*(.*?)\s*$/);
    if (m && m[1]) {
      fields[m[1].toLowerCase()] = (m[2] ?? "").trim();
    }
  }
  const subStr = fields.subjects || fields.subject || "";
  const subjects = subStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const tagStr = fields.tags || fields.tag || "";
  const tags = tagStr
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);

  const concepts = (fields.concepts || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    type: fields.type || "Conceptual",
    difficulty: fields.difficulty || "Moderate",
    subjects,
    tags,
    concepts,
  };
}

export function parseCardMeta(inner: string, fallbackId: string): CardMeta {
  const meta: CardMeta = {
    id: fallbackId,
    due: todayLocalStr(),
    ivl: 1,
    reps: 0,
    diff: 3.0,
    s: 1.0,
    d: 5.0,
    lapses: 0,
    attempts: 0,
    hist: [],
  };

  for (const m of inner.matchAll(/(\w+)=(\S*)/g)) {
    const key = m[1];
    const val = m[2] ?? "";
    if (key === "id" && val) meta.id = val;
    else if (key === "due" && /^\d{4}-\d{2}-\d{2}$/.test(val)) meta.due = val;
    else if (key === "ivl") {
      const n = parseInt(val, 10);
      if (Number.isFinite(n) && n >= 1) meta.ivl = n;
    } else if (key === "reps") {
      const n = parseInt(val, 10);
      if (Number.isFinite(n) && n >= 0) meta.reps = n;
    } else if (key === "diff") {
      const n = parseFloat(val);
      if (Number.isFinite(n) && n >= 0.5 && n <= 10) meta.diff = n;
    } else if (key === "s") {
      const n = parseFloat(val);
      if (Number.isFinite(n) && n > 0) meta.s = n;
    } else if (key === "d") {
      const n = parseFloat(val);
      if (Number.isFinite(n) && n >= 1 && n <= 10) meta.d = n;
    } else if (key === "lapses") {
      const n = parseInt(val, 10);
      if (Number.isFinite(n) && n >= 0) meta.lapses = n;
    } else if (key === "attempts") {
      const n = parseInt(val, 10);
      if (Number.isFinite(n) && n >= 0) meta.attempts = n;
    } else if (key === "ankiId") {
      const n = parseInt(val, 10);
      if (Number.isFinite(n) && n > 0) meta.ankiNoteId = n;
    } else if (key === "hist") {
      meta.hist = val ? val.split(",").filter(Boolean) : [];
    }
  }

  return meta;
}

export function serializeAlignedMeta(meta: CardMeta, includeSRCompat = true): string {
  const srEase = Math.max(130, Math.round((2.8 - (meta.diff || 3.0) * 0.3) * 100));
  const ankiPart = meta.ankiNoteId ? ` ankiId=${meta.ankiNoteId}` : "";
  const peTag = `<!--pe-meta: id=${meta.id} due=${meta.due} ivl=${meta.ivl} reps=${meta.reps} diff=${meta.diff.toFixed(1)} s=${meta.s.toFixed(2)} d=${meta.d.toFixed(2)} lapses=${meta.lapses} attempts=${meta.attempts}${ankiPart} hist=${(meta.hist || []).join(",")} -->`;
  return includeSRCompat ? `${peTag}<!--SR:!${meta.due},${meta.ivl},${srEase}-->` : peTag;
}

export function buildCardMarkdown(
  card: CardDraftInput,
  meta: CardMeta,
  format: CardFormat = "callout",
  includeSRCompat = true
): string {
  const parts: string[] = [];
  if (card.type) parts.push(`Type:: ${card.type}`);
  if (card.difficulty) parts.push(`Difficulty:: ${card.difficulty}`);
  if (card.subjects.length) parts.push(`Subjects:: ${card.subjects.join(", ")}`);
  if (card.tags.length) parts.push(`Tags:: ${card.tags.map((t) => `#${t.replace(/^#/, "")}`).join(", ")}`);
  if (card.concepts.length) parts.push(`Concepts:: ${card.concepts.join(", ")}`);

  const metaStr = serializeAlignedMeta(meta, includeSRCompat);
  const cleanQ = card.question.replace(/\r\n?/g, "\n").trim();
  const cleanA = card.answer.replace(/\r\n?/g, "\n").trim();

  if (format === "block") {
    return [
      `%%pe-card ${parts.join(" | ")} %%`,
      cleanQ,
      "",
      "%%pe-answer%%",
      cleanA,
      "%%pe-end%%",
      metaStr,
    ].join("\n");
  }

  const out: string[] = [`> [!question] ${parts.join(" | ")}`];
  for (const line of cleanQ.split("\n")) out.push(`> ${line}`);
  out.push(">");
  out.push("> > [!answer]");
  for (const line of cleanA.split("\n")) out.push(`> > ${line}`);
  out.push(metaStr);
  return out.join("\n");
}

export function parseCardsFromMarkdown(
  text: string,
  filePath: string,
  defaultDeck: string,
  frontmatterSubjects: string[] = []
): IndexedCard[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const fileBasename = filePath.replace(/^.*[\\/]/, "").replace(/\.md$/i, "");
  const cards: IndexedCard[] = [];
  const seenContent = new Map<string, number>();
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

    // Format 1: Clean Markdown Block (%%pe-card ... %% ... %%pe-answer%% ... %%pe-end%%)
    const blockStart = raw.match(/^(?:%%|<!--)\s*pe-card\b(.*?)(?:%%|-->)?$/i);
    if (blockStart) {
      const headerStr = blockStart[1] ?? "";
      let end = i + 1;
      let ansLine = -1;
      let cardEnd = -1;
      while (end < lines.length) {
        const l = lines[end]!;
        if (/^(?:%%|<!--)\s*pe-answer\b/i.test(l)) ansLine = end;
        else if (/^(?:%%|<!--)\s*pe-end\b/i.test(l)) {
          cardEnd = end;
          break;
        }
        end++;
      }

      if (cardEnd !== -1) {
        const qLines = ansLine !== -1 ? lines.slice(i + 1, ansLine) : lines.slice(i + 1, cardEnd);
        const aLines = ansLine !== -1 ? lines.slice(ansLine + 1, cardEnd) : [];
        const questionMd = qLines.join("\n").trim();
        const answerMd = aLines.join("\n").trim();

        let k = cardEnd + 1;
        while (k < lines.length && lines[k]!.trim() === "") k++;
        const mm = k < lines.length ? lines[k]!.match(META_RE) : null;
        const metaLine = mm ? k : -1;

        const normQ = questionMd.toLowerCase().replace(/\s+/g, " ").trim();
        const occ = (seenContent.get(normQ) ?? 0) + 1;
        seenContent.set(normQ, occ);

        const fallbackId = stableFallbackId(filePath, questionMd, occ);
        const meta = mm && mm[1] ? parseCardMeta(mm[1], fallbackId) : parseCardMeta("", fallbackId);
        const header = parseCardHeader(headerStr);
        const subjects = header.subjects.length ? header.subjects : frontmatterSubjects;

        cards.push({
          key: `${filePath}::${meta.id}`,
          filePath,
          fileBasename,
          format: "block",
          startLine: i,
          endLine: cardEnd,
          metaLine,
          type: header.type,
          difficulty: header.difficulty,
          subjects,
          concepts: header.concepts,
          questionMd,
          answerMd,
          deck: defaultDeck,
          tags: header.tags,
          meta,
        });

        i = metaLine !== -1 ? metaLine + 1 : cardEnd + 1;
        continue;
      }
    }

    // Format 2: Standard Callout (> [!question] ... > > [!answer])
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
    const qLines = (ansIdx === -1 ? block.slice(1) : block.slice(1, ansIdx)).map((l) =>
      l.replace(/^\s*>\s?/, "")
    );
    const aLines =
      ansIdx === -1 ? [] : block.slice(ansIdx + 1).map((l) => l.replace(/^\s*>\s?(?:>\s?)?/, ""));

    const questionMd = qLines.join("\n").trim();
    const answerMd = aLines.join("\n").trim();

    let k = end + 1;
    while (k < lines.length && lines[k]!.trim() === "") k++;
    const mm = k < lines.length ? lines[k]!.match(META_RE) : null;
    const metaLine = mm ? k : -1;

    const normQ = questionMd.toLowerCase().replace(/\s+/g, " ").trim();
    const occ = (seenContent.get(normQ) ?? 0) + 1;
    seenContent.set(normQ, occ);

    const fallbackId = stableFallbackId(filePath, questionMd, occ);
    const meta = mm && mm[1] ? parseCardMeta(mm[1], fallbackId) : parseCardMeta("", fallbackId);
    const header = parseCardHeader(head[1] ?? "");
    const subjects = header.subjects.length ? header.subjects : frontmatterSubjects;

    cards.push({
      key: `${filePath}::${meta.id}`,
      filePath,
      fileBasename,
      format: "callout",
      startLine: i,
      endLine: end,
      metaLine,
      type: header.type,
      difficulty: header.difficulty,
      subjects,
      concepts: header.concepts,
      questionMd,
      answerMd,
      deck: defaultDeck,
      tags: header.tags,
      meta,
    });

    i = metaLine !== -1 ? metaLine + 1 : end + 1;
  }

  return cards;
}

export function escapeHtmlEntities(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function processClozeAndTapeMarkdown(rawMd: string, isAnswerPhase: boolean): string {
  if (!rawMd) return "";
  let text = rawMd;

  text = text.replace(/==tape::(.*?)(?:::([^=]+))?==/g, (_m, content: string, label?: string) => {
    const lbl = escapeHtmlEntities(label ? label.trim() : "MASKED");
    const safeContent = escapeHtmlEntities(content);
    return `<span class="pe-masking-tape ${isAnswerPhase ? "is-peeled" : ""}" data-state="${isAnswerPhase ? "peeled" : "masked"}" title="Click to peel tape"><span class="pe-tape-banner"><span class="pe-tape-icon">🩹</span> <span class="pe-tape-lbl">${lbl}</span></span><span class="pe-tape-content">${safeContent}</span></span>`;
  });

  text = text.replace(/%%tape(?:::([^%]+))?::(.*?)%%/g, (_m, label: string | undefined, content: string) => {
    const lbl = escapeHtmlEntities(label ? label.trim() : "MASKED");
    const safeContent = escapeHtmlEntities(content);
    return `<span class="pe-masking-tape ${isAnswerPhase ? "is-peeled" : ""}" data-state="${isAnswerPhase ? "peeled" : "masked"}" title="Click to peel tape"><span class="pe-tape-banner"><span class="pe-tape-icon">🩹</span> <span class="pe-tape-lbl">${lbl}</span></span><span class="pe-tape-content">${safeContent}</span></span>`;
  });

  text = text.replace(/==((?!tape::).*?)==/g, (_m, content: string) => {
    const safeContent = escapeHtmlEntities(content);
    if (!isAnswerPhase) {
      return `<span class="pe-cloze-pill" data-answer="${encodeURIComponent(content)}" title="Click to reveal">[...]</span>`;
    }
    return `<span class="pe-cloze-revealed">${safeContent}</span>`;
  });

  text = text.replace(/\{\{(?:c\d+::)?([^}:]+)(?:::([^}]+))?\}\}/g, (_m, content: string, hint?: string) => {
    const safeContent = escapeHtmlEntities(content);
    if (!isAnswerPhase) {
      const lbl = hint ? `[${escapeHtmlEntities(hint.trim())}]` : "[...]";
      return `<span class="pe-cloze-pill" data-answer="${encodeURIComponent(content)}" title="Click to reveal">${lbl}</span>`;
    }
    return `<span class="pe-cloze-revealed">${safeContent}</span>`;
  });

  return text;
}

export function attachInteractiveTapeAndClozeListeners(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(".pe-masking-tape").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const isPeeled = el.classList.toggle("is-peeled");
      el.setAttribute("data-state", isPeeled ? "peeled" : "masked");
    });
  });

  container.querySelectorAll<HTMLElement>(".pe-cloze-pill").forEach((pill) => {
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      const ans = decodeURIComponent(pill.getAttribute("data-answer") || "");
      pill.className = "pe-cloze-revealed";
      pill.textContent = ans;
    });
  });

  container.querySelectorAll<HTMLElement>("img, .internal-embed").forEach((img) => {
    const parent = img.parentElement;
    if (!parent || parent.classList.contains("pe-image-occlusion-wrap")) return;
    const matches = [...parent.innerHTML.matchAll(TAPE_IMG_RE)];
    if (!matches.length) return;

    parent.classList.add("pe-image-occlusion-wrap");
    matches.forEach((m, idx) => {
      const rawSpec = m[1] ?? "";
      const topM = rawSpec.match(/top=([\d.]+%?)/);
      const leftM = rawSpec.match(/left=([\d.]+%?)/);
      const widthM = rawSpec.match(/width=([\d.]+%?)/);
      const heightM = rawSpec.match(/height=([\d.]+%?)/);
      const labelM = rawSpec.match(/label="?([^"]*)"?/);

      const tape = document.createElement("div");
      tape.className = "pe-occlusion-tape";
      tape.style.top = topM?.[1] ?? "20%";
      tape.style.left = leftM?.[1] ?? "20%";
      tape.style.width = widthM?.[1] ?? "25%";
      tape.style.height = heightM?.[1] ?? "12%";

      const tag = document.createElement("span");
      tag.className = "pe-occlusion-tag";
      tag.textContent = labelM?.[1] ?? String(idx + 1);
      tape.appendChild(tag);

      tape.addEventListener("click", (e) => {
        e.stopPropagation();
        tape.classList.toggle("is-peeled");
      });
      parent.appendChild(tape);
    });
  });
}
