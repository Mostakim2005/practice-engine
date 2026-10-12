import { App, TFile } from 'obsidian';
import { CardMetadata, CognitiveType, PracticeCard } from './types';

export class CardParser {
    constructor(private app: App) {}

    async extractCardsFromFolder(folderPath: string): Promise<PracticeCard[]> {
        const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folderPath));
        const cards: PracticeCard[] = [];

        for (const file of files) {
            const content = await this.app.vault.read(file);
            const fileCards = this.parseFileContent(content, file);
            cards.push(...fileCards);
        }

        return cards;
    }

    parseFileContent(content: string, file: TFile): PracticeCard[] {
        const lines = content.split('\n');
        const cards: PracticeCard[] = [];
        const cache = this.app.metadataCache.getFileCache(file);
        const sourceLecture = cache?.frontmatter?.source_lecture || '';

        let i = 0;
        while (i < lines.length) {
            const line = lines[i];

            if (line.match(/^>\s*[!question]/i)) {
                const startLine = i;
                const headerLine = line;

                const typeMatch = headerLine.match(/Type::\s*(\w+)/i);
                const type: CognitiveType = (typeMatch ? typeMatch[1].toLowerCase() : 'conceptual') as CognitiveType;

                const conceptsMatch = headerLine.match(/Concepts::\s*([^|\n]+)/i);
                const concepts = conceptsMatch ? conceptsMatch[1].split(',').map(c => c.trim()) : [];

                let questionLines: string[] = [];
                let answerLines: string[] = [];
                let insideAnswer = false;
                let metadata: CardMetadata = this.getDefaultMetadata();
                let endLine = i;

                i++;
                while (i < lines.length) {
                    const current = lines[i];

                    const metaMatch = current.match(/<!--pe-meta:\s*(.*?)-->/);
                    if (metaMatch) {
                        metadata = this.parseMetadataString(metaMatch[1]);
                        endLine = i;
                        i++;
                        break;
                    }

                    if (current.match(/^>\s*[!question]/i)) {
                        endLine = i - 1;
                        break;
                    }

                    if (current.match(/^>\s*[!answer]/i)) {
                        insideAnswer = true;
                        i++;
                        continue;
                    }

                    const clean = current.replace(/^>\s?/, '');
                    if (insideAnswer) {
                        answerLines.push(clean);
                    } else {
                        questionLines.push(clean);
                    }

                    endLine = i;
                    i++;
                }

                cards.push({
                    id: `${file.path}#${startLine}`,
                    filePath: file.path,
                    topic: file.basename,
                    sourceLecture,
                    lineStart: startLine,
                    lineEnd: endLine,
                    type,
                    concepts,
                    questionRaw: questionLines.join('\n').trim(),
                    answerRaw: answerLines.join('\n').trim(),
                    metadata
                });
                continue;
            }
            i++;
        }

        return cards;
    }

    async updateCardMetadata(card: PracticeCard, newMeta: CardMetadata): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(card.filePath);
        if (!(file instanceof TFile)) return;

        const content = await this.app.vault.read(file);
        const lines = content.split('\n');

        const metaString = `<!--pe-meta: due=${newMeta.due} ivl=${newMeta.interval} reps=${newMeta.reps} diff=${newMeta.difficulty} hist=${newMeta.history.join(',')} -->`;

        let metaIndex = -1;
        for (let j = card.lineStart; j <= Math.min(card.lineEnd + 1, lines.length - 1); j++) {
            if (lines[j]?.includes('<!--pe-meta:')) {
                metaIndex = j;
                break;
            }
        }

        if (metaIndex !== -1) {
            lines[metaIndex] = metaString;
        } else {
            lines.splice(card.lineEnd + 1, 0, metaString);
        }

        await this.app.vault.modify(file, lines.join('\n'));
    }

    private getDefaultMetadata(): CardMetadata {
        return {
            due: new Date().toISOString().split('T')[0],
            interval: 0,
            reps: 0,
            difficulty: 3.0,
            history: []
        };
    }

    private parseMetadataString(raw: string): CardMetadata {
        const parts = raw.split(/\s+/);
        const meta = this.getDefaultMetadata();

        for (const part of parts) {
            const [k, v] = part.split('=');
            if (k === 'due') meta.due = v;
            if (k === 'ivl') meta.interval = parseInt(v, 10);
            if (k === 'reps') meta.reps = parseInt(v, 10);
            if (k === 'diff') meta.difficulty = parseFloat(v);
            if (k === 'hist') meta.history = v ? v.split(',') : [];
        }
        return meta;
    }
}