
import { QuestionBank } from '../types/question';

export function exportQuestionBank(bank: QuestionBank): void {
	const blob = new Blob([`${JSON.stringify(bank, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const anchor = document.body.createEl('a');
	anchor.href = url;
	anchor.download = `${safe(bank.bank.name)}.json`;
	anchor.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safe(value: string): string {
	return value.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'question-bank';
}
