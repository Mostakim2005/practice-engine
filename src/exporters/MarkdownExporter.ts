import { Question, QuestionBank } from '../types/question';

function safe(s: string): string {
	return (
		s
			.trim()
			.replace(/[^a-z0-9-_]+/gi, '-')
			.replace(/^-+|-+$/g, '') || 'question-bank'
	);
}

function bulletList(items: string[] | undefined): string {
	return items?.length ? items.map((item) => `- ${item}`).join('\n') : '';
}

function questionToMarkdown(q: Question): string {
	const lines = [
		`## ${q.id}`,
		'',
		`**Type:** ${q.type}`,
		`**Subject:** ${q.subject}`,
		`**Topic:** ${q.topic}`,
		q.subtopic ? `**Subtopic:** ${q.subtopic}` : '',
		`**Difficulty:** ${q.difficulty}`,
		`**Cognitive level:** ${q.cognitiveLevel}`,
		`**Question family:** ${q.questionFamily}`,
		'',
		q.question,
		'',
	];

	if (q.options?.length) {
		lines.push(...q.options.map((o) => `- ${q.correctAnswer?.includes(o.id) ? '[x]' : '[ ]'} ${o.text}`), '');
	}

	if (q.hints?.length) {
		lines.push('### Hints', '', bulletList(q.hints), '');
	}

	lines.push(
		'### Model answer',
		'',
		q.answer.model,
		'',
		'### Explanation',
		'',
		q.answer.explanation ?? q.answer.short,
		'',
	);

	if (q.answer.working) lines.push('### Working', '', q.answer.working, '');
	if (q.answer.keyPoints?.length) lines.push('### Key points', '', bulletList(q.answer.keyPoints), '');
	if (q.answer.commonMistakes?.length) lines.push('### Common mistakes', '', bulletList(q.answer.commonMistakes), '');
	if (q.answer.acceptableAlternatives?.length) {
		lines.push('### Acceptable alternatives', '', bulletList(q.answer.acceptableAlternatives), '');
	}

	return lines.filter((line) => line !== '').join('\n');
}

export function exportQuestionsMarkdown(bank: QuestionBank, questions: Question[]): void {
	const markdown = [
		`# ${bank.bank.name}`,
		'',
		bank.bank.description ?? '',
		'',
		...questions.map(questionToMarkdown),
		'',
	].join('\n');

	const filename = `${safe(bank.bank.name)}-selected.md`;
	const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.body.createEl('a', { href: url, text: 'Download' });
	a.download = filename;
	a.style.display = 'none';
	document.body.appendChild(a);
	a.click();
	a.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}