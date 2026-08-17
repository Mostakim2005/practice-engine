import { Question, QuestionBank } from '../types/question';

function safe(s: string): string {
	return (
		s
			.trim()
			.replace(/[^a-z0-9-_]+/gi, '-')
			.replace(/^-+|-+$/g, '') || 'question-bank'
	);
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function renderQuestion(q: Question, index: number): string {
	const options = (q.options ?? [])
		.map(
			(o) =>
				`<label><input type="radio" name="q${index}" value="${escapeHtml(o.id)}"> <strong>${escapeHtml(
					o.id,
				)}.</strong> ${escapeHtml(o.text)}</label>`,
		)
		.join('');
	return `
<section class="q">
  <div class="meta">${escapeHtml(q.subject)} · ${escapeHtml(q.topic)} · ${escapeHtml(q.type)}</div>
  <h2>${index + 1}. ${escapeHtml(q.question)}</h2>
  <div class="options">${options}</div>
  <button type="button" onclick="this.nextElementSibling.hidden=false">Reveal answer</button>
  <div class="answer" hidden>
    <strong>Answer</strong>
    <p>${escapeHtml(q.answer.model)}</p>
    <p>${escapeHtml(q.answer.explanation ?? q.answer.short)}</p>
  </div>
</section>`;
}

export function exportQuestionsHtml(bank: QuestionBank, questions: Question[]): void {
	const body = questions.map(renderQuestion).join('\n');
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(bank.bank.name)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:24px;line-height:1.55;background:#f5f7f9;color:#18212b}
.q{background:white;border:1px solid #d8dee4;border-radius:12px;padding:18px;margin:0 0 16px}
.meta{color:#697680;font-size:.9rem}.options{display:grid;gap:8px;margin:15px 0}
.answer{margin-top:12px;padding:12px;background:#eef8f1;border-left:4px solid #23854b}
button{padding:8px 12px}
</style>
</head>
<body>
<header><h1>${escapeHtml(bank.bank.name)}</h1><p>${escapeHtml(bank.bank.description ?? '')}</p></header>
${body}
</body></html>`;

	const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.body.createEl('a', { href: url, text: 'Download' });
	a.download = `${safe(bank.bank.name)}-selected.html`;
	a.style.display = 'none';
	document.body.appendChild(a);
	a.click();
	a.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}