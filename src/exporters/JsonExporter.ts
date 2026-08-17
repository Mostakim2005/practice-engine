import { QuestionBank } from '../types/question';

function safe(s: string): string {
	return (
		s
			.trim()
			.replace(/[^a-z0-9-_]+/gi, '-')
			.replace(/^-+|-+$/g, '') || 'question-bank'
	);
}

function downloadText(filename: string, text: string, type: string): void {
	const blob = new Blob([text], { type });
	const url = URL.createObjectURL(blob);
	const a = document.body.createEl('a', { href: url, text: 'Download' });
	a.download = filename;
	a.addClass('is-hidden');
	document.body.appendChild(a);
	a.click();
	a.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportQuestionBank(bank: QuestionBank): void {
	downloadText(
		`${safe(bank.bank.name)}.json`,
		`${JSON.stringify(bank, null, 2)}\n`,
		'application/json;charset=utf-8',
	);
}

export function exportQuestionsJson(bank: QuestionBank, questions: QuestionBank['questions']): void {
	downloadText(
		`${safe(bank.bank.name)}-selected.json`,
		`${JSON.stringify({ ...bank, questions }, null, 2)}\n`,
		'application/json;charset=utf-8',
	);
}