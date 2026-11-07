'use strict';

const obsidian = require('obsidian');
const {
  Plugin, ItemView, MarkdownRenderer, Modal, Notice,
  PluginSettingTab, Setting, TFile, TFolder, setIcon,
  AbstractInputSuggest, FuzzySuggestModal
} = obsidian;

const VIEW_TYPE = 'practice-engine-view';

const DEFAULT_SETTINGS = {
  practiceFolder: 'Practice',
  attachmentFolder: 'attachments',
  schedulerMode: 'fsrs', // 'fsrs' | 'sm2'
  targetRetention: 0.90, // FSRS target retention rate
  cardFormat: 'callout', // 'callout' | 'block'
  creationMode: 'modal', // 'modal' | 'direct'
  enableLatexToolboxBridge: true,
  enableNoteToolboxBridge: false, // Default to native reliable gallery
  enableNaturalMathEngine: true,
  enableSmartMathTyping: true,
  previewLines: '2',
  visibleColumns: {
    topic: true,
    subject: true,
    type: true,
    difficulty: true,
    interval: true,
    reps: true,
    due: true
  },
  lastTopicPath: '',
  glassmorphism: true,
  cardDraft: null
};

const COGNITIVE_TYPES = ['Conceptual', 'Calculation', 'Deep Thinking', 'Factual', 'Procedural'];
const DIFFICULTY_LEVELS = ['Introductory', 'Moderate', 'Challenging', 'Mastery'];

/* ------------------------------------------------------------------ */
/* Stage 1 & Stage 2 Metacognitive Descriptors                         */
/* ------------------------------------------------------------------ */

const RETRIEVAL_EFFORTS = [
  { id: 'FAST_CONFIDENT', code: 'FC', label: 'Instant Recall', hint: 'Automatic recall, zero cognitive friction', css: 'pe-effort-fast' },
  { id: 'DELIBERATE', code: 'DS', label: 'Deliberate Search', hint: 'Took time, conscious cognitive retrieval', css: 'pe-effort-deliberate' },
  { id: 'MENTAL_CALC', code: 'MC', label: 'Mental Math', hint: 'Derived internally without external aid', css: 'pe-effort-mental' },
  { id: 'TOOL_CALC', code: 'TC', label: 'Scratchpad / Calc', hint: 'Solved using scratchpad or formula tool', css: 'pe-effort-tool' },
  { id: 'EDUCATED_GUESS', code: 'EG', label: 'Educated Guess', hint: 'Eliminated options / intuition', css: 'pe-effort-guess' },
  { id: 'BLANK', code: 'BL', label: 'Complete Blank', hint: 'No retrieval path available', css: 'pe-effort-blank' }
];

const ACCURACY_DIAGNOSTICS = [
  { id: 'FLAWLESS', code: 'FL', label: 'Flawless & Complete', hint: 'Mechanics and reasoning exact', css: 'pe-acc-flawless' },
  { id: 'FACTUAL_SLIP', code: 'FS', label: 'Factual / Calc Slip', hint: 'Core concept sound; arithmetic/typo slip', css: 'pe-acc-slip' },
  { id: 'PARTIAL_CONCEPTS', code: 'PC', label: 'Partial Concepts', hint: 'Retrieved some sub-concepts, missed others', css: 'pe-acc-partial' },
  { id: 'CONFIDENT_FLAW', code: 'CF', label: 'Confident Misconception', hint: 'Held false belief with high certainty', css: 'pe-acc-confident-flaw' },
  { id: 'TOTAL_FAILURE', code: 'TF', label: 'Total Failure', hint: 'Completely missed answer or blanked', css: 'pe-acc-fail' }
];

const META_RE = /^\s*<!--\s*pe-meta:(.*?)-->\s*(<!--SR:.*?-->)?\s*$/;
const TAPE_IMG_RE = /<!--\s*pe-tape:\s*(.*?)\s*-->/g;

const AI_PROMPT = [
  'You are an expert practice card creator for the Obsidian Practice Engine plugin.',
  'Analyze the material provided and generate high-yield active-recall questions.',
  '',
  'Output ONLY ONE code block in this exact structure. Separate cards with a line containing only ---',
  '',
  '```text',
  'Topic: <Subtopic name, e.g. Faraday Law>',
  'Subject: <General subject, e.g. Physics, Electrical Engineering>',
  'Subchapter: <Chapter/Lecture, e.g. Lecture 04>',
  '',
  '---',
  'Type: <Conceptual | Calculation | Deep Thinking | Factual | Procedural>',
  'Difficulty: <Introductory | Moderate | Challenging | Mastery>',
  'Tags: <Optional comma-separated #tags, e.g. #physics, #exam2026>',
  'Concepts: <2 to 4 checklist sub-concepts, comma-separated>',
  'Q: <Question text; supports $math$, LaTeX, cloze ==hidden==, tape ==tape::masked==, and embeds ![[image.png]]>',
  'A: <Model answer; step-by-step solutions, ![[Note#Heading]] embeds supported>',
  'Ref: <Optional [[Lecture Note]] or external URI>',
  '---',
  '```',
  '',
  'Rules:',
  '- Exactly one clear question per card.',
  '- Concepts must be concise items I can check off upon seeing the solution.',
  '- For calculations, show full step-by-step math in the answer.',
  '- Do not put triple dashes (---) inside questions or answers.'
].join('\n');

/* ------------------------------------------------------------------ */
/* Date & Formatting Utilities                                        */
/* ------------------------------------------------------------------ */

function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function todayStr() {
  return fmtDate(new Date());
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return fmtDate(new Date(y, m - 1, d + Math.round(n)));
}

function daysBetween(d1, d2) {
  const [y1, m1, day1] = d1.split('-').map(Number);
  const [y2, m2, day2] = d2.split('-').map(Number);
  const t1 = new Date(y1, m1 - 1, day1).getTime();
  const t2 = new Date(y2, m2 - 1, day2).getTime();
  return Math.max(0, Math.round((t2 - t1) / (1000 * 60 * 60 * 24)));
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function generateCardId() {
  return 'c_' + Math.random().toString(36).substring(2, 9);
}

function defaultMeta() {
  return {
    id: generateCardId(),
    due: todayStr(),
    ivl: 1,
    reps: 0,
    diff: 3.0,
    s: 1.0,     // FSRS stability (in days)
    d: 5.0,     // FSRS difficulty (1.0 to 10.0)
    lapses: 0,
    attempts: 0,
    hist: []
  };
}

function parseMeta(inner) {
  const meta = defaultMeta();
  const re = /(\w+)=(\S*)/g;
  let m;
  while ((m = re.exec(inner)) !== null) {
    const [, k, v] = m;
    if (k === 'id' && v) meta.id = v;
    else if (k === 'due' && /^\d{4}-\d{2}-\d{2}$/.test(v)) meta.due = v;
    else if (k === 'ivl') meta.ivl = Math.max(1, parseInt(v, 10) || 1);
    else if (k === 'reps') meta.reps = Math.max(0, parseInt(v, 10) || 0);
    else if (k === 'diff') meta.diff = Math.min(5, Math.max(1, parseFloat(v) || 3.0));
    else if (k === 's') meta.s = Math.max(0.1, parseFloat(v) || 1.0);
    else if (k === 'd') meta.d = Math.min(10.0, Math.max(1.0, parseFloat(v) || 5.0));
    else if (k === 'lapses') meta.lapses = Math.max(0, parseInt(v, 10) || 0);
    else if (k === 'attempts') meta.attempts = Math.max(0, parseInt(v, 10) || 0);
    else if (k === 'hist') meta.hist = v ? v.split(',').filter(Boolean) : [];
  }
  return meta;
}

function serializeMeta(meta) {
  const srEase = Math.round((2.8 - (meta.diff || 3.0) * 0.3) * 100);
  const s = (meta.s !== undefined ? meta.s : 1.0).toFixed(2);
  const d = (meta.d !== undefined ? meta.d : 5.0).toFixed(2);
  const diff = (meta.diff || 3.0).toFixed(1);
  const id = meta.id || generateCardId();
  return `<!--pe-meta: id=${id} due=${meta.due} ivl=${meta.ivl} reps=${meta.reps} diff=${diff} s=${s} d=${d} lapses=${meta.lapses || 0} attempts=${meta.attempts || 0} hist=${(meta.hist || []).join(',')} --><!--SR:!${meta.due},${meta.ivl},${srEase}-->`;
}

/* ------------------------------------------------------------------ */
/* Natural Math Engine (WolframAlpha / Maple / MATLAB -> LaTeX)        */
/* ------------------------------------------------------------------ */

const MATH_PRESETS = [
  { label: 'd/dx (Deriv)', expr: 'diff(y, x)', desc: 'First derivative dy/dx' },
  { label: 'd²/dx²', expr: 'diff(y, x, 2)', desc: 'Second derivative d²y/dx²' },
  { label: '∂/∂x (Partial)', expr: 'partial(f, x)', desc: 'Partial derivative' },
  { label: '∫ Definite', expr: 'int(x^2, x, 0, pi)', desc: 'Definite integral from a to b' },
  { label: '∫ Indefinite', expr: 'int(f(x), x)', desc: 'Indefinite integral' },
  { label: 'a/b Fraction', expr: '(a + b)/(c + d)', desc: 'Clean fraction' },
  { label: 'lim Limit', expr: 'lim(sin(x)/x, x, 0)', desc: 'Limit as x approaches a' },
  { label: '∑ Sum', expr: 'sum(1/n^2, n, 1, inf)', desc: 'Summation from n=1 to inf' },
  { label: '√ Sqrt', expr: 'sqrt(x^2 + y^2)', desc: 'Square root' },
  { label: '[ ] Matrix', expr: '[1 2; 3 4]', desc: '2x2 Matrix' }
];

function splitTopLevelArgs(str) {
  const args = [];
  let cur = '';
  let pDepth = 0;
  let bDepth = 0;
  let cDepth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') pDepth++;
    else if (ch === ')') pDepth = Math.max(0, pDepth - 1);
    else if (ch === '[') bDepth++;
    else if (ch === ']') bDepth = Math.max(0, bDepth - 1);
    else if (ch === '{') cDepth++;
    else if (ch === '}') cDepth = Math.max(0, cDepth - 1);

    if (ch === ',' && pDepth === 0 && bDepth === 0 && cDepth === 0) {
      args.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

function replaceBalancedFunction(input, fnNames, replacer) {
  let out = input;
  for (const fn of fnNames) {
    let re = new RegExp('\\b' + fn + '\\s*\\(', 'g');
    let m;
    while ((m = re.exec(out)) !== null) {
      const startIdx = m.index;
      const openParen = startIdx + m[0].length - 1;
      let depth = 1;
      let i = openParen + 1;
      while (i < out.length && depth > 0) {
        if (out[i] === '(') depth++;
        else if (out[i] === ')') depth--;
        if (depth > 0) i++;
      }
      if (depth === 0) {
        const rawArgs = out.slice(openParen + 1, i);
        const args = splitTopLevelArgs(rawArgs);
        const rep = replacer(fn, args);
        out = out.slice(0, startIdx) + rep + out.slice(i + 1);
        re.lastIndex = startIdx + rep.length;
      }
    }
  }
  return out;
}

function convertSlashFractions(input) {
  let out = input;
  let slashIdx;
  while ((slashIdx = out.indexOf('/')) !== -1) {
    if (slashIdx === 0 || slashIdx === out.length - 1) break;
    if (out[slashIdx - 1] === '<' || out[slashIdx + 1] === '_') break; // phasor guard

    let lEnd = slashIdx - 1;
    while (lEnd >= 0 && /\s/.test(out[lEnd])) lEnd--;
    let lStart = lEnd;
    if (out[lEnd] === ')') {
      let depth = 1;
      lStart = lEnd - 1;
      while (lStart >= 0 && depth > 0) {
        if (out[lStart] === ')') depth++;
        else if (out[lStart] === '(') depth--;
        if (depth > 0) lStart--;
      }
    } else {
      while (lStart >= 0 && /[a-zA-Z0-9_.^\\]/.test(out[lStart])) lStart--;
      lStart++;
    }

    let rStart = slashIdx + 1;
    while (rStart < out.length && /\s/.test(out[rStart])) rStart++;
    let rEnd = rStart;
    if (out[rStart] === '(') {
      let depth = 1;
      rEnd = rStart + 1;
      while (rEnd < out.length && depth > 0) {
        if (out[rEnd] === '(') depth++;
        else if (out[rEnd] === ')') depth--;
        if (depth > 0) rEnd++;
      }
      rEnd++;
    } else {
      while (rEnd < out.length && /[a-zA-Z0-9_.^\\]/.test(out[rEnd])) rEnd++;
    }

    let num = out.slice(lStart, lEnd + 1).trim();
    let den = out.slice(rStart, rEnd).trim();
    if (num.startsWith('(') && num.endsWith(')')) num = num.slice(1, -1).trim();
    if (den.startsWith('(') && den.endsWith(')')) den = den.slice(1, -1).trim();

    const rep = `\\frac{${num}}{${den}}`;
    out = out.slice(0, lStart) + rep + out.slice(rEnd);
  }
  return out;
}

function parseMatlabMatrix(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const inner = trimmed.slice(1, -1).trim();
  const rows = inner.split(';').map((r) => r.trim()).filter(Boolean);
  if (!rows.length) return null;

  const rowLatex = rows.map((r) => {
    const cells = r.split(/[\s,]+/).filter(Boolean);
    return cells.join(' & ');
  });

  return `\\begin{bmatrix} ${rowLatex.join(' \\\\ ')} \\end{bmatrix}`;
}

function convertNaturalMathToLatex(rawInput) {
  if (!rawInput || !rawInput.trim()) return '';
  let s = rawInput.trim();

  // Bare keyword shorthand translations
  if (s === 'diff' || s === 'deriv' || s === 'd/dx' || s === 'dy/dx') return '\\frac{dy}{dx}';
  if (s === 'dx') return '\\,dx';
  if (s === 'dt') return '\\,dt';
  if (s === 'int' || s === 'integrate') return '\\int f(x)\\,dx';
  if (s === 'iint') return '\\iint_D f\\,dA';
  if (s === 'lim' || s === 'limit') return '\\lim_{x \\to 0}';
  if (s === 'sum') return '\\sum_{n=1}^{\\infty}';
  if (s === 'sqrt') return '\\sqrt{x}';
  if (s === 'partial' || s === 'pdiff') return '\\frac{\\partial y}{\\partial x}';

  // 1. MATLAB matrix check
  const mat = parseMatlabMatrix(s);
  if (mat) return mat;

  // 2. Phasor angles
  s = s.replace(/\/_|<_/g, ' \\angle ');

  // 3. Balanced functions
  s = replaceBalancedFunction(
    s,
    [
      'int', 'integrate', 'iint', 'iiint', 'oint',
      'diff', 'deriv', 'partial', 'pdiff', 'lim', 'limit',
      'sum', 'prod', 'sqrt', 'cbrt', 'root',
      'abs', 'norm', 'exp', 'laplace', 'fourier'
    ],
    (fn, args) => {
      const a0 = args[0] ? convertNaturalMathToLatex(args[0]) : 'f(x)';
      const a1 = args[1] ? convertNaturalMathToLatex(args[1]) : 'x';
      const a2 = args[2] ? convertNaturalMathToLatex(args[2]) : '';
      const a3 = args[3] ? convertNaturalMathToLatex(args[3]) : '';

      if (fn === 'int' || fn === 'integrate') {
        if (args.length >= 4) return `\\int_{${a2}}^{${a3}} ${a0} \\,d${a1}`;
        if (args.length === 2) return `\\int ${a0} \\,d${a1}`;
        return `\\int ${a0} \\,dx`;
      }
      if (fn === 'iint') return `\\iint_{${args[1] ? a1 : 'D'}} ${a0} \\,dA`;
      if (fn === 'iiint') return `\\iiint_{${args[1] ? a1 : 'V'}} ${a0} \\,dV`;
      if (fn === 'oint') return `\\oint_{C} ${a0} \\,ds`;
      if (fn === 'diff' || fn === 'deriv') {
        const order = args[2] ? args[2].trim() : '1';
        if (order === '1') return `\\frac{d ${a0}}{d${a1}}`;
        return `\\frac{d^{${order}} ${a0}}{d${a1}^{${order}}}`;
      }
      if (fn === 'partial' || fn === 'pdiff') {
        const order = args[2] ? args[2].trim() : '1';
        if (order === '1') return `\\frac{\\partial ${a0}}{\\partial ${a1}}`;
        return `\\frac{\\partial^{${order}} ${a0}}{\\partial ${a1}^{${order}}}`;
      }
      if (fn === 'lim' || fn === 'limit') {
        return `\\lim_{${a1} \\to ${a2 || '0'}} ${a0}`;
      }
      if (fn === 'sum') {
        return `\\sum_{${a1}=${a2 || '1'}}^{${a3 || '\\infty'}} ${a0}`;
      }
      if (fn === 'prod') {
        return `\\prod_{${a1}=${a2 || '1'}}^{${a3 || 'n'}} ${a0}`;
      }
      if (fn === 'sqrt') return `\\sqrt{${a0}}`;
      if (fn === 'cbrt') return `\\sqrt[3]{${a0}}`;
      if (fn === 'root') return `\\sqrt[${a1}]{${a0}}`;
      if (fn === 'abs') return `\\left| ${a0} \\right|`;
      if (fn === 'norm') return `\\left\\| ${a0} \\right\\|`;
      if (fn === 'exp') return `e^{${a0}}`;
      if (fn === 'laplace') return `\\mathcal{L}\\left\\{ ${a0} \\right\\}`;
      if (fn === 'fourier') return `\\mathcal{F}\\left\\{ ${a0} \\right\\}`;
      return `${fn}(${args.join(', ')})`;
    }
  );

  // 4. Fractions
  s = convertSlashFractions(s);

  // 5. Auto subscripts
  s = s.replace(/\b([a-zA-Z])(\d{2,})\b/g, '$1_{$2}');

  // 6. Greek symbols
  const greek = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'phi', 'chi', 'psi', 'omega'];
  for (const g of greek) {
    const re = new RegExp('\\b' + g + '\\b', 'g');
    s = s.replace(re, '\\' + g);
  }

  // 7. Relational operators
  s = s.replace(/\+\-/g, '\\pm ')
       .replace(/<=/g, '\\le ')
       .replace(/>=/g, '\\ge ')
       .replace(/!=/g, '\\neq ')
       .replace(/<=>/g, '\\iff ')
       .replace(/=>/g, '\\implies ')
       .replace(/->/g, '\\to ');

  return s.trim();
}

/* ------------------------------------------------------------------ */
/* FSRS & SM-2 Metacognitive Scheduling Engine                        */
/* ------------------------------------------------------------------ */

function calculateNextReview(meta, effortId, accuracyId, today, settings) {
  const mode = (settings && settings.schedulerMode) || 'fsrs';
  const targetRetention = (settings && settings.targetRetention) || 0.90;

  if (mode === 'fsrs') {
    return calculateNextReviewFSRS(meta, effortId, accuracyId, today, targetRetention);
  }
  return calculateNextReviewSM2(meta, effortId, accuracyId, today);
}

function calculateNextReviewFSRS(meta, effortId, accuracyId, today, targetRetention = 0.90) {
  const effort = RETRIEVAL_EFFORTS.find((e) => e.id === effortId) || RETRIEVAL_EFFORTS[0];
  if (effortId === 'BLANK') accuracyId = 'TOTAL_FAILURE';
  const acc = ACCURACY_DIAGNOSTICS.find((a) => a.id === accuracyId) || ACCURACY_DIAGNOSTICS[0];

  let grade = 3;
  if (accuracyId === 'TOTAL_FAILURE' || effortId === 'BLANK' || accuracyId === 'CONFIDENT_FLAW') {
    grade = 1;
  } else if (accuracyId === 'PARTIAL_CONCEPTS' || effortId === 'EDUCATED_GUESS') {
    grade = 2;
  } else if (accuracyId === 'FACTUAL_SLIP' || effortId === 'DELIBERATE' || effortId === 'TOOL_CALC') {
    grade = 3;
  } else if (accuracyId === 'FLAWLESS' && (effortId === 'FAST_CONFIDENT' || effortId === 'MENTAL_CALC')) {
    grade = 4;
  }

  const next = {
    id: meta.id || generateCardId(),
    due: today,
    ivl: meta.ivl || 1,
    reps: meta.reps || 0,
    diff: meta.diff || 3.0,
    s: meta.s || 1.0,
    d: meta.d || 5.0,
    lapses: meta.lapses || 0,
    attempts: (meta.attempts || 0) + 1,
    hist: (meta.hist || []).slice()
  };

  const elapsed = meta.hist && meta.hist.length ? daysBetween(meta.hist[meta.hist.length - 1].split(':')[0], today) : next.ivl;
  const retrievability = Math.pow(0.9, elapsed / Math.max(0.1, next.s));

  if (next.attempts === 1 || !meta.s) {
    const initStabilities = { 1: 0.4, 2: 1.2, 3: 3.2, 4: 8.0 };
    next.s = initStabilities[grade] || 2.0;
    next.d = Math.min(10.0, Math.max(1.0, 5.0 - (grade - 3) * 1.5));
    if (accuracyId === 'CONFIDENT_FLAW') {
      next.d = Math.min(10.0, next.d + 2.5);
      next.s = 0.4;
      next.lapses += 1;
    }
    next.reps = grade >= 3 ? 1 : 0;
  } else {
    if (grade >= 2) {
      const deltaD = -0.5 * (grade - 3);
      next.d = Math.min(10.0, Math.max(1.0, next.d + deltaD));

      const gradeMultiplier = grade === 2 ? 0.75 : (grade === 3 ? 1.0 : 1.4);
      let growthFactor = 1.0 + (11.0 - next.d) * Math.pow(next.s, -0.2) * (Math.exp(0.5 * (1.0 - retrievability)) - 1.0) * gradeMultiplier;

      if ((effortId === 'DELIBERATE' || effortId === 'MENTAL_CALC') && accuracyId === 'FLAWLESS') {
        growthFactor *= 1.25;
      }

      next.s = Math.max(next.s + 1.0, next.s * growthFactor);
      next.reps += 1;
      next.diff = Math.max(1.0, next.diff - (grade === 4 ? 0.15 : 0.05));
    } else {
      next.lapses += 1;
      next.reps = 0;
      if (accuracyId === 'CONFIDENT_FLAW') {
        next.d = Math.min(10.0, next.d + 2.5);
        next.s = 0.4;
        next.diff = Math.min(5.0, next.diff + 0.6);
      } else {
        next.d = Math.min(10.0, next.d + 1.2);
        next.s = Math.max(0.5, next.s * 0.25);
        next.diff = Math.min(5.0, next.diff + 0.3);
      }
    }
  }

  const factor = Math.log(targetRetention) / Math.log(0.90);
  next.ivl = Math.max(1, Math.round(next.s * factor));
  next.due = addDays(today, next.ivl);

  next.hist.push(`${today}:${effort.code}:${acc.code}`);
  next.hist = next.hist.slice(-10);
  return next;
}

function calculateNextReviewSM2(meta, effortId, accuracyId, today) {
  const effort = RETRIEVAL_EFFORTS.find((e) => e.id === effortId) || RETRIEVAL_EFFORTS[0];
  if (effortId === 'BLANK') accuracyId = 'TOTAL_FAILURE';
  const acc = ACCURACY_DIAGNOSTICS.find((a) => a.id === accuracyId) || ACCURACY_DIAGNOSTICS[0];

  const next = {
    id: meta.id || generateCardId(),
    due: today,
    ivl: meta.ivl,
    reps: meta.reps,
    diff: meta.diff,
    s: meta.s || 1.0,
    d: meta.d || 5.0,
    lapses: meta.lapses || 0,
    attempts: (meta.attempts || 0) + 1,
    hist: (meta.hist || []).slice()
  };

  let grade = 3;
  if (accuracyId === 'TOTAL_FAILURE' || effortId === 'BLANK') {
    grade = 0;
  } else if (accuracyId === 'CONFIDENT_FLAW') {
    grade = 1;
  } else if (accuracyId === 'PARTIAL_CONCEPTS' || effortId === 'EDUCATED_GUESS') {
    grade = 2;
  } else if (accuracyId === 'FACTUAL_SLIP') {
    grade = 3;
  } else if (accuracyId === 'FLAWLESS') {
    grade = (effortId === 'DELIBERATE' || effortId === 'MENTAL_CALC') ? 5 : 4;
  }

  const ease = Math.max(1.3, 2.8 - (next.diff * 0.3));

  if (grade < 3) {
    next.reps = 0;
    next.ivl = 1;
    next.lapses += 1;
    next.diff = Math.min(5.0, next.diff + (accuracyId === 'CONFIDENT_FLAW' ? 0.6 : 0.3));
  } else {
    next.reps += 1;
    if (next.reps === 1) next.ivl = 1;
    else if (next.reps === 2) next.ivl = 6;
    else next.ivl = Math.round(next.ivl * ease);

    if (grade === 5) next.diff = Math.max(1.0, next.diff - 0.15);
    else if (grade === 4 && effortId === 'FAST_CONFIDENT') next.diff = Math.max(1.0, next.diff - 0.10);
  }

  next.due = addDays(today, next.ivl);
  next.hist.push(`${today}:${effort.code}:${acc.code}`);
  next.hist = next.hist.slice(-10);
  return next;
}

/* ------------------------------------------------------------------ */
/* Card Parser & Builder (Universal Callouts & Clean Blocks)          */
/* ------------------------------------------------------------------ */

const stripCR = (s) => s.replace(/\r$/, '');
const normKey = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function parseHeader(title) {
  const fields = {};
  title.split('|').forEach((part) => {
    const m = part.match(/^\s*(\w+)\s*::\s*(.*?)\s*$/);
    if (m) fields[m[1].toLowerCase()] = m[2];
  });
  const subStr = fields.subjects || fields.subject || '';
  const subjects = subStr.split(',').map((s) => s.trim()).filter(Boolean);

  const tagStr = fields.tags || fields.tag || '';
  const tags = tagStr.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean);

  return {
    type: fields.type || 'Conceptual',
    difficulty: fields.difficulty || 'Moderate',
    subjects,
    tags,
    concepts: fields.concepts ? fields.concepts.split(',').map((s) => s.trim()).filter(Boolean) : []
  };
}

function parseCards(text, file) {
  const lines = text.split('\n');
  const cards = [];
  const seen = {};
  let inFence = false;
  let i = 0;

  while (i < lines.length) {
    const raw = stripCR(lines[i]);

    if (/^\s*(>\s*)?(```|~~~)/.test(raw)) {
      inFence = !inFence;
      i++;
      continue;
    }
    if (inFence) {
      i++;
      continue;
    }

    // MODE 1: Clean Markdown Block Cards (%%pe-card ... %% or <!--pe-card ... -->)
    const blockStart = raw.match(/^(?:%%|<!--)\s*pe-card\b(.*?)(?:%%|-->)?$/i);
    if (blockStart) {
      const headerStr = blockStart[1] || '';
      let end = i + 1;
      let ansLine = -1;
      let cardEnd = -1;

      while (end < lines.length) {
        const l = stripCR(lines[end]);
        if (/^(?:%%|<!--)\s*pe-answer\b/i.test(l)) {
          ansLine = end;
        } else if (/^(?:%%|<!--)\s*pe-end\b/i.test(l)) {
          cardEnd = end;
          break;
        }
        end++;
      }

      if (cardEnd !== -1) {
        const qLines = ansLine !== -1 ? lines.slice(i + 1, ansLine) : lines.slice(i + 1, cardEnd);
        const aLines = ansLine !== -1 ? lines.slice(ansLine + 1, cardEnd) : [];

        let k = cardEnd + 1;
        while (k < lines.length && stripCR(lines[k]).trim() === '') k++;
        const mm = k < lines.length ? stripCR(lines[k]).match(META_RE) : null;
        const metaLine = mm ? k : -1;
        const meta = mm ? parseMeta(mm[1]) : defaultMeta();

        const { type, difficulty, subjects, tags, concepts } = parseHeader(headerStr);
        const questionMd = qLines.join('\n').trim();
        const baseKey = meta.id || normKey(questionMd);
        seen[baseKey] = (seen[baseKey] || 0) + 1;

        cards.push({
          format: 'block',
          startLine: i,
          endLine: cardEnd,
          metaLine,
          meta,
          type,
          difficulty,
          subjects,
          tags,
          concepts,
          questionMd,
          answerMd: aLines.join('\n').trim(),
          file,
          key: meta.id || `${baseKey}#${seen[baseKey]}`
        });

        i = metaLine !== -1 ? metaLine + 1 : cardEnd + 1;
        continue;
      }
    }

    // MODE 2: Callout Cards (> [!question] ... > > [!answer])
    const head = raw.match(/^\s*>\s*\[!question\][+-]?\s*(.*)$/i);
    if (!head) {
      i++;
      continue;
    }

    let end = i;
    while (end + 1 < lines.length && /^\s*>/.test(lines[end + 1])) end++;
    const block = lines.slice(i, end + 1).map(stripCR);

    let a = -1;
    for (let b = 1; b < block.length; b++) {
      if (/^\s*>\s*>?\s*\[!answer\]/i.test(block[b])) {
        a = b;
        break;
      }
    }
    const qLines = (a === -1 ? block.slice(1) : block.slice(1, a)).map((l) => l.replace(/^\s*>\s?/, ''));
    const aLines = a === -1 ? [] : block.slice(a + 1).map((l) => l.replace(/^\s*>\s?(>\s?)?/, ''));

    let k = end + 1;
    while (k < lines.length && stripCR(lines[k]).trim() === '') k++;
    const mm = k < lines.length ? stripCR(lines[k]).match(META_RE) : null;
    const metaLine = mm ? k : -1;
    const meta = mm ? parseMeta(mm[1]) : defaultMeta();

    const { type, difficulty, subjects, tags, concepts } = parseHeader(head[1]);
    const questionMd = qLines.join('\n').trim();
    const baseKey = meta.id || normKey(questionMd);
    seen[baseKey] = (seen[baseKey] || 0) + 1;

    cards.push({
      format: 'callout',
      startLine: i,
      endLine: end,
      metaLine,
      meta,
      type,
      difficulty,
      subjects,
      tags,
      concepts,
      questionMd,
      answerMd: aLines.join('\n').trim(),
      file,
      key: meta.id || `${baseKey}#${seen[baseKey]}`
    });

    i = metaLine !== -1 ? metaLine + 1 : end + 1;
  }
  return cards;
}

function buildCardMarkdown(c, meta = defaultMeta(), format = 'callout') {
  const parts = [];
  if (c.type) parts.push(`Type:: ${c.type}`);
  if (c.difficulty) parts.push(`Difficulty:: ${c.difficulty}`);
  if (c.subjects && c.subjects.length) parts.push(`Subjects:: ${c.subjects.join(', ')}`);
  if (c.tags && c.tags.length) parts.push(`Tags:: ${c.tags.map(t => '#' + t.replace(/^#/, '')).join(', ')}`);
  if (c.concepts && c.concepts.length) parts.push(`Concepts:: ${c.concepts.join(', ')}`);
  const metaStr = serializeMeta(meta);

  if (format === 'block') {
    const out = [
      `%%pe-card ${parts.join(' | ')} %%`,
      String(c.question || '').replace(/\r/g, '').trim(),
      '',
      '%%pe-answer%%',
      String(c.answer || '').replace(/\r/g, '').trim(),
      '%%pe-end%%',
      metaStr
    ];
    return out.join('\n');
  }

  const out = [`> [!question] ${parts.join(' | ')}`];
  String(c.question || '').replace(/\r/g, '').trim().split('\n').forEach((l) => out.push(`> ${l}`));
  out.push('>');
  out.push('> > [!answer]');
  String(c.answer || '').replace(/\r/g, '').trim().split('\n').forEach((l) => out.push(`> > ${l}`));
  out.push(metaStr);
  return out.join('\n');
}

function parseImport(raw) {
  const text = raw.replace(/\r/g, '');
  const out = { cards: [], topic: '', subject: '', subchapter: '' };
  if (!text.trim()) return out;

  const blocks = text.split(/^[ \t]*-{3,}[ \t]*$/m);
  for (const block of blocks) {
    const card = { type: 'Conceptual', difficulty: 'Moderate', subjects: [], tags: [], concepts: [], question: '', answer: '', ref: '' };
    let field = null;
    for (const line of block.split('\n')) {
      let m;
      if ((m = line.match(/^\s*Topic\s*:\s*(.*)$/i))) { out.topic = m[1].trim(); field = null; }
      else if ((m = line.match(/^\s*Subject\s*:\s*(.*)$/i))) {
        out.subject = m[1].trim();
        card.subjects = m[1].split(',').map((s) => s.trim()).filter(Boolean);
        field = null;
      }
      else if ((m = line.match(/^\s*Subchapter\s*:\s*(.*)$/i))) { out.subchapter = m[1].trim(); field = null; }
      else if ((m = line.match(/^\s*Type\s*:\s*(.*)$/i))) { card.type = m[1].trim(); field = null; }
      else if ((m = line.match(/^\s*Difficulty\s*:\s*(.*)$/i))) { card.difficulty = m[1].trim(); field = null; }
      else if ((m = line.match(/^\s*Tags?\s*:\s*(.*)$/i))) {
        card.tags = m[1].split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean);
        field = null;
      }
      else if ((m = line.match(/^\s*Concepts?\s*:\s*(.*)$/i))) {
        card.concepts = m[1].split(',').map((s) => s.trim()).filter(Boolean);
        field = null;
      }
      else if ((m = line.match(/^\s*(?:Q|Question)\s*:\s?(.*)$/i))) { field = 'question'; card.question = m[1]; }
      else if ((m = line.match(/^\s*(?:A|Answer)\s*:\s?(.*)$/i))) { field = 'answer'; card.answer = m[1]; }
      else if ((m = line.match(/^\s*Ref(?:erence)?\s*:\s*(.*)$/i))) { card.ref = m[1].trim(); field = null; }
      else if (field) card[field] += '\n' + line;
    }
    card.question = card.question.trim();
    card.answer = card.answer.trim();
    if (card.question) {
      if (card.ref) card.answer = (card.answer + '\n\nReference: ' + card.ref).trim();
      out.cards.push(card);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Masking Tape & Cloze Engine Renderer                               */
/* ------------------------------------------------------------------ */

function processClozeAndTapeMarkdown(rawMd, isAnswerPhase) {
  if (!rawMd) return '';
  let text = rawMd;

  text = text.replace(/==tape::(.*?)(?:::([^=]+))?==/g, (match, content, label) => {
    const lbl = label ? label.trim() : 'MASKED';
    return `<span class="pe-masking-tape ${isAnswerPhase ? 'is-peeled' : ''}" data-state="${isAnswerPhase ? 'peeled' : 'masked'}" title="Click to peel tape"><span class="pe-tape-banner"><span class="pe-tape-icon">🩹</span> <span class="pe-tape-lbl">${lbl}</span></span><span class="pe-tape-content">${content}</span></span>`;
  });

  text = text.replace(/%%tape(?:::([^%]+))?::(.*?)%%/g, (match, label, content) => {
    const lbl = label ? label.trim() : 'MASKED';
    return `<span class="pe-masking-tape ${isAnswerPhase ? 'is-peeled' : ''}" data-state="${isAnswerPhase ? 'peeled' : 'masked'}" title="Click to peel tape"><span class="pe-tape-banner"><span class="pe-tape-icon">🩹</span> <span class="pe-tape-lbl">${lbl}</span></span><span class="pe-tape-content">${content}</span></span>`;
  });

  text = text.replace(/==((?!tape::).*?)==/g, (match, content) => {
    if (!isAnswerPhase) {
      return `<span class="pe-cloze-pill" data-answer="${encodeURIComponent(content)}" title="Click to reveal">[...]</span>`;
    }
    return `<span class="pe-cloze-revealed">${content}</span>`;
  });

  text = text.replace(/\{\{(?:c\d+::)?([^}:]+)(?:::([^}]+))?\}\}/g, (match, content, hint) => {
    if (!isAnswerPhase) {
      const lbl = hint ? `[${hint.trim()}]` : '[...]';
      return `<span class="pe-cloze-pill" data-answer="${encodeURIComponent(content)}" title="Click to reveal">${lbl}</span>`;
    }
    return `<span class="pe-cloze-revealed">${content}</span>`;
  });

  return text;
}

function attachInteractiveTapeAndClozeListeners(container) {
  container.querySelectorAll('.pe-masking-tape').forEach((el) => {
    el.onclick = (e) => {
      e.stopPropagation();
      const isPeeled = el.classList.toggle('is-peeled');
      el.setAttribute('data-state', isPeeled ? 'peeled' : 'masked');
    };
  });

  container.querySelectorAll('.pe-cloze-pill').forEach((pill) => {
    pill.onclick = (e) => {
      e.stopPropagation();
      const ans = decodeURIComponent(pill.getAttribute('data-answer') || '');
      pill.className = 'pe-cloze-revealed';
      pill.textContent = ans;
    };
  });

  const imgEls = container.querySelectorAll('img, .internal-embed');
  imgEls.forEach((img) => {
    const parent = img.parentElement;
    if (!parent) return;
    const parentText = parent.innerHTML;
    const matches = [...parentText.matchAll(TAPE_IMG_RE)];
    if (matches.length > 0 && !parent.classList.contains('pe-image-occlusion-wrap')) {
      parent.classList.add('pe-image-occlusion-wrap');
      matches.forEach((m, idx) => {
        const rawSpec = m[1];
        const topM = rawSpec.match(/top=([\d.]+%?)/);
        const leftM = rawSpec.match(/left=([\d.]+%?)/);
        const widthM = rawSpec.match(/width=([\d.]+%?)/);
        const heightM = rawSpec.match(/height=([\d.]+%?)/);
        const labelM = rawSpec.match(/label="?([^"]*)"?/);

        const tape = document.createElement('div');
        tape.className = 'pe-occlusion-tape';
        tape.style.top = topM ? topM[1] : '20%';
        tape.style.left = leftM ? leftM[1] : '20%';
        tape.style.width = widthM ? widthM[1] : '25%';
        tape.style.height = heightM ? heightM[1] : '12%';

        const tag = document.createElement('span');
        tag.className = 'pe-occlusion-tag';
        tag.textContent = labelM ? labelM[1] : String(idx + 1);
        tape.appendChild(tag);

        tape.onclick = (e) => {
          e.stopPropagation();
          tape.classList.toggle('is-peeled');
        };
        parent.appendChild(tape);
      });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Visual Media Gallery Modal (Grid View & Safe Image Scaling)        */
/* ------------------------------------------------------------------ */

class MediaGalleryModal extends Modal {
  constructor(app, plugin, onSelect) {
    super(app);
    this.plugin = plugin;
    this.onSelect = onSelect;
    this.selectedFolder = 'ALL';
    this.activeTab = 'ALL';
    this.searchQuery = '';
  }

  onOpen() {
    this.modalEl.addClass('pe-modal');
    this.titleEl.setText('Attach Media & Images');
    this.build();
  }

  build() {
    const { contentEl } = this;
    contentEl.empty();

    const topBar = contentEl.createDiv({ cls: 'pe-gallery-toolbar' });
    const sIn = topBar.createEl('input', {
      cls: 'pe-search-input-pill',
      attr: { placeholder: 'Search attachments by name...', style: 'flex: 1;' }
    });
    sIn.value = this.searchQuery;
    sIn.oninput = () => {
      this.searchQuery = sIn.value.toLowerCase();
      this.renderGrid(gridContainer);
    };

    const folders = this.getAttachmentFolders();
    const fSel = topBar.createEl('select', { cls: 'pe-select-pill' });
    fSel.createEl('option', { text: '📁 All Folders', attr: { value: 'ALL' } });
    folders.forEach((f) => fSel.createEl('option', { text: `📁 ${f}`, attr: { value: f } }));
    fSel.value = this.selectedFolder;
    fSel.onchange = () => {
      this.selectedFolder = fSel.value;
      this.renderGrid(gridContainer);
    };

    const catBar = contentEl.createDiv({ cls: 'pe-seg', attr: { style: 'margin-bottom: 0.85rem;' } });
    [
      ['ALL', 'All Files'],
      ['IMAGE', '🖼️ Images'],
      ['AUDIO', '🎵 Audio'],
      ['DOC', '📑 Documents']
    ].forEach(([typeId, lbl]) => {
      const b = catBar.createEl('button', {
        cls: `pe-seg-btn ${this.activeTab === typeId ? 'is-active' : ''}`,
        text: lbl
      });
      b.onclick = () => {
        this.activeTab = typeId;
        this.build();
      };
    });

    const gridContainer = contentEl.createDiv({ cls: 'pe-gallery-grid-scroll' });
    this.renderGrid(gridContainer);
  }

  getAttachmentFolders() {
    const set = new Set();
    this.app.vault.getFiles().forEach((f) => {
      if (f.parent && f.parent.path !== '/') set.add(f.parent.path);
    });
    return Array.from(set).sort();
  }

  getFilteredFiles() {
    const all = this.app.vault.getFiles();
    return all.filter((file) => {
      const ext = file.extension.toLowerCase();
      const isImage = ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif', 'excalidraw'].includes(ext);
      const isAudio = ['mp3', 'wav', 'm4a', 'ogg'].includes(ext);
      const isDoc = ['pdf', 'epub', 'html', 'canvas'].includes(ext);

      if (!isImage && !isAudio && !isDoc) return false;
      if (this.activeTab === 'IMAGE' && !isImage) return false;
      if (this.activeTab === 'AUDIO' && !isAudio) return false;
      if (this.activeTab === 'DOC' && !isDoc) return false;

      if (this.selectedFolder !== 'ALL' && (!file.parent || file.parent.path !== this.selectedFolder)) {
        return false;
      }
      if (this.searchQuery && !file.name.toLowerCase().includes(this.searchQuery)) {
        return false;
      }
      return true;
    });
  }

  renderGrid(container) {
    container.empty();
    const files = this.getFilteredFiles();

    if (!files.length) {
      const emptyBox = container.createDiv({ cls: 'pe-empty-gallery' });
      emptyBox.createEl('p', { text: 'No media attachments found matching criteria.' });
      return;
    }

    const grid = container.createDiv({ cls: 'pe-gallery-grid' });

    files.forEach((file) => {
      const ext = file.extension.toLowerCase();
      const isImage = ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(ext);
      const isExcalidraw = ext === 'excalidraw';
      const isAudio = ['mp3', 'wav', 'm4a', 'ogg'].includes(ext);
      const isPdf = ext === 'pdf';

      const card = grid.createDiv({ cls: 'pe-gallery-card' });
      const thumb = card.createDiv({ cls: 'pe-gallery-thumb' });

      if (isImage) {
        const src = this.app.vault.getResourcePath(file);
        thumb.createEl('img', { attr: { src } });
      } else if (isExcalidraw) {
        thumb.createDiv({ cls: 'pe-thumb-icon', text: '🎨 Drawing' });
      } else if (isAudio) {
        thumb.createDiv({ cls: 'pe-thumb-icon', text: '🎵 Audio' });
      } else {
        thumb.createDiv({ cls: 'pe-thumb-icon', text: isPdf ? '📑 PDF' : '📄 Doc' });
      }

      const info = card.createDiv({ cls: 'pe-gallery-info' });
      info.createDiv({ cls: 'pe-gallery-name', text: file.name, attr: { title: file.name } });

      const metaRow = info.createDiv({ cls: 'pe-gallery-meta-row' });
      metaRow.createSpan({ cls: 'pe-gallery-ext-badge', text: ext.toUpperCase() });
      const midMeta = metaRow.createSpan({ cls: 'pe-gallery-mid-meta', text: '...' });
      metaRow.createSpan({ cls: 'pe-gallery-size', text: formatBytes(file.stat ? file.stat.size : 0) });

      if (isImage) {
        const img = new Image();
        img.src = this.app.vault.getResourcePath(file);
        img.onload = () => { midMeta.setText(`${img.naturalWidth}×${img.naturalHeight}`); };
        img.onerror = () => { midMeta.setText(''); };
      } else if (isAudio) {
        const aud = new Audio(this.app.vault.getResourcePath(file));
        aud.onloadedmetadata = () => {
          const m = Math.floor(aud.duration / 60);
          const s = Math.floor(aud.duration % 60);
          midMeta.setText(`${m}:${s.toString().padStart(2, '0')}`);
        };
        aud.onerror = () => { midMeta.setText(''); };
      } else {
        midMeta.setText(ext.toUpperCase());
      }

      card.onclick = () => {
        this.close();
        this.onSelect(`![[${file.name}]]`);
      };
    });
  }
}

/* ------------------------------------------------------------------ */
/* Native Fuzzy Note Pickers (For Embedding & Linking Notes)           */
/* ------------------------------------------------------------------ */

class VaultLinkPickerModal extends FuzzySuggestModal {
  constructor(app, isEmbed, onChooseItemCallback) {
    super(app);
    this.isEmbed = isEmbed;
    this.onChooseItemCallback = onChooseItemCallback;
    this.setPlaceholder(isEmbed ? 'Search note to embed section from...' : 'Search note to link...');
  }

  getItems() { return this.app.vault.getMarkdownFiles(); }
  getItemText(file) { return `${file.basename} (${file.path})`; }

  renderSuggestion(item, el) {
    el.empty();
    el.addClass('pe-sug-item');
    const left = el.createDiv({ cls: 'pe-sug-left' });
    left.createDiv({ cls: 'pe-sug-title', text: item.item.basename });
    if (item.item.parent && item.item.parent.path !== '/') {
      left.createDiv({ cls: 'pe-sug-sub', text: item.item.parent.path });
    }
    el.createDiv({ cls: 'pe-sug-badge', text: '📄' });
  }

  onChooseItem(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const headings = (cache && cache.headings) || [];
    if (headings.length > 0) {
      new HeadingPickerModal(this.app, file, this.isEmbed, this.onChooseItemCallback).open();
      return;
    }
    const prefix = this.isEmbed ? '!' : '';
    this.onChooseItemCallback(`${prefix}[[${file.basename}]]`);
  }
}

class HeadingPickerModal extends FuzzySuggestModal {
  constructor(app, file, isEmbed, onChooseCallback) {
    super(app);
    this.file = file;
    this.isEmbed = isEmbed;
    this.onChooseCallback = onChooseCallback;
    this.setPlaceholder(`Pick a section in "${file.basename}" (or Entire Note)...`);
  }

  getItems() {
    const cache = this.app.metadataCache.getFileCache(this.file);
    const headings = (cache && cache.headings) || [];
    return [
      { isWhole: true, heading: '(Entire Note)', level: 0 },
      ...headings.map((h) => ({ isWhole: false, heading: h.heading, level: h.level }))
    ];
  }

  getItemText(item) { return item.heading; }

  renderSuggestion(item, el) {
    el.empty();
    el.addClass('pe-sug-item');
    const left = el.createDiv({ cls: 'pe-sug-left' });
    left.createDiv({ cls: 'pe-sug-title', text: item.item.heading });
    if (!item.item.isWhole) {
      el.createDiv({ cls: 'pe-sug-badge pe-heading-badge', text: `H${item.item.level}` });
    }
  }

  onChooseItem(item) {
    const prefix = this.isEmbed ? '!' : '';
    if (item.isWhole) {
      this.onChooseCallback(`${prefix}[[${this.file.basename}]]`);
    } else {
      this.onChooseCallback(`${prefix}[[${this.file.basename}#${item.heading}]]`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Dedicated LaTeX Math Input Modal with Live Preview                 */
/* ------------------------------------------------------------------ */

class MathInputModal extends Modal {
  constructor(app, plugin, initialMath, onSubmit) {
    super(app);
    this.plugin = plugin;
    this.math = initialMath || '';
    this.isBlock = initialMath ? initialMath.includes('\n') : false;
    this.onSubmit = onSubmit;
    this.debounceTimer = null;
  }

  onOpen() {
    this.modalEl.addClass('pe-small-modal');
    this.titleEl.setText('Insert LaTeX Math Formula');
    this.build();
  }

  build() {
    const { contentEl } = this;
    contentEl.empty();

    const seg = contentEl.createDiv({ cls: 'pe-seg', attr: { style: 'margin-bottom: 0.75rem;' } });
    const bInline = seg.createEl('button', {
      cls: `pe-seg-btn ${!this.isBlock ? 'is-active' : ''}`,
      text: 'Inline ($...$)'
    });
    const bBlock = seg.createEl('button', {
      cls: `pe-seg-btn ${this.isBlock ? 'is-active' : ''}`,
      text: 'Block ($$...$$)'
    });

    bInline.onclick = () => { this.isBlock = false; this.build(); };
    bBlock.onclick = () => { this.isBlock = true; this.build(); };

    const fField = contentEl.createDiv({ cls: 'pe-field' });
    fField.createEl('label', { text: 'LaTeX Formula' });
    const ta = fField.createEl('textarea', {
      cls: 'pe-textarea',
      attr: { rows: 4, placeholder: 'e.g. \\mathcal{E} = -\\frac{d\\Phi_B}{dt}' }
    });
    ta.value = this.math;
    ta.oninput = () => {
      this.math = ta.value;
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.updatePreview(prevBox), 150);
    };

    contentEl.createEl('label', { text: 'Formula Preview:', attr: { style: 'font-size: var(--font-ui-smaller); color: var(--text-muted);' } });
    const prevBox = contentEl.createDiv({ cls: 'pe-math-preview-box' });
    this.updatePreview(prevBox);

    const foot = contentEl.createDiv({ cls: 'pe-modal-actions', attr: { style: 'margin-top: 1rem;' } });
    const cancel = foot.createEl('button', { cls: 'pe-btn-secondary', text: 'Cancel' });
    cancel.onclick = () => this.close();

    const insertBtn = foot.createEl('button', { cls: 'pe-btn-primary', text: 'Insert Formula' });
    insertBtn.onclick = () => {
      const code = this.math.trim();
      if (!code) { new Notice('Please write a formula.'); return; }
      this.close();
      const formatted = this.isBlock ? `$$\n${code}\n$$` : `$${code}$`;
      this.onSubmit(formatted);
    };

    setTimeout(() => ta.focus(), 50);
  }

  async updatePreview(prevBox) {
    prevBox.empty();
    const code = this.math.trim();
    if (!code) {
      prevBox.createSpan({ text: '*(formula preview)*', attr: { style: 'color: var(--text-faint);' } });
      return;
    }
    const md = this.isBlock ? `$$\n${code}\n$$` : `$${code}$`;
    await MarkdownRenderer.render(this.app, md, prevBox, '', this.plugin);
  }
}

/* ------------------------------------------------------------------ */
/* Natural Math Quick Prompt Modal with Presets & Autocomplete        */
/* ------------------------------------------------------------------ */

class NaturalMathPromptModal extends Modal {
  constructor(app, plugin, initialText, onSubmit) {
    super(app);
    this.plugin = plugin;
    this.initialText = initialText || '';
    this.onSubmit = onSubmit;
  }

  onOpen() {
    this.modalEl.addClass('pe-small-modal');
    this.titleEl.setText('⚡ Natural Math to LaTeX');
    this.build();
  }

  build() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('p', {
      cls: 'pe-confirm-desc',
      text: 'Type natural math or choose a quick preset below to compile into LaTeX equation.'
    });

    // Quick Preset Pills
    const presetWrap = contentEl.createDiv({ cls: 'pe-math-presets' });
    MATH_PRESETS.forEach((p) => {
      const pill = presetWrap.createEl('button', {
        cls: 'pe-tool-pill pe-math-pill',
        text: p.label,
        attr: { title: `${p.desc} (${p.expr})`, type: 'button' }
      });
      pill.onclick = () => {
        input.value = p.expr;
        input.dispatchEvent(new Event('input'));
        input.focus();
      };
    });

    const fField = contentEl.createDiv({ cls: 'pe-field', attr: { style: 'margin-top: 0.65rem;' } });
    const input = fField.createEl('input', {
      cls: 'pe-input',
      attr: { type: 'text', placeholder: 'e.g. diff(y, x), int(x^2, x, 0, pi), [1 2; 3 4], dx' }
    });
    input.value = this.initialText;

    // Autocomplete dropdown suggestions bar
    const sugBox = contentEl.createDiv({ cls: 'pe-math-sug-box' });

    contentEl.createEl('label', { text: 'Equation Preview:', attr: { style: 'font-size: var(--font-ui-smaller); color: var(--text-muted); margin-top: 0.5rem; display: block;' } });
    const prevBox = contentEl.createDiv({ cls: 'pe-math-preview-box' });

    const update = async () => {
      prevBox.empty();
      sugBox.empty();
      const val = input.value.trim().toLowerCase();

      // Show matching suggestions if typing partial triggers
      if (val) {
        const matches = MATH_PRESETS.filter(p => p.expr.toLowerCase().includes(val) || p.label.toLowerCase().includes(val));
        if (matches.length > 0 && val.length < 8) {
          matches.slice(0, 4).forEach(m => {
            const sug = sugBox.createSpan({ cls: 'pe-sug-mini-chip', text: `💡 ${m.expr}` });
            sug.onclick = () => {
              input.value = m.expr;
              input.dispatchEvent(new Event('input'));
              input.focus();
            };
          });
        }
      }

      const res = convertNaturalMathToLatex(input.value);
      if (res) {
        await MarkdownRenderer.render(this.app, `$$${res}$$`, prevBox, '', this.plugin);
      } else {
        prevBox.createSpan({ text: '*(preview equation)*', attr: { style: 'color: var(--text-faint);' } });
      }
    };

    input.oninput = () => update();
    update();

    const foot = contentEl.createDiv({ cls: 'pe-modal-actions', attr: { style: 'margin-top: 1rem;' } });
    const cancel = foot.createEl('button', { cls: 'pe-btn-secondary', text: 'Cancel' });
    cancel.onclick = () => this.close();

    const insertBtn = foot.createEl('button', { cls: 'pe-btn-primary', text: 'Insert LaTeX' });
    insertBtn.onclick = () => {
      const res = convertNaturalMathToLatex(input.value);
      if (!res) { new Notice('Please write an expression.'); return; }
      this.close();
      this.onSubmit(`$${res}$`);
    };

    setTimeout(() => input.focus(), 50);
  }
}

/* ------------------------------------------------------------------ */
/* Autocomplete Suggesters                                            */
/* ------------------------------------------------------------------ */

class FolderSuggest extends AbstractInputSuggest {
  constructor(app, inputEl) {
    super(app, inputEl);
    this.app = app;
  }
  getSuggestions(query) {
    const q = (query || '').toLowerCase();
    const folders = this.app.vault.getAllLoadedFiles()
      .filter((f) => f instanceof TFolder)
      .map((f) => f.path);
    return ['/', ...folders].filter((p) => p.toLowerCase().includes(q));
  }
  renderSuggestion(value, el) {
    el.setText(value === '/' ? '/ (Vault root)' : value);
  }
  selectSuggestion(value) {
    const val = value === '/' ? '' : value;
    this.setValue(val);
    this.inputEl.dispatchEvent(new Event('input'));
    this.close();
  }
}

class FolderSuggestModal extends FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
  }
  getItems() {
    const folders = this.app.vault.getAllLoadedFiles().filter((f) => f instanceof TFolder);
    return [{ path: '', name: '/ (Vault root)' }, ...folders.map((f) => ({ path: f.path, name: f.path }))];
  }
  getItemText(item) { return item.name; }
  onChooseItem(item) { this.onChoose(item.path); }
}

class VaultNoteSuggest extends AbstractInputSuggest {
  constructor(app, inputEl, onSelect) {
    super(app, inputEl);
    this.app = app;
    this.onSelect = onSelect;
  }
  getSuggestions(query) {
    const raw = (query || '').trim();
    const q = raw.toLowerCase();
    const files = this.app.vault.getMarkdownFiles();
    const results = [];

    // If query typed and no exact match, add "Create new note" as top option
    const exact = files.find((f) => f.basename.toLowerCase() === q);
    if (raw && !exact) {
      results.push({ isNew: true, basename: raw });
    }

    const matches = files
      .filter((f) => f.basename.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
      .slice(0, 25)
      .map((f) => ({ isNew: false, file: f, basename: f.basename, path: f.path }));

    results.push(...matches);
    return results;
  }
  renderSuggestion(item, el) {
    el.empty();
    el.addClass('pe-sug-item');
    const left = el.createDiv({ cls: 'pe-sug-left' });
    if (item.isNew) {
      left.createDiv({ cls: 'pe-sug-title', text: `➕ Create new note: "${item.basename}"` });
      left.createDiv({ cls: 'pe-sug-sub', text: 'Will be created in your Practice notes folder on save' });
      el.createDiv({ cls: 'pe-sug-badge pe-badge-alert', text: 'New Note' });
    } else {
      left.createDiv({ cls: 'pe-sug-title', text: item.basename });
      if (item.file.parent && item.file.parent.path !== '/') {
        left.createDiv({ cls: 'pe-sug-sub', text: item.file.parent.path });
      }
      el.createDiv({ cls: 'pe-sug-badge', text: '📄' });
    }
  }
  selectSuggestion(item) {
    this.setValue(item.basename);
    if (this.onSelect) {
      if (item.isNew) {
        this.onSelect({ isNew: true, basename: item.basename, path: '__new__' });
      } else {
        this.onSelect(item.file);
      }
    }
    this.close();
  }
}

function getTextareaCaretCoordinates(textarea, position) {
  const mirror = document.createElement('div');
  const style = window.getComputedStyle(textarea);

  const properties = [
    'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
    'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
    'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize'
  ];

  mirror.style.position = 'absolute';
  mirror.style.top = '-9999px';
  mirror.style.left = '-9999px';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';

  properties.forEach((p) => {
    mirror.style[p] = style[p];
  });

  const text = textarea.value.substring(0, position);
  mirror.textContent = text;

  const span = document.createElement('span');
  span.textContent = textarea.value.substring(position) || '.';
  mirror.appendChild(span);

  document.body.appendChild(mirror);
  const spanTop = span.offsetTop - textarea.scrollTop;
  const spanLeft = span.offsetLeft - textarea.scrollLeft;
  document.body.removeChild(mirror);

  const rect = textarea.getBoundingClientRect();
  const lineHeight = parseInt(style.lineHeight, 10) || 20;

  let top = rect.top + spanTop + lineHeight + 4;
  let left = rect.left + spanLeft;

  const popupWidth = 340;
  const popupHeight = 250;
  if (left + popupWidth > window.innerWidth - 16) {
    left = Math.max(16, window.innerWidth - popupWidth - 16);
  }
  if (top + popupHeight > window.innerHeight - 16) {
    top = Math.max(16, rect.top + spanTop - popupHeight - 4);
  }

  return { top, left };
}

class TextareaLinkAutocompleter {
  constructor(app, textarea) {
    this.app = app;
    this.textarea = textarea;
    this.popupEl = null;
    this.selectedIndex = 0;
    this.items = [];

    this.boundOnInput = () => this.checkTrigger();
    this.boundOnKeyDown = (e) => this.onKeyDown(e);
    this.boundOnClick = () => this.checkTrigger();
    this.boundOnBlur = () => setTimeout(() => this.close(), 250);

    this.textarea.addEventListener('input', this.boundOnInput);
    this.textarea.addEventListener('keydown', this.boundOnKeyDown, true);
    this.textarea.addEventListener('click', this.boundOnClick);
    this.textarea.addEventListener('blur', this.boundOnBlur);
  }

  isOpen() {
    return !!this.popupEl && document.body.contains(this.popupEl);
  }

  close() {
    if (this.popupEl) {
      this.popupEl.remove();
      this.popupEl = null;
    }
  }

  checkTrigger() {
    const cursor = this.textarea.selectionStart || 0;
    const textBefore = this.textarea.value.slice(0, cursor);

    const match = textBefore.match(/(?:^|[^\\])(\!?\[\[)([^\]\n]*)$/);
    if (!match) {
      this.close();
      return;
    }

    const bracketPrefix = match[1];
    const rawQuery = match[2];
    const isEmbed = bracketPrefix.startsWith('!');

    let suggestions = [];

    if (rawQuery.includes('#')) {
      const parts = rawQuery.split('#');
      const noteName = parts[0].trim();
      const headQuery = (parts[1] || '').toLowerCase();
      const file = this.app.metadataCache.getFirstLinkpathDest(noteName, '') ||
                   this.app.vault.getMarkdownFiles().find((f) => f.basename.toLowerCase() === noteName.toLowerCase());
      if (file) {
        const cache = this.app.metadataCache.getFileCache(file);
        const headings = cache && cache.headings ? cache.headings : [];
        suggestions = headings
          .filter((h) => h.heading.toLowerCase().includes(headQuery))
          .slice(0, 25)
          .map((h) => ({
            type: 'heading',
            note: noteName,
            heading: h.heading,
            level: h.level,
            label: h.heading,
            sub: `${file.basename} > H${h.level}`,
            icon: '#'
          }));
      }
    } else {
      const q = rawQuery.toLowerCase();
      const allFiles = this.app.vault.getFiles();
      const exactList = [];
      const startsList = [];
      const containsList = [];

      for (const file of allFiles) {
        const ext = file.extension.toLowerCase();
        const isMd = ext === 'md';
        const isMedia = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp3', 'wav', 'm4a', 'pdf', 'canvas', 'excalidraw'].includes(ext);

        if (!isMd && !isMedia && !isEmbed) continue;
        if (!isMd && !isMedia) continue;

        const nameToMatch = isMd ? file.basename : file.name;
        const lowName = nameToMatch.toLowerCase();

        if (lowName === q) {
          exactList.push(this.formatFileItem(file, isMd, isMedia));
        } else if (lowName.startsWith(q)) {
          startsList.push(this.formatFileItem(file, isMd, isMedia));
        } else if (lowName.includes(q)) {
          containsList.push(this.formatFileItem(file, isMd, isMedia));
        }

        if (exactList.length + startsList.length + containsList.length >= 35) break;
      }
      suggestions = [...exactList, ...startsList, ...containsList].slice(0, 25);
    }

    if (!suggestions.length) {
      this.close();
      return;
    }

    this.items = suggestions;
    this.selectedIndex = 0;
    this.renderPopup(cursor);
  }

  formatFileItem(file, isMd, isMedia) {
    const name = isMd ? file.basename : file.name;
    const parentPath = (file.parent && file.parent.path !== '/') ? `${file.parent.path}/` : '';
    let icon = '📄';
    const ext = file.extension.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) icon = '🖼️';
    else if (ext === 'pdf') icon = '📕';
    else if (['mp3', 'wav', 'm4a'].includes(ext)) icon = '🎵';
    else if (['canvas', 'excalidraw'].includes(ext)) icon = '🎨';
    else if (isMedia) icon = '📎';

    return {
      type: 'file',
      name,
      file,
      label: name,
      sub: parentPath,
      icon,
      isMedia
    };
  }

  renderPopup(cursor) {
    if (!this.popupEl) {
      this.popupEl = document.createElement('div');
      this.popupEl.className = 'pe-floating-suggest';
      document.body.appendChild(this.popupEl);
    }
    this.popupEl.empty();

    const scroll = this.popupEl.createDiv({ cls: 'pe-suggest-scroll' });
    this.items.forEach((item, idx) => {
      const row = scroll.createDiv({ cls: `pe-suggest-item ${idx === this.selectedIndex ? 'is-selected' : ''}` });
      const left = row.createDiv({ cls: 'pe-sug-left' });
      left.createDiv({ cls: 'pe-sug-title', text: item.label });
      if (item.sub) {
        left.createDiv({ cls: 'pe-sug-sub', text: item.sub });
      }
      row.createDiv({ cls: 'pe-sug-badge', text: item.icon });

      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.selectItem(item);
      });
      row.addEventListener('mouseenter', () => {
        this.selectedIndex = idx;
        this.updateHighlight();
      });
    });

    const foot = this.popupEl.createDiv({ cls: 'pe-suggest-footer' });
    foot.setText('Type # to link heading • ↑↓ Navigate • ↵ Insert • Esc Close');

    const coords = getTextareaCaretCoordinates(this.textarea, cursor);
    this.popupEl.style.top = `${coords.top}px`;
    this.popupEl.style.left = `${coords.left}px`;
  }

  updateHighlight() {
    if (!this.popupEl) return;
    const rows = this.popupEl.querySelectorAll('.pe-suggest-item');
    rows.forEach((r, idx) => {
      if (idx === this.selectedIndex) r.addClass('is-selected');
      else r.removeClass('is-selected');
    });
  }

  scrollSelectedIntoView() {
    if (!this.popupEl) return;
    const selected = this.popupEl.querySelector('.pe-suggest-item.is-selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  onKeyDown(e) {
    if (!this.isOpen()) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
      this.updateHighlight();
      this.scrollSelectedIntoView();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
      this.updateHighlight();
      this.scrollSelectedIntoView();
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (this.items[this.selectedIndex]) {
        e.preventDefault();
        e.stopPropagation();
        this.selectItem(this.items[this.selectedIndex]);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
      return;
    }
  }

  selectItem(item) {
    const cursor = this.textarea.selectionStart || 0;
    const text = this.textarea.value;
    const textBefore = text.slice(0, cursor);
    let textAfter = text.slice(cursor);
    if (textAfter.startsWith(']]')) textAfter = textAfter.slice(2);

    const match = textBefore.match(/(?:^|[^\\])(\!?\[\[)([^\]\n]*)$/);
    if (!match) return;

    const bracket = match[1];
    const startIndex = match.index + (match[0].length - match[1].length - match[2].length);
    const inserted = item.type === 'heading'
      ? `${bracket}${item.note}#${item.heading}]]`
      : `${bracket}${item.name}]]`;

    this.textarea.value = text.slice(0, startIndex) + inserted + textAfter;
    const newPos = startIndex + inserted.length;
    this.textarea.setSelectionRange(newPos, newPos);
    this.textarea.dispatchEvent(new Event('input'));
    this.textarea.focus();
    this.close();
  }
}

/* ------------------------------------------------------------------ */
/* Web Link Modal                                                     */
/* ------------------------------------------------------------------ */

class WebLinkModal extends Modal {
  constructor(app, initialText, onSubmit) {
    super(app);
    this.initialText = initialText || '';
    this.onSubmit = onSubmit;
    this.url = '';
    this.title = this.initialText;
  }

  onOpen() {
    this.modalEl.addClass('pe-small-modal');
    this.titleEl.setText('Insert External Link');
    const { contentEl } = this;
    contentEl.empty();

    const uf = contentEl.createDiv({ cls: 'pe-field' });
    uf.createEl('label', { text: 'Link URL' });
    const uIn = uf.createEl('input', { cls: 'pe-input', attr: { placeholder: 'example.com or youtube.com/watch?v=...' } });
    uIn.oninput = () => (this.url = uIn.value);

    const tf = contentEl.createDiv({ cls: 'pe-field' });
    tf.createEl('label', { text: 'Display Title / Alias (Optional)' });
    const tIn = tf.createEl('input', { cls: 'pe-input', attr: { placeholder: 'e.g. Reference Video' } });
    tIn.value = this.title;
    tIn.oninput = () => (this.title = tIn.value);

    const foot = contentEl.createDiv({ cls: 'pe-modal-actions', attr: { style: 'margin-top: 1.25rem;' } });
    const cancel = foot.createEl('button', { cls: 'pe-btn-secondary', text: 'Cancel' });
    cancel.onclick = () => this.close();

    const insertBtn = foot.createEl('button', { cls: 'pe-btn-primary', text: 'Insert Link' });
    insertBtn.onclick = () => {
      let raw = this.url.trim();
      if (!raw) { new Notice('Please provide a URL.'); return; }
      if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
        raw = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? 'mailto:' + raw : 'https://' + raw;
      }
      this.close();
      this.onSubmit(`[${this.title.trim() || raw}](${raw})`);
    };
    setTimeout(() => uIn.focus(), 50);
  }
}

/* ------------------------------------------------------------------ */
/* Deletion Confirmation Modal                                        */
/* ------------------------------------------------------------------ */

class DeleteConfirmModal extends Modal {
  constructor(app, count, onConfirm, topicName = null) {
    super(app);
    this.count = count;
    this.onConfirm = onConfirm;
    this.topicName = topicName;
  }
  onOpen() {
    this.modalEl.addClass('pe-small-modal');
    this.titleEl.setText(this.topicName ? 'Delete Topic Note' : (this.count > 1 ? '⚠️ Confirm Batch Deletion' : 'Confirm Question Deletion'));
    const { contentEl } = this;
    contentEl.empty();

    const warnBox = contentEl.createDiv({ cls: 'pe-alert-box', attr: { style: 'margin-bottom: 1.25rem;' } });
    warnBox.createEl('h4', { text: this.topicName ? '⚠️ Delete Topic File' : (this.count > 1 ? '⚠️ Bulk Permanent Deletion' : '⚠️ Permanent Question Deletion') });
    warnBox.createEl('p', {
      text: this.topicName
        ? `Are you sure you want to permanently delete the topic note "${this.topicName}" from your vault? All contents will be deleted.`
        : `Are you sure you want to permanently delete ${this.count} question${this.count > 1 ? 's' : ''} from your notes? This action cannot be undone.`
    });

    const foot = contentEl.createDiv({ cls: 'pe-modal-actions' });
    const cancel = foot.createEl('button', { cls: 'pe-btn-secondary', text: 'Cancel' });
    cancel.onclick = () => this.close();
    const delBtn = foot.createEl('button', {
      cls: 'pe-btn-danger',
      text: this.topicName ? 'Delete Topic File' : `Delete ${this.count} Card${this.count > 1 ? 's' : ''}`
    });
    delBtn.onclick = () => { this.close(); this.onConfirm(); };
  }
}

/* ------------------------------------------------------------------ */
/* Compact Question Editor Modal (Tags & Native Gallery Integration)  */
/* ------------------------------------------------------------------ */

class QuestionEditorModal extends Modal {
  constructor(app, plugin, cardToEdit = null) {
    super(app);
    this.plugin = plugin;
    this.cardToEdit = cardToEdit;
    this.mode = 'write';
    this.layoutMode = 'split'; // 'split' | 'editor' | 'preview'
    this.isMaximized = false;
    this.debounceTimer = null;
    this.isDraftRestored = false;

    const files = plugin.practiceFiles();
    let topicPath = cardToEdit ? cardToEdit.file.path : (files.length ? files[0].path : '__new__');

    const draft = (!cardToEdit && plugin.settings.cardDraft) ? plugin.settings.cardDraft : null;
    if (draft) this.isDraftRestored = true;

    this.state = {
      topicPath: draft ? (draft.topicPath || topicPath) : topicPath,
      topicName: cardToEdit ? cardToEdit.file.basename : (draft ? draft.topicName : (files.length ? files[0].basename : '')),
      subject: cardToEdit ? ((cardToEdit.subjects && cardToEdit.subjects.join(', ')) || cardToEdit.fm.subject || 'Physics') : (draft ? draft.subject : 'Physics'),
      type: cardToEdit ? cardToEdit.type : (draft ? draft.type : 'Conceptual'),
      difficulty: cardToEdit ? cardToEdit.difficulty : (draft ? draft.difficulty : 'Moderate'),
      tags: cardToEdit ? [...(cardToEdit.tags || [])] : (draft ? [...(draft.tags || [])] : []),
      concepts: cardToEdit ? [...cardToEdit.concepts] : (draft ? [...(draft.concepts || [])] : []),
      question: cardToEdit ? cardToEdit.questionMd : (draft ? draft.question : ''),
      answer: cardToEdit ? cardToEdit.answerMd : (draft ? draft.answer : ''),
      paste: ''
    };
  }

  onOpen() {
    this.modalEl.addClass('pe-modal');
    this.titleEl.setText(this.cardToEdit ? 'Modify Practice Question' : 'Add Practice Questions');

    // Add Maximize toggle button in modal header
    const closeBtn = this.modalEl.querySelector('.modal-close-button');
    if (closeBtn && !this.modalEl.querySelector('.pe-modal-max-btn')) {
      const maxBtn = document.createElement('button');
      maxBtn.className = 'pe-modal-max-btn';
      maxBtn.setAttribute('type', 'button');
      maxBtn.setAttribute('title', 'Toggle Expanded / Fullscreen View');
      maxBtn.textContent = '⛶';
      maxBtn.onclick = () => {
        this.isMaximized = !this.isMaximized;
        if (this.isMaximized) {
          this.modalEl.addClass('is-maximized');
          maxBtn.textContent = '🗗';
        } else {
          this.modalEl.removeClass('is-maximized');
          maxBtn.textContent = '⛶';
        }
      };
      closeBtn.parentElement.insertBefore(maxBtn, closeBtn);
    }
    this.build();
  }

  onClose() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.triggerDraftSave();
    super.onClose();
  }

  build() {
    const root = this.contentEl;
    root.empty();
    const s = this.state;

    // Restored Draft Banner
    if (this.isDraftRestored && !this.cardToEdit) {
      const banner = root.createDiv({ cls: 'pe-draft-banner' });
      const timeInfo = (this.plugin.settings.cardDraft && this.plugin.settings.cardDraft.savedAt)
        ? ` (saved at ${this.plugin.settings.cardDraft.savedAt})`
        : '';
      banner.createSpan({ text: `⚡ Restored unsaved draft from your previous session${timeInfo}.` });

      const bActions = banner.createDiv({ attr: { style: 'display: flex; gap: 0.5rem;' } });
      const discardBtn = bActions.createEl('button', { cls: 'pe-btn-secondary pe-btn-xs', text: 'Discard Draft' });
      discardBtn.onclick = async () => {
        if (!confirm('Are you sure you want to discard your draft? This cannot be undone.')) return;
        this.plugin.settings.cardDraft = null;
        await this.plugin.saveSettings();
        this.isDraftRestored = false;
        const files = this.plugin.practiceFiles();
        this.state = {
          topicPath: files.length ? files[0].path : '__new__',
          topicName: files.length ? files[0].basename : '',
          subject: 'Physics',
          type: 'Conceptual',
          difficulty: 'Moderate',
          tags: [],
          concepts: [],
          question: '',
          answer: '',
          paste: ''
        };
        this.build();
        new Notice('Draft discarded.');
      };
    }

    if (!this.cardToEdit) {
      const seg = root.createDiv({ cls: 'pe-seg pe-seg-header' });
      [['write', 'Side-by-Side Dual Editor'], ['paste', 'Paste from AI']].forEach(([m, lbl]) => {
        const b = seg.createEl('button', { cls: `pe-seg-btn ${this.mode === m ? 'is-active' : ''}`, text: lbl });
        b.onclick = () => { this.mode = m; this.build(); };
      });
    }

    if (this.mode === 'write') {
      // Layout mode switcher bar
      const layoutBar = root.createDiv({ cls: 'pe-layout-mode-bar' });
      layoutBar.createSpan({ text: 'Layout:', cls: 'pe-layout-lbl' });
      const lGroup = layoutBar.createDiv({ cls: 'pe-seg' });
      [
        ['split', '⊞ Split 50/50'],
        ['editor', '◀ Focus Editor (70/30)'],
        ['preview', '▶ Focus Preview (30/70)']
      ].forEach(([mode, label]) => {
        const btn = lGroup.createEl('button', {
          cls: `pe-seg-btn ${this.layoutMode === mode ? 'is-active' : ''}`,
          text: label
        });
        btn.onclick = () => {
          this.layoutMode = mode;
          dualContainer.className = `pe-dual-container layout-${mode}`;
          lGroup.querySelectorAll('.pe-seg-btn').forEach((b) => b.removeClass('is-active'));
          btn.addClass('is-active');
        };
      });

      const dualContainer = root.createDiv({ cls: `pe-dual-container layout-${this.layoutMode}` });
      const editorCol = dualContainer.createDiv({ cls: 'pe-editor-pane' });

      if (!this.cardToEdit) {
        const topField = editorCol.createDiv({ cls: 'pe-field' });
        const topLabelRow = topField.createDiv({ attr: { style: 'display: flex; justify-content: space-between; align-items: center;' } });
        topLabelRow.createEl('label', { text: 'Destination Topic Note' });

        const topicQuickPick = topLabelRow.createEl('select', { cls: 'pe-select-pill pe-btn-xs', attr: { style: 'max-width: 170px;' } });
        topicQuickPick.createEl('option', { text: 'Past Topics ▾', attr: { value: '' } });
        this.plugin.getAllTopics().forEach((top) => {
          topicQuickPick.createEl('option', { text: top, attr: { value: top } });
        });

        const noteInput = topField.createEl('input', {
          cls: 'pe-input',
          attr: { type: 'text', list: 'pe-topics-datalist', placeholder: 'Select past topic or type new note name...' }
        });
        noteInput.value = s.topicName;

        const topicDatalist = topField.createEl('datalist', { attr: { id: 'pe-topics-datalist' } });
        this.plugin.getAllTopics().forEach((top) => {
          topicDatalist.createEl('option', { attr: { value: top } });
        });

        topicQuickPick.onchange = () => {
          if (topicQuickPick.value) {
            noteInput.value = topicQuickPick.value;
            s.topicName = topicQuickPick.value;
            topicQuickPick.value = '';
            noteInput.dispatchEvent(new Event('input'));
          }
        };

        const noteStatus = topField.createDiv({ cls: 'pe-note-status' });
        const updateNoteStatus = () => {
          const tName = (s.topicName || '').trim();
          if (!tName) {
            noteStatus.empty();
            return;
          }
          const found = this.app.vault.getMarkdownFiles().find((f) => f.basename.toLowerCase() === tName.toLowerCase());
          if (found) {
            s.topicPath = found.path;
            noteStatus.setText(`📁 Using existing note: ${found.path}`);
            noteStatus.className = 'pe-note-status is-existing';
          } else {
            s.topicPath = '__new__';
            const folder = this.plugin.folder();
            const targetPath = (folder ? `${folder}/` : '') + `${tName}.md`;
            noteStatus.setText(`✨ Will create new note: ${targetPath}`);
            noteStatus.className = 'pe-note-status is-new';
          }
        };
        updateNoteStatus();

        new VaultNoteSuggest(this.app, noteInput, (sel) => {
          if (sel.isNew) {
            s.topicName = sel.basename;
            s.topicPath = '__new__';
          } else {
            s.topicPath = sel.path;
            s.topicName = sel.basename;
            const cache = this.app.metadataCache.getFileCache(sel);
            if (cache && cache.frontmatter && cache.frontmatter.subject) {
              s.subject = Array.isArray(cache.frontmatter.subject) ? cache.frontmatter.subject.join(', ') : cache.frontmatter.subject;
            }
          }
          updateNoteStatus();
          this.triggerDraftSave();
          this.build();
        });

        noteInput.oninput = () => {
          s.topicName = noteInput.value.trim();
          updateNoteStatus();
          this.triggerDraftSave();
          this.debouncedPreview();
        };

        const subjField = editorCol.createDiv({ cls: 'pe-field' });
        const subjLabelRow = subjField.createDiv({ attr: { style: 'display: flex; justify-content: space-between; align-items: center;' } });
        subjLabelRow.createEl('label', { text: 'Subject(s)' });

        const subjQuickPick = subjLabelRow.createEl('select', { cls: 'pe-select-pill pe-btn-xs', attr: { style: 'max-width: 170px;' } });
        subjQuickPick.createEl('option', { text: 'Past Subjects ▾', attr: { value: '' } });
        this.plugin.getAllSubjects().forEach((sub) => {
          subjQuickPick.createEl('option', { text: sub, attr: { value: sub } });
        });

        const subjInput = subjField.createEl('input', {
          cls: 'pe-input',
          attr: { list: 'pe-subjects-list', placeholder: 'Select past subject or type new...' }
        });
        subjInput.value = s.subject;
        subjInput.oninput = () => { s.subject = subjInput.value; this.triggerDraftSave(); };

        subjQuickPick.onchange = () => {
          if (subjQuickPick.value) {
            subjInput.value = subjQuickPick.value;
            s.subject = subjQuickPick.value;
            subjQuickPick.value = '';
            this.triggerDraftSave();
            this.debouncedPreview();
          }
        };

        const datalist = subjField.createEl('datalist', { attr: { id: 'pe-subjects-list' } });
        this.plugin.getAllSubjects().forEach((sub) => datalist.createEl('option', { attr: { value: sub } }));
      }

      // Cognitive Type & Difficulty
      const metaRow = editorCol.createDiv({ cls: 'pe-form-row' });
      const tDiv = metaRow.createDiv({ cls: 'pe-field', attr: { style: 'flex: 1;' } });
      tDiv.createEl('label', { text: 'Cognitive Type' });
      const typeSel = tDiv.createEl('select', { cls: 'pe-select' });
      COGNITIVE_TYPES.forEach((t) => typeSel.createEl('option', { text: t, attr: { value: t } }));
      typeSel.value = s.type;
      typeSel.onchange = () => { s.type = typeSel.value; this.triggerDraftSave(); this.debouncedPreview(); };

      const dDiv = metaRow.createDiv({ cls: 'pe-field', attr: { style: 'flex: 1;' } });
      dDiv.createEl('label', { text: 'Difficulty Tier' });
      const diffSel = dDiv.createEl('select', { cls: 'pe-select' });
      DIFFICULTY_LEVELS.forEach((d) => diffSel.createEl('option', { text: d, attr: { value: d } }));
      diffSel.value = s.difficulty;
      diffSel.onchange = () => { s.difficulty = diffSel.value; this.triggerDraftSave(); this.debouncedPreview(); };

      // Tags Field
      const tagField = editorCol.createDiv({ cls: 'pe-field' });
      const tagLabelRow = tagField.createDiv({ attr: { style: 'display: flex; justify-content: space-between; align-items: center;' } });
      tagLabelRow.createEl('label', { text: 'Question Tags (e.g. #exam, #formula)' });

      const tagQuickPick = tagLabelRow.createEl('select', { cls: 'pe-select-pill pe-btn-xs', attr: { style: 'max-width: 170px;' } });
      tagQuickPick.createEl('option', { text: 'Past Tags ▾', attr: { value: '' } });
      this.plugin.getAllTags().forEach((tg) => {
        tagQuickPick.createEl('option', { text: `#${tg}`, attr: { value: tg } });
      });
      tagQuickPick.onchange = () => {
        if (tagQuickPick.value && !s.tags.includes(tagQuickPick.value)) {
          s.tags.push(tagQuickPick.value);
          tagQuickPick.value = '';
          this.triggerDraftSave();
          this.build();
        }
      };

      const tagChipBox = tagField.createDiv({ cls: 'pe-chipinput' });
      s.tags.forEach((tag, idx) => {
        const chip = tagChipBox.createSpan({ cls: 'pe-chip-tag', text: `#${tag.replace(/^#/, '')}` });
        const x = chip.createSpan({ cls: 'remove', text: ' ×' });
        x.onclick = () => { s.tags.splice(idx, 1); this.triggerDraftSave(); this.build(); };
      });
      const tagIn = tagChipBox.createEl('input', { attr: { list: 'pe-all-tags-list', placeholder: s.tags.length ? '' : 'Add #tag...' } });
      const tagDatalist = tagField.createEl('datalist', { attr: { id: 'pe-all-tags-list' } });
      this.plugin.getAllTags().forEach((tg) => {
        if (!s.tags.includes(tg)) tagDatalist.createEl('option', { attr: { value: `#${tg}` } });
      });

      const addTag = () => {
        const v = tagIn.value.trim().replace(/^#|,|$/g, '');
        if (v && !s.tags.includes(v)) {
          s.tags.push(v);
          this.triggerDraftSave();
          this.build();
        }
      };
      tagIn.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } };
      tagIn.onchange = () => addTag();

      // Sub-concepts Input
      const cField = editorCol.createDiv({ cls: 'pe-field' });
      const cLabelRow = cField.createDiv({ attr: { style: 'display: flex; justify-content: space-between; align-items: center;' } });
      cLabelRow.createEl('label', { text: 'Sub-concepts' });

      const cQuickPick = cLabelRow.createEl('select', { cls: 'pe-select-pill pe-btn-xs', attr: { style: 'max-width: 170px;' } });
      cQuickPick.createEl('option', { text: 'Past Concepts ▾', attr: { value: '' } });
      this.plugin.getAllConcepts().forEach((con) => {
        cQuickPick.createEl('option', { text: con, attr: { value: con } });
      });
      cQuickPick.onchange = () => {
        if (cQuickPick.value && !s.concepts.includes(cQuickPick.value)) {
          s.concepts.push(cQuickPick.value);
          cQuickPick.value = '';
          this.triggerDraftSave();
          this.build();
        }
      };

      const chipBox = cField.createDiv({ cls: 'pe-chipinput' });
      s.concepts.forEach((c, idx) => {
        const chip = chipBox.createSpan({ cls: 'pe-chip-tag', text: c });
        const x = chip.createSpan({ cls: 'remove', text: ' ×' });
        x.onclick = () => { s.concepts.splice(idx, 1); this.triggerDraftSave(); this.build(); };
      });
      const cIn = chipBox.createEl('input', { attr: { list: 'pe-all-concepts-list', placeholder: s.concepts.length ? '' : 'Add key concept...' } });
      const cDatalist = cField.createEl('datalist', { attr: { id: 'pe-all-concepts-list' } });
      this.plugin.getAllConcepts().forEach((con) => {
        if (!s.concepts.includes(con)) cDatalist.createEl('option', { attr: { value: con } });
      });

      const addConcept = () => {
        const v = cIn.value.trim().replace(/^,|,$/g, '');
        if (v && !s.concepts.includes(v)) {
          s.concepts.push(v);
          this.triggerDraftSave();
          this.build();
        }
      };
      cIn.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addConcept(); } };
      cIn.onchange = () => addConcept();

      // Question Field & Toolbar
      const qField = editorCol.createDiv({ cls: 'pe-field' });
      qField.createEl('label', { text: 'Question' });
      this.buildQuickToolbar(qField, () => qTa);
      const qTa = qField.createEl('textarea', { cls: 'pe-textarea', attr: { rows: 4, placeholder: 'Write your question, add math, cloze, or drop an image...' } });
      qTa.value = s.question;
      this.attachSmartBracketPair(qTa);
      this.attachSmartMathTyping(qTa);
      this.attachDragAndPasteSupport(qTa);
      new TextareaLinkAutocompleter(this.app, qTa);
      qTa.oninput = () => { s.question = qTa.value; this.triggerDraftSave(); this.debouncedPreview(); };

      // Answer Field & Toolbar
      const aField = editorCol.createDiv({ cls: 'pe-field' });
      aField.createEl('label', { text: 'Model Answer' });
      this.buildQuickToolbar(aField, () => aTa);
      const aTa = aField.createEl('textarea', { cls: 'pe-textarea', attr: { rows: 5, placeholder: 'Write model answer, derivations, or step-by-step solution...' } });
      aTa.value = s.answer;
      this.attachSmartBracketPair(aTa);
      this.attachSmartMathTyping(aTa);
      this.attachDragAndPasteSupport(aTa);
      new TextareaLinkAutocompleter(this.app, aTa);
      aTa.oninput = () => { s.answer = aTa.value; this.triggerDraftSave(); this.debouncedPreview(); };

      // Modal Actions
      const foot = editorCol.createDiv({ cls: 'pe-modal-actions', attr: { style: 'margin-top: 1rem;' } });
      const cancelBtn = foot.createEl('button', { cls: 'pe-btn-secondary', text: 'Cancel' });
      cancelBtn.onclick = () => this.close();

      const saveDraftBtn = foot.createEl('button', {
        cls: 'pe-btn-secondary',
        text: '💾 Save Draft',
        attr: { title: 'Save current draft without closing' }
      });
      saveDraftBtn.onclick = () => {
        this.triggerDraftSave();
        new Notice('Draft saved successfully! You can resume anytime.');
      };

      const saveBtn = foot.createEl('button', { cls: 'pe-btn-primary', text: this.cardToEdit ? 'Save Changes' : 'Save Question' });
      saveBtn.onclick = () => this.saveWriteCard();

      // Live Render Preview Pane
      const previewPane = dualContainer.createDiv({ cls: 'pe-preview-pane' });
      const pHeader = previewPane.createDiv({ cls: 'pe-preview-header-bar' });
      pHeader.createSpan({ text: 'Live Preview (LaTeX, Cloze & Masking Tape Active)' });
      const refreshBtn = pHeader.createEl('button', { cls: 'pe-btn-secondary pe-btn-sm', text: 'Refresh' });
      refreshBtn.onclick = () => this.updateLivePreview();

      this.previewEl = previewPane.createDiv({ cls: 'pe-preview-scroll-body' });
      this.setupPreviewLinks();
      this.updateLivePreview();
    } else {
      // Paste from AI
      const pField = root.createDiv({ cls: 'pe-field' });
      pField.createEl('label', { text: 'Paste AI Generated Output' });
      const pTa = pField.createEl('textarea', { cls: 'pe-textarea', attr: { rows: 12, placeholder: 'Topic: ...\nQ: ...\nA: ...' } });
      pTa.value = s.paste;
      pTa.oninput = () => (s.paste = pTa.value);

      const foot = root.createDiv({ cls: 'pe-modal-actions', attr: { style: 'margin-top: 1.25rem;' } });
      const copyBtn = foot.createEl('button', { cls: 'pe-btn-secondary', text: 'Copy AI Prompt' });
      copyBtn.onclick = () => this.plugin.copyAiPrompt();

      const impBtn = foot.createEl('button', { cls: 'pe-btn-primary', text: 'Extract & Save Cards' });
      impBtn.onclick = () => this.saveImportCards();
    }
  }

  buildQuickToolbar(parentEl, getTa) {
    const bar = parentEl.createDiv({ cls: 'pe-quick-toolbar' });

    // 1. Attach Media (Native reliable gallery with safe aspect constraints)
    const mediaBtn = bar.createEl('button', {
      cls: 'pe-tool-pill',
      text: '🖼️ Media',
      attr: { title: 'Attach image/audio via Practice Engine Gallery', type: 'button' }
    });
    mediaBtn.onclick = (e) => {
      e.preventDefault();
      new MediaGalleryModal(this.app, this.plugin, (embedTag) => {
        this.insertAtCursor(getTa(), embedTag, '');
      }).open();
    };

    // 2. Math Formula (LaTeX Toolbox Bridge or Native Math Modal)
    const mathBtn = bar.createEl('button', {
      cls: 'pe-tool-pill',
      text: '➗ Math ($)',
      attr: { title: 'Insert LaTeX equation via STEM LaTeX Toolbox or Formula Editor', type: 'button' }
    });
    mathBtn.onclick = (e) => {
      e.preventDefault();
      const ta = getTa();
      const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      const lt = this.plugin.getLatexToolbox();
      if (this.plugin.settings.enableLatexToolboxBridge && lt && typeof lt.openBuilder === 'function') {
        lt.openBuilder(selected);
      } else {
        new MathInputModal(this.app, this.plugin, selected, (formattedMath) => {
          this.insertAtCursor(ta, formattedMath, '');
        }).open();
      }
    };

    // 3. Natural Math Engine Converter with Presets & Autocomplete
    if (this.plugin.settings.enableNaturalMathEngine) {
      const nmBtn = bar.createEl('button', {
        cls: 'pe-tool-pill',
        text: '⚡ Natural Math',
        attr: { title: 'Convert Wolfram/MATLAB math (e.g. diff, int, [1 2; 3 4], dx) to LaTeX', type: 'button' }
      });
      nmBtn.onclick = (e) => {
        e.preventDefault();
        const ta = getTa();
        const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        if (selected.trim()) {
          const converted = convertNaturalMathToLatex(selected);
          this.insertAtCursor(ta, `$${converted}$`, '');
          new Notice('Converted natural math to LaTeX!');
        } else {
          new NaturalMathPromptModal(this.app, this.plugin, '', (res) => {
            this.insertAtCursor(ta, res, '');
          }).open();
        }
      };
    }

    // 4. Cloze Deletion
    const clozeBtn = bar.createEl('button', {
      cls: 'pe-tool-pill',
      text: '[...] Cloze',
      attr: { title: 'Wrap selected text in a Cloze Deletion (==text==)', type: 'button' }
    });
    clozeBtn.onclick = (e) => {
      e.preventDefault();
      const ta = getTa();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const sel = ta.value.slice(start, end);
      const rep = sel ? `==${sel}==` : '==cloze text==';
      this.insertAtCursor(ta, rep, '');
    };

    // 5. Masking Tape (Image & Text Occlusion)
    const tapeBtn = bar.createEl('button', {
      cls: 'pe-tool-pill',
      text: '🩹 Masking Tape',
      attr: { title: 'Add peelable Masking Tape over text or image (==tape::text==)', type: 'button' }
    });
    tapeBtn.onclick = (e) => {
      e.preventDefault();
      const ta = getTa();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const sel = ta.value.slice(start, end);
      if (sel) {
        this.insertAtCursor(ta, `==tape::${sel}==`, '');
      } else {
        this.insertAtCursor(ta, '==tape::hidden answer or concept==', '');
      }
    };

    // 6. Embed Note & Link Note
    const embedBtn = bar.createEl('button', {
      cls: 'pe-tool-pill',
      text: '📎 Embed Note',
      attr: { title: 'Embed note section transclusion', type: 'button' }
    });
    embedBtn.onclick = (e) => {
      e.preventDefault();
      new VaultLinkPickerModal(this.app, true, (embedTag) => {
        this.insertAtCursor(getTa(), embedTag, '');
      }).open();
    };

    const linkBtn = bar.createEl('button', {
      cls: 'pe-tool-pill',
      text: '🔗 Link Note',
      attr: { title: 'Link note or heading', type: 'button' }
    });
    linkBtn.onclick = (e) => {
      e.preventDefault();
      new VaultLinkPickerModal(this.app, false, (linkTag) => {
        this.insertAtCursor(getTa(), linkTag, '');
      }).open();
    };

    // 7. Web Link
    const webBtn = bar.createEl('button', {
      cls: 'pe-tool-pill',
      text: '🌐 Web Link',
      attr: { title: 'Insert web link with alias', type: 'button' }
    });
    webBtn.onclick = (e) => {
      e.preventDefault();
      const ta = getTa();
      const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      new WebLinkModal(this.app, selected, (link) => this.insertAtCursor(ta, link, '')).open();
    };
  }

  insertAtCursor(ta, before, after = '') {
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = ta.value;
    const selected = val.slice(start, end);
    const replacement = before + (selected || '') + after;
    ta.value = val.slice(0, start) + replacement + val.slice(end);
    const cursor = start + before.length + (selected ? selected.length : 0);
    ta.setSelectionRange(cursor, cursor);
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }

  attachSmartBracketPair(ta) {
    ta.addEventListener('keydown', (e) => {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;

      if (e.key === '[') {
        e.preventDefault();
        if (start !== end) {
          ta.value = val.slice(0, start) + `[${val.slice(start, end)}]` + val.slice(end);
          ta.setSelectionRange(start + 1, end + 1);
        } else if (start > 0 && val[start - 1] === '[' && val[start] === ']') {
          ta.value = val.slice(0, start) + '[]' + val.slice(start);
          ta.setSelectionRange(start + 1, start + 1);
        } else {
          ta.value = val.slice(0, start) + '[]' + val.slice(start);
          ta.setSelectionRange(start + 1, start + 1);
        }
        ta.dispatchEvent(new Event('input'));
        return;
      }

      if (e.key === 'Backspace' && start === end) {
        if (start >= 1 && val[start - 1] === '[' && val[start] === ']') {
          e.preventDefault();
          ta.value = val.slice(0, start - 1) + val.slice(start + 1);
          ta.setSelectionRange(start - 1, start - 1);
          ta.dispatchEvent(new Event('input'));
          return;
        }
        if (start >= 2 && val.slice(start - 2, start + 2) === '[[]]') {
          e.preventDefault();
          ta.value = val.slice(0, start - 1) + val.slice(start + 1);
          ta.setSelectionRange(start - 1, start - 1);
          ta.dispatchEvent(new Event('input'));
          return;
        }
      }
    });
  }

  attachSmartMathTyping(ta) {
    if (!this.plugin.settings.enableSmartMathTyping) return;

    ta.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;

      if (e.key === '_' || e.key === '^') {
        const nextChar = val[end];
        if (nextChar !== '{') {
          e.preventDefault();
          const prefix = e.key;
          const sel = val.slice(start, end);
          const rep = `${prefix}{${sel}}`;
          ta.value = val.slice(0, start) + rep + val.slice(end);
          const newPos = sel.length > 0 ? start + rep.length : start + 2;
          ta.setSelectionRange(newPos, newPos);
          ta.dispatchEvent(new Event('input'));
        }
      }
    });
  }

  attachDragAndPasteSupport(ta) {
    ta.addEventListener('dragover', (e) => { e.preventDefault(); ta.addClass('pe-drag-over'); });
    ta.addEventListener('dragleave', () => ta.removeClass('pe-drag-over'));

    ta.addEventListener('drop', async (e) => {
      e.preventDefault();
      ta.removeClass('pe-drag-over');

      const textData = e.dataTransfer.getData('text/plain');
      if (textData) {
        const clean = textData.trim().replace(/^\[\[|\]\]$/g, '');
        const file = this.app.metadataCache.getFirstLinkpathDest(clean, '') ||
                     this.app.vault.getFiles().find((f) => f.name === clean || f.basename === clean);
        if (file) {
          const isMedia = !['md'].includes(file.extension.toLowerCase());
          this.insertAtCursor(ta, isMedia ? `![[${file.name}]]` : `[[${file.basename}]]`, '');
          return;
        }
      }

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const arrayBuffer = await file.arrayBuffer();
          const savedName = await this.plugin.saveAttachmentToTopicFolder(this.state.topicPath, arrayBuffer, file.name);
          this.insertAtCursor(ta, `![[${savedName}]]`, '');
        }
      }
    });

    ta.addEventListener('paste', async (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      for (const item of items) {
        if (item.type.indexOf('image') === 0) {
          e.preventDefault();
          const blob = item.getAsFile();
          const arrayBuffer = await blob.arrayBuffer();
          const savedName = await this.plugin.saveAttachmentToTopicFolder(this.state.topicPath, arrayBuffer, 'Pasted_Image.png');
          this.insertAtCursor(ta, `![[${savedName}]]`, '');
          new Notice('Image saved into topic attachments folder.');
        }
      }
    });
  }

  triggerDraftSave() {
    if (this.cardToEdit) return;
    this.plugin.settings.cardDraft = {
      topicPath: this.state.topicPath,
      topicName: this.state.topicName,
      subject: this.state.subject,
      type: this.state.type,
      difficulty: this.state.difficulty,
      tags: this.state.tags,
      concepts: this.state.concepts,
      question: this.state.question,
      answer: this.state.answer
    };
    this.plugin.saveSettings();
  }

  debouncedPreview() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.updateLivePreview(), 180);
  }

  setupPreviewLinks() {
    if (!this.previewEl) return;
    this.previewEl.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      const href = link.getAttribute('href') || link.getAttribute('data-href');
      if (!href) return;
      if (link.classList.contains('internal-link')) {
        this.app.workspace.openLinkText(href, this.getTargetPath(), false);
      } else {
        if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
          window.open(href, '_blank');
        } else {
          new Notice('Blocked potentially unsafe link protocol.');
        }
      }
    });
  }

  getTargetPath() {
    if (this.cardToEdit && this.cardToEdit.file) return this.cardToEdit.file.path;
    if (this.state.topicPath && this.state.topicPath !== '__new__') return this.state.topicPath;
    const files = this.plugin.practiceFiles();
    return files.length ? files[0].path : '';
  }

  async updateLivePreview() {
    if (!this.previewEl) return;
    this.previewEl.empty();
    const s = this.state;
    const parts = [];
    if (s.type) parts.push(`Type:: ${s.type}`);
    if (s.difficulty) parts.push(`Difficulty:: ${s.difficulty}`);
    if (s.subject) parts.push(`Subjects:: ${s.subject}`);
    if (s.tags && s.tags.length) parts.push(`Tags:: ${s.tags.map(t => '#' + t.replace(/^#/, '')).join(', ')}`);
    if (s.concepts && s.concepts.length) parts.push(`Concepts:: ${s.concepts.join(', ')}`);

    const qProcessed = processClozeAndTapeMarkdown(s.question || '*(Type a question on the left to preview...)*', false);
    const aProcessed = processClozeAndTapeMarkdown(s.answer || '*(Type a model answer or embed note on the left...)*', false);

    const previewLines = [`> [!question] ${parts.join(' | ')}`];
    qProcessed.replace(/\r/g, '').trim().split('\n').forEach((l) => previewLines.push(`> ${l}`));
    previewLines.push('>');
    previewLines.push('> > [!answer]');
    aProcessed.replace(/\r/g, '').trim().split('\n').forEach((l) => previewLines.push(`> > ${l}`));

    await MarkdownRenderer.render(this.app, previewLines.join('\n'), this.previewEl, this.getTargetPath(), this.plugin);
    attachInteractiveTapeAndClozeListeners(this.previewEl);
  }

  async saveWriteCard() {
    const s = this.state;
    if (!s.question.trim()) { new Notice('Please write a question.'); return; }

    try {
      const subjects = s.subject.split(',').map((x) => x.trim()).filter(Boolean);
      if (this.cardToEdit) {
        await this.plugin.updateCardContent(this.cardToEdit, {
          type: s.type,
          difficulty: s.difficulty,
          subjects,
          tags: s.tags,
          concepts: s.concepts,
          question: s.question,
          answer: s.answer
        });
        new Notice('Question updated successfully.');
      } else {
        const topicName = (s.topicName || 'General Practice').trim();
        await this.plugin.addCards(
          { topicPath: s.topicPath, newTopic: topicName, subjects },
          [{ type: s.type, difficulty: s.difficulty, subjects, tags: s.tags, concepts: s.concepts, question: s.question, answer: s.answer }]
        );
        this.plugin.settings.cardDraft = null;
        await this.plugin.saveSettings();
      }
      this.close();
    } catch (e) {
      console.error('[Practice Engine] Save error:', e);
      new Notice('Failed to save card: ' + e.message);
    }
  }

  async saveImportCards() {
    const parsed = parseImport(this.state.paste);
    if (!parsed.cards.length) { new Notice('No cards detected in pasted text.'); return; }
    try {
      const topicName = (parsed.topic || this.state.topicName || 'General Practice').trim();
      const subjects = (parsed.subject || this.state.subject || 'General').split(',').map((s) => s.trim()).filter(Boolean);
      await this.plugin.addCards(
        { topicPath: this.state.topicPath, newTopic: topicName, subjects },
        parsed.cards
      );
      this.plugin.settings.cardDraft = null;
      await this.plugin.saveSettings();
      this.close();
    } catch (e) {
      console.error('[Practice Engine] Import error:', e);
      new Notice('Failed to import cards: ' + e.message);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Main Practice View (Study Queue, Card Browser, Dynamic Heatmap)    */
/* ------------------------------------------------------------------ */

class PracticeView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentTab = 'study';
    this.sessionActive = false;
    this.queue = [];
    this.allCards = [];
    this.pos = 0;
    this.stage = 'question';
    this.effort = null;
    this.checkedConcepts = new Set();
    this.selectedKeys = new Set();
    this.lastClickedRowIdx = -1;

    this.filterSubject = 'ALL';
    this.filterTopic = 'ALL';
    this.filterTag = 'ALL';
    this.filterMode = 'DUE';
    this.searchQuery = '';
    this.heatmapRange = '365'; // '30' | '90' | '180' | '365'
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Practice Engine'; }
  getIcon() { return 'brain'; }

  async onOpen() {
    this.contentEl.addClass('pe-root');
    this.contentEl.tabIndex = 0;
    this.registerDomEvent(this.contentEl, 'keydown', (e) => this.onKey(e));
    await this.refreshData();
  }

  async refreshData() {
    this.allCards = await this.plugin.collectAllCards();
    this.selectedKeys.clear();
    this.buildQueue();
    this.render();
  }

  buildQueue() {
    const today = todayStr();
    let list = this.allCards.slice();

    if (this.filterSubject !== 'ALL') {
      list = list.filter((c) => {
        if (c.subjects && c.subjects.length) return c.subjects.includes(this.filterSubject);
        if (c.fm && c.fm.subject) {
          return Array.isArray(c.fm.subject) ? c.fm.subject.includes(this.filterSubject) : c.fm.subject === this.filterSubject;
        }
        return false;
      });
    }

    if (this.filterTag !== 'ALL') {
      list = list.filter((c) => c.tags && c.tags.includes(this.filterTag));
    }

    if (this.filterTopic !== 'ALL') {
      list = list.filter((c) => c.file.path === this.filterTopic);
    }

    if (this.filterMode === 'DUE') {
      list = list.filter((c) => c.meta.due <= today);
    } else if (this.filterMode === 'STRUGGLING') {
      list = list.filter((c) => (c.meta.d && c.meta.d >= 6.5) || c.meta.diff >= 3.3 || c.meta.lapses > 0);
    }

    list.sort((a, b) => (a.meta.due < b.meta.due ? -1 : 1));
    this.queue = list;
    this.pos = 0;
    this.stage = 'question';
    this.effort = null;
    this.checkedConcepts.clear();
  }

  render() {
    const root = this.contentEl;
    root.empty();

    const top = root.createDiv({ cls: 'pe-view-header' });
    const brand = top.createDiv({ cls: 'pe-brand-title' });
    setIcon(brand.createSpan(), 'brain');
    brand.createSpan({ text: 'Practice Engine' });

    const seg = top.createDiv({ cls: 'pe-seg' });
    [['study', 'Study Queue'], ['browser', 'Card Browser'], ['analytics', 'Analytics & Reports']].forEach(([tabId, label]) => {
      const b = seg.createEl('button', { cls: `pe-seg-btn ${this.currentTab === tabId ? 'is-active' : ''}`, text: label });
      b.onclick = () => { this.currentTab = tabId; this.sessionActive = false; this.render(); };
    });

    const topActions = top.createDiv({ attr: { style: 'display: flex; gap: 0.5rem;' } });
    const addBtn = topActions.createEl('button', { cls: 'pe-btn-primary', text: '+ Add Question' });
    addBtn.onclick = () => this.plugin.openAddQuestion();

    if (this.currentTab === 'study') {
      if (this.sessionActive) this.renderActiveTesting(root);
      else this.renderStudyDashboard(root);
    } else if (this.currentTab === 'browser') {
      this.renderCardBrowser(root);
    } else {
      this.renderAnalyticsReport(root);
    }
  }

  renderStudyDashboard(root) {
    const bar = root.createDiv({ cls: 'pe-filter-bar' });

    const subjects = ['ALL', ...this.plugin.getAllSubjects()];
    const sSel = bar.createEl('select', { cls: 'pe-select-pill' });
    subjects.forEach((s) => sSel.createEl('option', { text: s === 'ALL' ? 'All Subjects' : s, attr: { value: s } }));
    sSel.value = this.filterSubject;
    sSel.onchange = () => { this.filterSubject = sSel.value; this.buildQueue(); this.render(); };

    const tags = ['ALL', ...this.plugin.getAllTags()];
    if (tags.length > 1) {
      const tagSel = bar.createEl('select', { cls: 'pe-select-pill' });
      tags.forEach((t) => tagSel.createEl('option', { text: t === 'ALL' ? 'All Tags' : `#${t}`, attr: { value: t } }));
      tagSel.value = this.filterTag;
      tagSel.onchange = () => { this.filterTag = tagSel.value; this.buildQueue(); this.render(); };
    }

    const files = this.plugin.practiceFiles();
    const cardCountsByPath = {};
    this.allCards.forEach((c) => {
      cardCountsByPath[c.file.path] = (cardCountsByPath[c.file.path] || 0) + 1;
    });

    const emptyTopicFiles = files.filter((f) => (cardCountsByPath[f.path] || 0) === 0);

    const tSel = bar.createEl('select', { cls: 'pe-select-pill' });
    tSel.createEl('option', { text: 'All Topic Notes', attr: { value: 'ALL' } });
    files.forEach((f) => {
      const cnt = cardCountsByPath[f.path] || 0;
      tSel.createEl('option', {
        text: cnt > 0 ? `${f.basename} (${cnt})` : `${f.basename} (0 cards - empty)`,
        attr: { value: f.path }
      });
    });
    tSel.value = this.filterTopic;
    tSel.onchange = () => { this.filterTopic = tSel.value; this.buildQueue(); this.render(); };

    // Action button to delete selected topic note
    if (this.filterTopic !== 'ALL') {
      const selectedFile = this.app.vault.getAbstractFileByPath(this.filterTopic);
      if (selectedFile) {
        const cnt = cardCountsByPath[selectedFile.path] || 0;
        const delTopicBtn = bar.createEl('button', {
          cls: 'pe-btn-danger pe-btn-sm',
          text: `🗑️ Delete "${selectedFile.basename}"`,
          attr: { title: `Permanently delete topic note ${selectedFile.basename} from vault` }
        });
        delTopicBtn.onclick = () => {
          new DeleteConfirmModal(this.app, cnt, async () => {
            await this.app.vault.delete(selectedFile);
            this.filterTopic = 'ALL';
            new Notice(`Topic note "${selectedFile.basename}" deleted.`);
            this.refreshAllViews();
          }, selectedFile.basename).open();
        };
      }
    }

    // Action button to clean empty topic notes
    if (emptyTopicFiles.length > 0) {
      const cleanBtn = bar.createEl('button', {
        cls: 'pe-btn-secondary pe-btn-sm',
        text: `🧹 Clean ${emptyTopicFiles.length} Empty Topic${emptyTopicFiles.length > 1 ? 's' : ''}`,
        attr: { title: 'Delete topic notes with 0 practice questions' }
      });
      cleanBtn.onclick = () => {
        const names = emptyTopicFiles.map((f) => f.basename).join(', ');
        new DeleteConfirmModal(this.app, emptyTopicFiles.length, async () => {
          for (const f of emptyTopicFiles) {
            await this.app.vault.delete(f);
          }
          this.filterTopic = 'ALL';
          new Notice(`Removed ${emptyTopicFiles.length} empty topic note(s).`);
          this.refreshAllViews();
        }, `Empty Topics (${names})`).open();
      };
    }

    const mSel = bar.createEl('select', { cls: 'pe-select-pill' });
    mSel.createEl('option', { text: 'Due Questions Only', attr: { value: 'DUE' } });
    mSel.createEl('option', { text: 'Struggling Cards', attr: { value: 'STRUGGLING' } });
    mSel.createEl('option', { text: 'Cram All Cards', attr: { value: 'ALL' } });
    mSel.value = this.filterMode;
    mSel.onchange = () => { this.filterMode = mSel.value; this.buildQueue(); this.render(); };

    const today = todayStr();
    const dueCount = this.allCards.filter((c) => c.meta.due <= today).length;
    const struggleCount = this.allCards.filter((c) => (c.meta.d && c.meta.d >= 6.5) || c.meta.diff >= 3.3 || c.meta.lapses > 0).length;

    const dash = root.createDiv({ cls: 'pe-dashboard' });
    dash.createEl('h2', { text: 'Active Recall Workstation' });
    dash.createEl('p', {
      cls: 'pe-dashboard-subtitle',
      text: `Two-stage metacognitive review running on ${this.plugin.settings.schedulerMode.toUpperCase()} scheduling.`
    });

    const statRow = dash.createDiv({ cls: 'pe-stats-row' });
    const s1 = statRow.createDiv({ cls: 'pe-stat-card' });
    s1.createDiv({ cls: 'pe-stat-val', text: String(dueCount) });
    s1.createDiv({ cls: 'pe-stat-lbl', text: 'Due Today' });

    const s2 = statRow.createDiv({ cls: 'pe-stat-card' });
    s2.createDiv({ cls: 'pe-stat-val', text: String(struggleCount) });
    s2.createDiv({ cls: 'pe-stat-lbl', text: 'Struggling' });

    const s3 = statRow.createDiv({ cls: 'pe-stat-card' });
    s3.createDiv({ cls: 'pe-stat-val', text: String(this.queue.length) });
    s3.createDiv({ cls: 'pe-stat-lbl', text: 'Ready in Queue' });

    const startBtn = dash.createEl('button', { cls: 'pe-btn-primary pe-start-btn', text: `▶ Start Testing (${this.queue.length} cards)` });
    startBtn.disabled = this.queue.length === 0;
    startBtn.onclick = () => {
      this.sessionActive = true;
      this.pos = 0;
      this.stage = 'question';
      this.render();
      setTimeout(() => this.contentEl.focus(), 50);
    };

    if (this.queue.length === 0) {
      dash.createEl('p', { cls: 'pe-done-note', text: 'No questions currently matching this filter. Switch to "Cram All Cards" or add new questions to begin.' });
    }
  }

  async renderActiveTesting(root) {
    if (!this.queue.length || this.pos >= this.queue.length) {
      const done = root.createDiv({ cls: 'pe-dashboard' });
      done.createEl('h2', { text: '🎉 Testing Complete!' });
      done.createEl('p', { text: `You completed all ${this.queue.length} cards in this review run.` });
      const returnBtn = done.createEl('button', { cls: 'pe-btn-primary', text: 'Back to Dashboard' });
      returnBtn.onclick = () => { this.sessionActive = false; this.refreshData(); };
      return;
    }

    const card = this.queue[this.pos];
    const testHeader = root.createDiv({ cls: 'pe-test-header' });
    const subjTitle = (card.subjects && card.subjects.length) ? card.subjects.join(', ') : (card.fm.subject || 'General');
    testHeader.createSpan({ cls: 'pe-card-title', text: `${card.file.basename} · ${subjTitle}` });

    const topActions = testHeader.createDiv({ attr: { style: 'display: flex; gap: 0.5rem; align-items: center;' } });

    const tapeToggleBtn = topActions.createEl('button', {
      cls: 'pe-btn-secondary pe-btn-sm',
      text: '🩹 Toggle Tapes (T)',
      attr: { title: 'Peel or unpeel all masking tapes on this card' }
    });
    tapeToggleBtn.onclick = () => this.toggleAllMaskingTapes();

    const editBtn = topActions.createEl('button', { cls: 'pe-btn-secondary pe-btn-sm', text: 'Edit Card' });
    editBtn.onclick = () => new QuestionEditorModal(this.app, this.plugin, card).open();

    const endBtn = topActions.createEl('button', { cls: 'pe-btn-secondary pe-btn-sm' });
    endBtn.createSpan({ text: 'Exit' });
    endBtn.createSpan({ cls: 'pe-esc-kbd', text: 'Esc' });
    endBtn.onclick = () => { this.sessionActive = false; this.render(); };

    const track = root.createDiv({ cls: 'pe-progress-track' });
    track.createDiv({ cls: 'pe-progress-fill', attr: { style: `width: ${((this.pos + 1) / this.queue.length) * 100}%` } });

    const cardEl = root.createDiv({ cls: 'pe-card' });
    const chips = cardEl.createDiv({ cls: 'pe-chips' });
    chips.createSpan({ cls: 'pe-chip pe-chip-accent', text: card.type });
    chips.createSpan({ cls: 'pe-chip', text: `Difficulty: ${card.difficulty}` });
    if (card.tags && card.tags.length) {
      card.tags.forEach(tg => chips.createSpan({ cls: 'pe-chip pe-card-tag', text: `#${tg}` }));
    }
    if (card.meta.s) chips.createSpan({ cls: 'pe-chip', text: `Stability: ${card.meta.s.toFixed(1)}d` });
    chips.createSpan({ cls: 'pe-chip', text: `Card ${this.pos + 1} of ${this.queue.length}` });

    const qBox = cardEl.createDiv({ cls: 'pe-question' });
    const qProcessed = processClozeAndTapeMarkdown(card.questionMd, this.stage === 'answer');
    await MarkdownRenderer.render(this.app, qProcessed, qBox, card.file.path, this.plugin);
    attachInteractiveTapeAndClozeListeners(qBox);

    if (this.stage === 'question') {
      const s1 = cardEl.createDiv({ cls: 'pe-stage-box' });
      s1.createDiv({ cls: 'pe-stage-label', text: 'Stage 1: How did your retrieval process feel? (Keys 1 - 6 or Space)' });
      const grid = s1.createDiv({ cls: 'pe-btn-grid' });
      RETRIEVAL_EFFORTS.forEach((e, idx) => {
        const btn = grid.createEl('button', { cls: `pe-choice-btn ${e.css}` });
        btn.createSpan({ cls: 'pe-choice-key', text: String(idx + 1) });
        const textWrap = btn.createDiv({ cls: 'pe-choice-textwrap' });
        textWrap.createSpan({ cls: 'pe-choice-label', text: e.label });
        textWrap.createSpan({ cls: 'pe-choice-hint', text: e.hint });
        btn.onclick = () => { this.effort = e.id; this.stage = 'answer'; this.render(); };
      });

      const btm = cardEl.createDiv({ cls: 'pe-anki-controls' });
      const skipBtn = btm.createEl('button', { cls: 'pe-btn-secondary', text: 'Skip Card (→)' });
      skipBtn.onclick = () => this.advanceCard();
    } else {
      const aBox = cardEl.createDiv({ cls: 'pe-answer' });
      const aProcessed = processClozeAndTapeMarkdown(card.answerMd, true);
      await MarkdownRenderer.render(this.app, aProcessed, aBox, card.file.path, this.plugin);
      attachInteractiveTapeAndClozeListeners(aBox);

      if (card.concepts.length) {
        const checkWrap = cardEl.createDiv({ cls: 'pe-checklist' });
        checkWrap.createDiv({ cls: 'pe-stage-label', text: 'Sub-concepts accurately retrieved:' });
        card.concepts.forEach((c) => {
          const row = checkWrap.createEl('label', { cls: 'pe-check-row' });
          const cb = row.createEl('input', { attr: { type: 'checkbox' } });
          cb.checked = this.checkedConcepts.has(c);
          cb.onchange = () => {
            if (cb.checked) this.checkedConcepts.add(c);
            else this.checkedConcepts.delete(c);
          };
          row.createSpan({ text: c });
        });
      }

      const s2 = cardEl.createDiv({ cls: 'pe-stage-box' });
      s2.createDiv({ cls: 'pe-stage-label', text: 'Stage 2: Evaluate Accuracy Outcome (Keys 1 - 5)' });
      const grid = s2.createDiv({ cls: 'pe-btn-grid' });
      ACCURACY_DIAGNOSTICS.forEach((a, idx) => {
        const btn = grid.createEl('button', { cls: `pe-choice-btn ${a.css}` });
        btn.createSpan({ cls: 'pe-choice-key', text: String(idx + 1) });
        const textWrap = btn.createDiv({ cls: 'pe-choice-textwrap' });
        textWrap.createSpan({ cls: 'pe-choice-label', text: a.label });
        textWrap.createSpan({ cls: 'pe-choice-hint', text: a.hint });
        btn.onclick = async () => { await this.submitReview(card, this.effort, a.id); };
      });
    }
  }

  toggleAllMaskingTapes() {
    const tapes = this.contentEl.querySelectorAll('.pe-masking-tape, .pe-occlusion-tape');
    if (!tapes.length) return;
    const anyMasked = Array.from(tapes).some((t) => !t.classList.contains('is-peeled'));
    tapes.forEach((t) => {
      if (anyMasked) {
        t.classList.add('is-peeled');
        t.setAttribute('data-state', 'peeled');
      } else {
        t.classList.remove('is-peeled');
        t.setAttribute('data-state', 'masked');
      }
    });
  }

  advanceCard() {
    this.pos++;
    this.stage = 'question';
    this.effort = null;
    this.checkedConcepts.clear();
    this.render();
    setTimeout(() => this.contentEl.focus(), 50);
  }

  async submitReview(card, effortId, accuracyId) {
    const updatedMeta = calculateNextReview(card.meta, effortId, accuracyId, todayStr(), this.plugin.settings);
    await this.plugin.writeCardMetadata(card, updatedMeta);
    this.advanceCard();
  }

  /* ------------------------------------------------------------------ */
  /* Card Browser with Shift+Click & Batch Selection                    */
  /* ------------------------------------------------------------------ */

  renderCardBrowser(root) {
    const bar = root.createDiv({ cls: 'pe-search-bar-wrap' });
    const sInput = bar.createEl('input', {
      cls: 'pe-search-input-pill',
      attr: { type: 'text', placeholder: '🔍 Search questions, answers, #tags, concepts, or subjects...' }
    });
    sInput.value = this.searchQuery;
    sInput.oninput = () => {
      this.searchQuery = sInput.value.toLowerCase();
      this.renderTable(body);
    };

    const toolbar = root.createDiv({ cls: 'pe-browser-toolbar' });
    const selectControls = toolbar.createDiv({ cls: 'pe-select-btn-group' });

    selectControls.createEl('button', { cls: 'pe-btn-secondary pe-btn-sm', text: 'Select All' }).onclick = () => {
      this.getFilteredCards().forEach((c) => this.selectedKeys.add(c.key));
      this.renderTable(body);
      this.updateSelectionBar(selectBar);
    };

    selectControls.createEl('button', { cls: 'pe-btn-secondary pe-btn-sm', text: 'Select None' }).onclick = () => {
      this.selectedKeys.clear();
      this.renderTable(body);
      this.updateSelectionBar(selectBar);
    };

    selectControls.createEl('button', { cls: 'pe-btn-secondary pe-btn-sm', text: 'Invert Selection' }).onclick = () => {
      this.getFilteredCards().forEach((c) => {
        if (this.selectedKeys.has(c.key)) this.selectedKeys.delete(c.key);
        else this.selectedKeys.add(c.key);
      });
      this.renderTable(body);
      this.updateSelectionBar(selectBar);
    };

    // Columns Visibility Popover Menu
    const colMenuWrap = selectControls.createDiv({ cls: 'pe-col-menu-wrap' });
    const colBtn = colMenuWrap.createEl('button', {
      cls: 'pe-btn-secondary pe-btn-sm',
      text: '⚙️ Columns',
      attr: { title: 'Toggle table columns to optimize space' }
    });
    const colPopover = colMenuWrap.createDiv({ cls: 'pe-col-popover' });
    colPopover.style.display = 'none';

    colBtn.onclick = (e) => {
      e.stopPropagation();
      colPopover.style.display = colPopover.style.display === 'none' ? 'flex' : 'none';
    };

    const columnsList = [
      ['topic', 'Topic Note'],
      ['type', 'Type'],
      ['difficulty', 'Difficulty'],
      ['interval', 'Interval'],
      ['reps', 'Reps'],
      ['due', 'Due Date']
    ];

    columnsList.forEach(([key, label]) => {
      const row = colPopover.createEl('label', { cls: 'pe-col-check-row' });
      const cb = row.createEl('input', { attr: { type: 'checkbox' } });
      cb.checked = this.plugin.settings.visibleColumns[key] !== false;
      row.createSpan({ text: label });
      cb.onchange = async () => {
        this.plugin.settings.visibleColumns[key] = cb.checked;
        await this.plugin.saveSettings();
        this.renderCardBrowser(root);
      };
    });

    window.addEventListener('click', () => {
      if (colPopover.style.display !== 'none') colPopover.style.display = 'none';
    });
    colPopover.onclick = (e) => e.stopPropagation();

    const selectBar = toolbar.createDiv({ cls: 'pe-batch-actions' });
    this.updateSelectionBar(selectBar);

    const tableWrap = root.createDiv({ cls: 'pe-browser-table-wrap' });
    const table = tableWrap.createEl('table', { cls: 'pe-browser-table' });
    const thead = table.createEl('thead');
    const tr = thead.createEl('tr');

    const thSelect = tr.createEl('th', { attr: { style: 'width: 38px;' } });
    const masterCb = thSelect.createEl('input', { attr: { type: 'checkbox' } });
    masterCb.onchange = () => {
      const filtered = this.getFilteredCards();
      if (masterCb.checked) filtered.forEach((c) => this.selectedKeys.add(c.key));
      else this.selectedKeys.clear();
      this.renderTable(body);
      this.updateSelectionBar(selectBar);
    };

    const vc = this.plugin.settings.visibleColumns;
    if (vc.topic !== false) tr.createEl('th', { text: 'Topic Note' });
    if (vc.type !== false) tr.createEl('th', { text: 'Type' });
    tr.createEl('th', { text: 'Question Snippet' });
    if (vc.difficulty !== false) tr.createEl('th', { text: 'Difficulty' });
    if (vc.interval !== false) tr.createEl('th', { text: 'Interval' });
    if (vc.reps !== false) tr.createEl('th', { text: 'Reps' });
    if (vc.due !== false) tr.createEl('th', { text: 'Due Date' });
    tr.createEl('th', { text: 'Actions', attr: { style: 'width: 140px;' } });

    const body = table.createEl('tbody');
    this.renderTable(body);
  }

  getFilteredCards() {
    let filtered = this.allCards;
    if (this.searchQuery) {
      filtered = filtered.filter((c) =>
        c.questionMd.toLowerCase().includes(this.searchQuery) ||
        c.answerMd.toLowerCase().includes(this.searchQuery) ||
        (c.tags && c.tags.some((t) => t.toLowerCase().includes(this.searchQuery) || `#${t.toLowerCase()}`.includes(this.searchQuery))) ||
        c.concepts.some((x) => x.toLowerCase().includes(this.searchQuery)) ||
        (c.subjects && c.subjects.some((s) => s.toLowerCase().includes(this.searchQuery)))
      );
    }
    return filtered;
  }

  updateSelectionBar(container) {
    container.empty();
    const count = this.selectedKeys.size;
    if (count === 0) return;

    container.createSpan({ cls: 'pe-batch-badge', text: `${count} card${count > 1 ? 's' : ''} selected` });
    const deleteBtn = container.createEl('button', { cls: 'pe-btn-danger pe-btn-sm', text: `Delete Selected (${count})` });
    deleteBtn.onclick = () => {
      const selectedCards = this.allCards.filter((c) => this.selectedKeys.has(c.key));
      new DeleteConfirmModal(this.app, count, () => {
        this.plugin.deleteCards(selectedCards);
        this.selectedKeys.clear();
      }).open();
    };
  }

  renderTable(body) {
    body.empty();
    const vc = this.plugin.settings.visibleColumns;
    const clampCls = `pe-preview-clamp-${this.plugin.settings.previewLines || '2'}`;
    const filtered = this.getFilteredCards();

    filtered.forEach((card, idx) => {
      const tr = body.createEl('tr', { cls: this.selectedKeys.has(card.key) ? 'is-selected' : '' });
      const selTd = tr.createEl('td', { cls: 'pe-check-cell' });
      const cb = selTd.createEl('input', { attr: { type: 'checkbox' } });
      cb.checked = this.selectedKeys.has(card.key);

      cb.onclick = (e) => {
        e.stopPropagation();
        if (e.shiftKey && this.lastClickedRowIdx !== -1) {
          const start = Math.min(this.lastClickedRowIdx, idx);
          const end = Math.max(this.lastClickedRowIdx, idx);
          for (let i = start; i <= end; i++) {
            this.selectedKeys.add(filtered[i].key);
          }
        } else {
          if (cb.checked) this.selectedKeys.add(card.key);
          else this.selectedKeys.delete(card.key);
        }
        this.lastClickedRowIdx = idx;
        this.renderTable(body);
        const selBar = this.contentEl.querySelector('.pe-batch-actions');
        if (selBar) this.updateSelectionBar(selBar);
      };

      if (vc.topic !== false) tr.createEl('td', { text: card.file.basename });
      if (vc.type !== false) tr.createEl('td', { text: card.type });

      const qCell = tr.createEl('td');
      qCell.createDiv({ cls: clampCls, text: card.questionMd });

      if (vc.difficulty !== false) tr.createEl('td', { text: card.difficulty });
      if (vc.interval !== false) tr.createEl('td', { text: `${card.meta.ivl}d` });
      if (vc.reps !== false) tr.createEl('td', { text: String(card.meta.reps) });
      if (vc.due !== false) tr.createEl('td', { text: card.meta.due });

      const actCell = tr.createEl('td', { cls: 'pe-action-cell' });
      const editBtn = actCell.createEl('button', { cls: 'pe-btn-secondary pe-btn-xs', text: 'Edit' });
      editBtn.onclick = () => new QuestionEditorModal(this.app, this.plugin, card).open();

      const openBtn = actCell.createEl('button', { cls: 'pe-btn-secondary pe-btn-xs', text: 'Open' });
      openBtn.onclick = () => {
        this.app.workspace.getLeaf('tab').openFile(card.file, { eState: { line: card.startLine } });
      };

      const delBtn = actCell.createEl('button', { cls: 'pe-btn-icon-danger pe-btn-xs', text: '🗑️', attr: { title: 'Delete question' } });
      delBtn.onclick = () => {
        new DeleteConfirmModal(this.app, 1, () => this.plugin.deleteCards([card])).open();
      };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Analytics Reporting Tab with Dynamic Time Range Selector          */
  /* ------------------------------------------------------------------ */

  renderAnalyticsReport(root) {
    const totalCards = this.allCards.length;
    const totalAttempts = this.allCards.reduce((acc, c) => acc + (c.meta.attempts || 0), 0);
    const totalLapses = this.allCards.reduce((acc, c) => acc + (c.meta.lapses || 0), 0);
    const overallSuccessRate = totalAttempts > 0 ? Math.round(((totalAttempts - totalLapses) / totalAttempts) * 100) : 100;

    const dateCounts = {};
    this.allCards.forEach((c) => {
      (c.meta.hist || []).forEach((h) => {
        const d = h.split(':')[0];
        if (d) dateCounts[d] = (dateCounts[d] || 0) + 1;
      });
    });

    const today = todayStr();
    let currentStreak = 0;
    let checkDate = today;
    while (dateCounts[checkDate] && dateCounts[checkDate] > 0) {
      currentStreak++;
      checkDate = addDays(checkDate, -1);
    }
    if (currentStreak === 0) {
      const yesterday = addDays(today, -1);
      checkDate = yesterday;
      while (dateCounts[checkDate] && dateCounts[checkDate] > 0) {
        currentStreak++;
        checkDate = addDays(checkDate, -1);
      }
    }

    const statsGrid = root.createDiv({ cls: 'pe-analytics-grid' });
    const c1 = statsGrid.createDiv({ cls: 'pe-stat-card' });
    c1.createDiv({ cls: 'pe-stat-val', text: String(totalCards) });
    c1.createDiv({ cls: 'pe-stat-lbl', text: 'Total Questions' });

    const c2 = statsGrid.createDiv({ cls: 'pe-stat-card' });
    c2.createDiv({ cls: 'pe-stat-val', text: String(totalAttempts) });
    c2.createDiv({ cls: 'pe-stat-lbl', text: 'Lifetime Reviews' });

    const c3 = statsGrid.createDiv({ cls: 'pe-stat-card' });
    c3.createDiv({ cls: 'pe-stat-val', text: `${currentStreak} days 🔥` });
    c3.createDiv({ cls: 'pe-stat-lbl', text: 'Current Streak' });

    const c4 = statsGrid.createDiv({ cls: 'pe-stat-card' });
    c4.createDiv({ cls: 'pe-stat-val', text: `${overallSuccessRate}%` });
    c4.createDiv({ cls: 'pe-stat-lbl', text: 'Overall Retention' });

    // Time Range Selector for Heatmap
    const heatHeader = root.createDiv({ cls: 'pe-time-range-bar', attr: { style: 'display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem; margin-bottom: 0.5rem;' } });
    heatHeader.createEl('h3', { text: 'Review Activity Heatmap', attr: { style: 'margin: 0;' } });

    const rangeSeg = heatHeader.createDiv({ cls: 'pe-seg' });
    [
      ['30', '30 Days'],
      ['90', '90 Days'],
      ['180', '180 Days'],
      ['365', '1 Year']
    ].forEach(([val, label]) => {
      const btn = rangeSeg.createEl('button', {
        cls: `pe-seg-btn ${this.heatmapRange === val ? 'is-active' : ''}`,
        text: label
      });
      btn.onclick = () => {
        this.heatmapRange = val;
        this.render();
      };
    });

    const heatmapBox = root.createDiv({ cls: 'pe-heatmap-wrap' });
    this.renderHeatmap(heatmapBox, dateCounts);

    // Topic Calibration & Metacognitive Warnings
    const topicsMap = {};
    this.allCards.forEach((c) => {
      const topicName = c.file.basename;
      if (!topicsMap[topicName]) {
        topicsMap[topicName] = {
          file: c.file,
          subject: (c.subjects && c.subjects.length) ? c.subjects.join(', ') : (c.fm.subject || 'General'),
          cards: [],
          attempts: 0,
          lapses: 0,
          confidentFlaws: 0,
          lastTried: 'Never'
        };
      }
      const t = topicsMap[topicName];
      t.cards.push(c);
      t.attempts += (c.meta.attempts || 0);
      t.lapses += (c.meta.lapses || 0);

      (c.meta.hist || []).forEach((h) => {
        const parts = h.split(':');
        if (parts[2] === 'CF') t.confidentFlaws++;
        if (parts[0] && (t.lastTried === 'Never' || parts[0] > t.lastTried)) {
          t.lastTried = parts[0];
        }
      });
    });

    const highRiskTopics = Object.values(topicsMap).filter((t) => t.confidentFlaws >= 2);
    if (highRiskTopics.length) {
      const alertBox = root.createDiv({ cls: 'pe-alert-box' });
      alertBox.createEl('h4', { text: '⚠️ Metacognitive Calibration Alert' });
      alertBox.createEl('p', {
        text: `High "Confident Misconceptions" detected in: ${highRiskTopics.map((t) => t.file.basename).join(', ')}. Review lecture source notes for these topics to fix core conceptual flaws.`
      });
    }

    root.createEl('h3', { text: 'Topic Breakdown & Diagnostic Log', attr: { style: 'margin-top: 1.5rem;' } });
    const tableWrap = root.createDiv({ cls: 'pe-browser-table-wrap' });
    const table = tableWrap.createEl('table', { cls: 'pe-browser-table' });
    const thead = table.createEl('thead');
    const tr = thead.createEl('tr');
    ['Topic Note', 'Subject', 'Cards', 'Reviews', 'Last Tried', 'Lapses', 'Diagnostic Status'].forEach((h) => tr.createEl('th', { text: h }));

    const body = table.createEl('tbody');
    Object.values(topicsMap).forEach((t) => {
      const row = body.createEl('tr');
      row.createEl('td', { text: t.file.basename });
      row.createEl('td', { text: t.subject });
      row.createEl('td', { text: String(t.cards.length) });
      row.createEl('td', { text: String(t.attempts) });
      row.createEl('td', { text: t.lastTried });
      row.createEl('td', { text: String(t.lapses) });

      const statusCell = row.createEl('td');
      if (t.confidentFlaws >= 2) {
        statusCell.createSpan({ cls: 'pe-badge-alert', text: 'Conceptual Flaw' });
      } else if (t.attempts > 0 && t.lapses / t.attempts > 0.3) {
        statusCell.createSpan({ cls: 'pe-badge-alert', text: 'Needs Review' });
      } else if (t.attempts > 0) {
        statusCell.createSpan({ cls: 'pe-badge-good', text: 'Mastered' });
      } else {
        statusCell.createSpan({ text: 'Untested', attr: { style: 'color: var(--text-faint);' } });
      }
    });
  }

  renderHeatmap(container, dateCounts) {
    const rangeDays = parseInt(this.heatmapRange, 10) || 365;
    const today = todayStr();
    const weeks = Math.ceil(rangeDays / 7);
    const totalDays = weeks * 7;
    const startStr = addDays(today, -totalDays + 1);

    // Calculate period statistics
    let periodReviews = 0;
    let activeDays = 0;
    let maxSingleDay = 0;

    for (let i = 0; i < totalDays; i++) {
      const curDate = addDays(startStr, i);
      const count = dateCounts[curDate] || 0;
      if (count > 0) {
        periodReviews += count;
        activeDays++;
        if (count > maxSingleDay) maxSingleDay = count;
      }
    }

    const consistencyRate = Math.round((activeDays / rangeDays) * 100);
    const dailyAvg = (periodReviews / (rangeDays || 1)).toFixed(1);

    const wrap = container.createDiv({ cls: `pe-heatmap-wrap-inner pe-range-${rangeDays}` });

    const gridCol = wrap.createDiv({ cls: 'pe-heatmap-grid-col' });
    const grid = gridCol.createDiv({ cls: `pe-heatmap-grid pe-grid-${rangeDays}` });

    for (let i = 0; i < totalDays; i++) {
      const curDate = addDays(startStr, i);
      const count = dateCounts[curDate] || 0;
      let level = 0;
      if (count >= 10) level = 4;
      else if (count >= 6) level = 3;
      else if (count >= 3) level = 2;
      else if (count >= 1) level = 1;

      grid.createDiv({
        cls: `pe-heatmap-cell pe-heat-lvl-${level}`,
        attr: { title: `${curDate}: ${count} review${count !== 1 ? 's' : ''}` }
      });
    }

    const legend = gridCol.createDiv({ cls: 'pe-heatmap-legend' });
    legend.createSpan({ text: `Showing past ${this.heatmapRange} days • Less` });
    [0, 1, 2, 3, 4].forEach((lvl) => {
      legend.createDiv({ cls: `pe-heatmap-cell pe-heat-lvl-${lvl}` });
    });
    legend.createSpan({ text: 'More' });

    // Right Column: Companion Period Metrics Card (fills the empty space elegantly)
    const statsCol = wrap.createDiv({ cls: 'pe-heatmap-period-stats' });
    statsCol.createEl('h4', { text: `Past ${this.heatmapRange} Days Summary` });

    const metricsGrid = statsCol.createDiv({ cls: 'pe-period-metrics-grid' });

    const m1 = metricsGrid.createDiv({ cls: 'pe-period-metric' });
    m1.createDiv({ cls: 'pe-metric-num', text: String(periodReviews) });
    m1.createDiv({ cls: 'pe-metric-label', text: 'Reviews in Period' });

    const m2 = metricsGrid.createDiv({ cls: 'pe-period-metric' });
    m2.createDiv({ cls: 'pe-metric-num', text: `${activeDays} / ${rangeDays}d` });
    m2.createDiv({ cls: 'pe-metric-label', text: `Active Days (${consistencyRate}%)` });

    const m3 = metricsGrid.createDiv({ cls: 'pe-period-metric' });
    m3.createDiv({ cls: 'pe-metric-num', text: `${dailyAvg}/d` });
    m3.createDiv({ cls: 'pe-metric-label', text: 'Daily Pace' });

    const m4 = metricsGrid.createDiv({ cls: 'pe-period-metric' });
    m4.createDiv({ cls: 'pe-metric-num', text: String(maxSingleDay) });
    m4.createDiv({ cls: 'pe-metric-label', text: 'Best Single Day' });
  }

  onKey(e) {
    if (e.key === 'Escape' && this.sessionActive) {
      e.preventDefault();
      this.sessionActive = false;
      this.render();
      return;
    }
    if (!this.sessionActive || !this.queue.length) return;

    if (e.key.toLowerCase() === 't') {
      e.preventDefault();
      this.toggleAllMaskingTapes();
      return;
    }

    if (e.key >= '1' && e.key <= '6') {
      const idx = parseInt(e.key, 10) - 1;
      if (this.stage === 'question' && RETRIEVAL_EFFORTS[idx]) {
        e.preventDefault();
        this.effort = RETRIEVAL_EFFORTS[idx].id;
        this.stage = 'answer';
        this.render();
      } else if (this.stage === 'answer' && ACCURACY_DIAGNOSTICS[idx]) {
        e.preventDefault();
        this.submitReview(this.queue[this.pos], this.effort, ACCURACY_DIAGNOSTICS[idx].id);
      }
    } else if ((e.key === ' ' || e.key === 'Enter') && this.stage === 'question') {
      e.preventDefault();
      this.stage = 'answer';
      this.effort = 'FAST_CONFIDENT';
      this.render();
    } else if (e.key === 'ArrowRight' && this.stage === 'question') {
      e.preventDefault();
      this.advanceCard();
    }
  }
}

/* ------------------------------------------------------------------ */
/* Direct-in-Note Helper Modal (Approach B)                           */
/* ------------------------------------------------------------------ */

class TopicSelectModal extends FuzzySuggestModal {
  constructor(app, plugin, onChoose) {
    super(app);
    this.plugin = plugin;
    this.onChoose = onChoose;
    this.setPlaceholder('Choose destination note (or select to create new)...');
  }
  getItems() {
    const files = this.app.vault.getMarkdownFiles();
    return [
      { isNew: true, path: '__new__', name: '+ Create New Topic Note...' },
      ...files.map((f) => ({ isNew: false, path: f.path, name: f.basename, file: f }))
    ];
  }
  getItemText(item) { return item.name; }
  onChooseItem(item) {
    if (item.isNew) new QuestionEditorModal(this.app, this.plugin).open();
    else this.onChoose(item.file);
  }
}

/* ------------------------------------------------------------------ */
/* Settings Tab                                                       */
/* ------------------------------------------------------------------ */

class PracticeSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Practice Engine Settings' });

    new Setting(containerEl)
      .setName('Spaced Repetition Algorithm')
      .setDesc('Choose between modern FSRS (Free Spaced Repetition Scheduler) and classic adapted SM-2.')
      .addDropdown((dd) => {
        dd.addOption('fsrs', 'FSRS v4.5 (Stability & Retrievability DSR Model)')
          .addOption('sm2', 'Adapted SM-2 (Ease Factor Model)')
          .setValue(this.plugin.settings.schedulerMode || 'fsrs')
          .onChange(async (val) => {
            this.plugin.settings.schedulerMode = val;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('FSRS Target Retention Rate')
      .setDesc('Target probability of successfully recalling a card at its scheduled review date (default: 90%).')
      .addSlider((slider) => {
        slider.setLimits(80, 97, 1)
          .setValue(Math.round((this.plugin.settings.targetRetention || 0.90) * 100))
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.targetRetention = val / 100;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Card Markdown Format')
      .setDesc('Choose between clean Markdown blocks (unquoted normal Obsidian markdown) and standard Callout cards.')
      .addDropdown((dd) => {
        dd.addOption('callout', 'Standard Callouts (> [!question] & > > [!answer])')
          .addOption('block', 'Clean Markdown Blocks (%%pe-card%% ... %%pe-answer%%)')
          .setValue(this.plugin.settings.cardFormat || 'callout')
          .onChange(async (val) => {
            this.plugin.settings.cardFormat = val;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Card Creation Mode')
      .setDesc('Choose whether "+ Add Question" opens the Side-by-Side Dual Editor Modal or inserts directly into your active Obsidian note.')
      .addDropdown((dd) => {
        dd.addOption('modal', 'Side-by-Side Modal (Dual Editor & Live Embeds)')
          .addOption('direct', 'Direct-in-Note (Native Obsidian Editor & Panels)')
          .setValue(this.plugin.settings.creationMode || 'modal')
          .onChange(async (val) => {
            this.plugin.settings.creationMode = val;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Practice Notes Folder')
      .setDesc('Folder where topic practice notes live.')
      .addText((text) => {
        text.setValue(this.plugin.settings.practiceFolder).onChange(async (v) => {
          this.plugin.settings.practiceFolder = v.trim();
          await this.plugin.saveSettings();
        });
        new FolderSuggest(this.app, text.inputEl);
      })
      .addButton((btn) => {
        btn.setButtonText('Browse').setIcon('folder').onClick(() => {
          new FolderSuggestModal(this.app, async (chosenPath) => {
            this.plugin.settings.practiceFolder = chosenPath;
            await this.plugin.saveSettings();
            this.display();
          }).open();
        });
      });

    new Setting(containerEl)
      .setName('Attachments Subfolder')
      .setDesc('Subdirectory inside the Practice folder where images and media are saved (e.g. attachments).')
      .addText((text) => {
        text.setValue(this.plugin.settings.attachmentFolder || 'attachments').onChange(async (v) => {
          this.plugin.settings.attachmentFolder = v.trim();
          await this.plugin.saveSettings();
        });
      });

    containerEl.createEl('h3', { text: 'Hybrid Bridges & Math Enhancements' });

    new Setting(containerEl)
      .setName('Enable LaTeX Toolbox Bridge')
      .setDesc('When enabled, clicking Math in the card editor invokes the visual LaTeX Toolbox STEM builder modal.')
      .addToggle((tg) => {
        tg.setValue(this.plugin.settings.enableLatexToolboxBridge !== false).onChange(async (v) => {
          this.plugin.settings.enableLatexToolboxBridge = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Enable Natural Math Engine')
      .setDesc('Provides WolframAlpha / MATLAB natural math conversion (e.g. diff, int, [1 2; 3 4]) to LaTeX.')
      .addToggle((tg) => {
        tg.setValue(this.plugin.settings.enableNaturalMathEngine !== false).onChange(async (v) => {
          this.plugin.settings.enableNaturalMathEngine = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Enable Smart Math Typing')
      .setDesc('Automatically wraps and pairs subscripts _{} and superscripts ^{} with cursor auto-positioning.')
      .addToggle((tg) => {
        tg.setValue(this.plugin.settings.enableSmartMathTyping !== false).onChange(async (v) => {
          this.plugin.settings.enableSmartMathTyping = v;
          await this.plugin.saveSettings();
        });
      });

    containerEl.createEl('h3', { text: 'Appearance & UI Styling' });

    new Setting(containerEl)
      .setName('Frosted Glassmorphism & Material 3')
      .setDesc('Apply translucent frosted glass surfaces, backdrop blurs, luminous borders, and fluid container responsiveness.')
      .addToggle((tg) => {
        tg.setValue(this.plugin.settings.glassmorphism !== false).onChange(async (v) => {
          this.plugin.settings.glassmorphism = v;
          await this.plugin.saveSettings();
          this.plugin.applyThemePreferences();
        });
      });

    containerEl.createEl('h3', { text: 'Tools & Migration' });

    new Setting(containerEl)
      .setName('Import from Spaced Repetition Plugin')
      .setDesc('Scan practice notes for existing <!--SR:...--> flashcards and import their review histories into Practice Engine.')
      .addButton((b) => b.setButtonText('Scan & Import').onClick(async () => {
        await this.plugin.importExistingCards();
      }));

    new Setting(containerEl)
      .setName('AI Generator System Prompt')
      .setDesc('Copy structured instruction set for LLMs to generate auto-extractable practice cards.')
      .addButton((b) => b.setButtonText('Copy AI Prompt').onClick(() => this.plugin.copyAiPrompt()));
  }
}

/* ------------------------------------------------------------------ */
/* Plugin Lifecycle                                                   */
/* ------------------------------------------------------------------ */

module.exports = class PracticeEnginePlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!this.settings.visibleColumns) this.settings.visibleColumns = Object.assign({}, DEFAULT_SETTINGS.visibleColumns);

    this.applyThemePreferences();

    this.registerView(VIEW_TYPE, (leaf) => new PracticeView(leaf, this));
    this.addRibbonIcon('brain', 'Practice Engine', () => this.activateView());
    this.addRibbonIcon('plus', 'Add Practice Questions', () => this.openAddQuestion());
    this.addSettingTab(new PracticeSettingTab(this.app, this));

    this.addCommand({ id: 'open-practice', name: 'Open Practice Engine', callback: () => this.activateView() });
    this.addCommand({ id: 'add-card', name: 'Add Practice Question', callback: () => this.openAddQuestion() });
    this.addCommand({ id: 'import-sr-cards', name: 'Import from Spaced Repetition Plugin', callback: () => this.importExistingCards() });
    this.addCommand({ id: 'copy-prompt', name: 'Copy AI Card Writing Prompt', callback: () => this.copyAiPrompt() });
  }

  onunload() {
    document.body.removeClass('pe-glassmorphic');
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  applyThemePreferences() {
    if (this.settings.glassmorphism !== false) {
      document.body.addClass('pe-glassmorphic');
    } else {
      document.body.removeClass('pe-glassmorphic');
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  folder() {
    return (this.settings.practiceFolder || '').replace(/^\/+|\/+$/g, '');
  }

  getLatexToolbox() {
    return window.LatexToolboxAPI || (this.app.plugins?.plugins?.['latex-toolbox'] && this.app.plugins.plugins['latex-toolbox'].api);
  }

  getNoteToolbox() {
    return this.app.plugins?.plugins?.['note-toolbox'];
  }

  practiceFiles() {
    const folder = this.folder();
    return this.app.vault.getMarkdownFiles()
      .filter((f) => !folder || f.path === folder || f.path.startsWith(folder + '/'))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  getAllTopics() {
    const topics = new Set();
    this.practiceFiles().forEach((f) => topics.add(f.basename));
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (leaf && leaf.view && leaf.view.allCards) {
      leaf.view.allCards.forEach((c) => {
        if (c.file && c.file.basename) topics.add(c.file.basename);
      });
    }
    return Array.from(topics).sort();
  }

  getAllSubjects() {
    const subjects = new Set(['Physics', 'Chemistry', 'Biology', 'Mathematics', 'Computer Science', 'Electrical Engineering', 'General']);
    this.app.vault.getMarkdownFiles().forEach((file) => {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache && cache.frontmatter && cache.frontmatter.subject) {
        if (Array.isArray(cache.frontmatter.subject)) {
          cache.frontmatter.subject.forEach((s) => subjects.add(String(s).trim()));
        } else {
          subjects.add(String(cache.frontmatter.subject).trim());
        }
      }
    });
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (leaf && leaf.view && leaf.view.allCards) {
      leaf.view.allCards.forEach((c) => {
        (c.subjects || []).forEach((s) => subjects.add(String(s).trim()));
      });
    }
    return Array.from(subjects).sort();
  }

  getAllTags() {
    const tags = new Set();
    this.app.vault.getMarkdownFiles().forEach((file) => {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache && cache.tags) {
        cache.tags.forEach((t) => tags.add(t.tag.replace(/^#/, '')));
      }
    });
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (leaf && leaf.view && leaf.view.allCards) {
      leaf.view.allCards.forEach((c) => {
        (c.tags || []).forEach((t) => tags.add(String(t).replace(/^#/, '')));
      });
    }
    return Array.from(tags).sort();
  }

  getAllConcepts() {
    const concepts = new Set();
    const files = this.practiceFiles();
    files.forEach((f) => {
      const cache = this.app.metadataCache.getFileCache(f);
      if (cache && cache.frontmatter && cache.frontmatter.concepts) {
        if (Array.isArray(cache.frontmatter.concepts)) {
          cache.frontmatter.concepts.forEach((c) => concepts.add(String(c).trim()));
        }
      }
    });
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (leaf && leaf.view && leaf.view.allCards) {
      leaf.view.allCards.forEach((c) => {
        (c.concepts || []).forEach((cp) => concepts.add(cp));
      });
    }
    return Array.from(concepts).sort();
  }

  async copyAiPrompt() {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      new Notice('AI prompt copied to clipboard!');
    } catch (e) {
      new Notice('Could not access clipboard.');
    }
  }

  async activateView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  refreshAllViews() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
      if (leaf.view && typeof leaf.view.refreshData === 'function') {
        leaf.view.refreshData();
      }
    });
  }

  async ensureFolder(folderPath) {
    const parts = folderPath.split('/').filter(Boolean);
    let cur = '';
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        await this.app.vault.createFolder(cur);
      }
    }
  }

  async saveAttachmentToTopicFolder(topicPath, arrayBuffer, originalName) {
    const base = this.folder();
    const sub = (this.settings.attachmentFolder || 'attachments').replace(/^\/+|\/+$/g, '');
    const folderPath = base ? `${base}/${sub}` : sub;

    await this.ensureFolder(folderPath);

    const safeBase = originalName.replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, '_');
    const timestamp = Date.now().toString().slice(-6);
    const safeName = `${timestamp}_${safeBase}`;
    const fullPath = `${folderPath}/${safeName}`;

    await this.app.vault.createBinary(fullPath, arrayBuffer);
    return safeName;
  }

  async openAddQuestion() {
    if (this.settings.creationMode === 'direct') {
      await this.insertCardDirectly();
    } else {
      new QuestionEditorModal(this.app, this).open();
    }
  }

  async insertCardDirectly() {
    const activeView = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const activeFile = activeView ? activeView.file : null;
    const practiceFolder = this.folder();

    if (activeFile && (!practiceFolder || activeFile.path.startsWith(practiceFolder))) {
      await this.appendCardTemplateToFile(activeFile, activeView);
      return;
    }

    new TopicSelectModal(this.app, this, async (file) => {
      if (file) await this.appendCardTemplateToFile(file);
    }).open();
  }

  async appendCardTemplateToFile(file, activeView = null) {
    const isBlock = this.settings.cardFormat === 'block';
    const cardObj = {
      type: 'Conceptual',
      difficulty: 'Moderate',
      subjects: [],
      tags: [],
      concepts: [],
      question: '',
      answer: ''
    };
    const template = buildCardMarkdown(cardObj, defaultMeta(), isBlock ? 'block' : 'callout');

    let view = activeView;
    if (!view || view.file?.path !== file.path) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
      view = leaf.view;
    }

    if (view && view.editor) {
      const editor = view.editor;
      const doc = editor.getValue();
      const trimmed = doc.trimEnd();
      const separator = trimmed.length > 0 ? '\n\n' : '';
      const newContent = trimmed + separator + template + '\n';
      editor.setValue(newContent);

      const lines = newContent.split('\n');
      let targetLine = lines.length - 3;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].includes('pe-answer') || lines[i] === '> ') {
          targetLine = i - 1;
          break;
        }
      }
      editor.setCursor({ line: Math.max(0, targetLine), ch: 0 });
      editor.focus();
      new Notice(`Question template inserted into "${file.basename}". Ready to write!`);
      this.refreshAllViews();
    }
  }

  async collectAllCards() {
    const cards = [];
    for (const file of this.practiceFiles()) {
      const text = await this.app.vault.read(file);
      if (!text.includes('[!question]') && !text.includes('pe-card')) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = (cache && cache.frontmatter) || {};
      const parsed = parseCards(text, file);
      parsed.forEach((c) => { c.fm = fm; cards.push(c); });
    }
    return cards;
  }

  async writeCardMetadata(card, newMeta) {
    await this.app.vault.process(card.file, (data) => {
      const freshCards = parseCards(data, card.file);
      const fresh = freshCards.find((c) => (c.meta && c.meta.id && card.meta && card.meta.id && c.meta.id === card.meta.id) || c.key === card.key);
      if (!fresh) return data;
      const lines = data.split('\n');
      const metaStr = serializeMeta(newMeta);
      if (fresh.metaLine !== -1) {
        lines[fresh.metaLine] = metaStr;
      } else {
        lines.splice(fresh.endLine + 1, 0, metaStr);
      }
      return lines.join('\n');
    });
  }

  async updateCardContent(card, updated) {
    await this.app.vault.process(card.file, (data) => {
      const freshCards = parseCards(data, card.file);
      const fresh = freshCards.find((c) => (c.meta && c.meta.id && card.meta && card.meta.id && c.meta.id === card.meta.id) || c.key === card.key);
      if (!fresh) return data;

      const lines = data.split('\n');
      const replacement = buildCardMarkdown(updated, fresh.meta, fresh.format || this.settings.cardFormat || 'callout');
      const deleteCount = (fresh.metaLine !== -1 ? fresh.metaLine : fresh.endLine) - fresh.startLine + 1;

      lines.splice(fresh.startLine, deleteCount, replacement);
      return lines.join('\n');
    });
    this.refreshAllViews();
  }

  async deleteCards(cardsToDelete) {
    const byFile = new Map();
    for (const c of cardsToDelete) {
      if (!byFile.has(c.file)) byFile.set(c.file, []);
      byFile.get(c.file).push(c);
    }

    for (const [file, cards] of byFile.entries()) {
      await this.app.vault.process(file, (data) => {
        const freshCards = parseCards(data, file);
        const toRemove = freshCards.filter((fc) =>
          cards.some((c) => (c.meta && c.meta.id && fc.meta && fc.meta.id && c.meta.id === fc.meta.id) || c.key === fc.key)
        );
        if (!toRemove.length) return data;

        toRemove.sort((a, b) => b.startLine - a.startLine);
        const lines = data.split('\n');

        for (const card of toRemove) {
          const end = card.metaLine !== -1 ? card.metaLine : card.endLine;
          let deleteCount = end - card.startLine + 1;
          if (lines[card.startLine + deleteCount] && lines[card.startLine + deleteCount].trim() === '') {
            deleteCount += 1;
          }
          lines.splice(card.startLine, deleteCount);
        }
        return lines.join('\n');
      });
    }
    new Notice(`Deleted ${cardsToDelete.length} question(s).`);
    this.refreshAllViews();
  }

  async addCards(target, cards) {
    const format = this.settings.cardFormat || 'callout';
    const block = cards.map((c) => buildCardMarkdown(c, defaultMeta(), format)).join('\n\n');
    const folder = this.folder();
    let file = null;

    if (target.topicPath && target.topicPath !== '__new__') {
      file = this.app.vault.getAbstractFileByPath(target.topicPath);
      if (file instanceof TFile) {
        await this.app.vault.process(file, (d) => d.trimEnd() + '\n\n' + block + '\n');
      } else {
        let path = target.topicPath;
        if (!path.endsWith('.md')) path += '.md';
        const parentDir = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
        if (parentDir) await this.ensureFolder(parentDir);
        const name = path.replace(/^.*[\\/]/, '').replace(/\.md$/, '');
        const subList = target.subjects && target.subjects.length ? target.subjects : ['General'];
        const tagList = ['practice', ...subList.map((s) => s.toLowerCase().replace(/\s+/g, '-'))];
        const fm = [
          '---',
          `topic: "${name}"`,
          `subject: [${subList.map((s) => `"${s}"`).join(', ')}]`,
          `tags: [${tagList.map((t) => `"${t}"`).join(', ')}]`,
          '---',
          '',
          '## Practice Questions',
          '',
          block,
          ''
        ].join('\n');
        file = await this.app.vault.create(path, fm);
        new Notice(`Created new note: ${name}`);
      }
    } else {
      const name = (target.newTopic || 'General Practice').replace(/[\\/:*?"<>|#^[\]]/g, '').trim();
      const path = (folder ? `${folder}/` : '') + `${name}.md`;
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) {
        file = existing;
        await this.app.vault.process(file, (d) => d.trimEnd() + '\n\n' + block + '\n');
      } else {
        if (folder) await this.ensureFolder(folder);
        const subList = target.subjects && target.subjects.length ? target.subjects : ['General'];
        const tagList = ['practice', ...subList.map((s) => s.toLowerCase().replace(/\s+/g, '-'))];

        const fm = [
          '---',
          `topic: "${name}"`,
          `subject: [${subList.map((s) => `"${s}"`).join(', ')}]`,
          `tags: [${tagList.map((t) => `"${t}"`).join(', ')}]`,
          '---',
          '',
          '## Practice Questions',
          '',
          block,
          ''
        ].join('\n');
        file = await this.app.vault.create(path, fm);
        new Notice(`Created new note: ${name}`);
      }
    }
    new Notice(`Saved ${cards.length} question(s) to ${file ? file.basename : 'note'}.`);
    this.refreshAllViews();
  }

  async importExistingCards() {
    let count = 0;
    const files = this.practiceFiles();

    for (const file of files) {
      await this.app.vault.process(file, (data) => {
        let lines = data.split('\n');
        let modified = false;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const srMatch = line.match(/<!--SR:!(\d{4}-\d{2}-\d{2}),(\d+),(\d+)-->/);
          if (srMatch && !line.includes('pe-meta:')) {
            const due = srMatch[1];
            const ivl = parseInt(srMatch[2], 10) || 1;
            const ease = parseInt(srMatch[3], 10) || 250;
            const diff = Math.max(1.0, Math.min(5.0, (280 - ease) / 30));
            const meta = defaultMeta();
            meta.due = due;
            meta.ivl = ivl;
            meta.diff = diff;
            meta.s = ivl * 1.0;
            lines[i] = serializeMeta(meta);
            modified = true;
            count++;
          }
        }
        return modified ? lines.join('\n') : data;
      });
    }

    if (count > 0) {
      new Notice(`Imported ${count} cards from Spaced Repetition plugin!`);
      this.refreshAllViews();
    } else {
      new Notice('No unlinked Spaced Repetition cards found to import.');
    }
  }
};