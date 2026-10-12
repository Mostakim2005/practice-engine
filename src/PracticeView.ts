import { ItemView, WorkspaceLeaf, MarkdownRenderer } from 'obsidian';
import { CardParser } from './CardParser';
import { PracticeScheduler } from './PracticeScheduler';
import { ConceptualAccuracy, PracticeCard, RetrievalEffort } from './types';

export const PRACTICE_VIEW_TYPE = 'practice-engine-view';

export class PracticeView extends ItemView {
    private parser: CardParser;
    private queue: PracticeCard[] = [];
    private currentIndex = 0;
    
    private selectedEffort: RetrievalEffort | null = null;
    private isAnswerRevealed = false;
    private checkedConcepts: Set<string> = new Set();

    constructor(leaf: WorkspaceLeaf, private getFolder: () => string) {
        super(leaf);
        this.parser = new CardParser(this.app);
    }

    getViewType(): string { return PRACTICE_VIEW_TYPE; }
    getDisplayText(): string { return 'Practice Session'; }

    async onOpen(): Promise<void> {
        await this.loadQueue();
        this.renderSession();
    }

    async loadQueue(): Promise<void> {
        const allCards = await this.parser.extractCardsFromFolder(this.getFolder());
        const today = new Date().toISOString().split('T')[0];
        this.queue = allCards.filter(c => c.metadata.due <= today);
        this.currentIndex = 0;
        this.resetCardState();
    }

    private resetCardState(): void {
        this.selectedEffort = null;
        this.isAnswerRevealed = false;
        this.checkedConcepts.clear();
    }

    renderSession(): void {
        const container = this.contentEl;
        container.empty();
        container.addClass('pe-practice-container');

        if (this.queue.length === 0 || this.currentIndex >= this.queue.length) {
            container.createEl('h3', { text: '🎉 Practice complete for today!' });
            const refreshBtn = container.createEl('button', { text: 'Refresh Queue' });
            refreshBtn.onclick = () => this.onOpen();
            return;
        }

        const card = this.queue[this.currentIndex];

        const header = container.createDiv('pe-header');
        header.createEl('span', { text: `📌 Topic: ${card.topic} | Type: ${card.type.toUpperCase()}`, cls: 'pe-badge' });
        
        if (card.sourceLecture) {
            const lectureLink = header.createEl('a', { text: ' 📖 Open Lecture Reference', cls: 'pe-lecture-link' });
            lectureLink.onclick = () => {
                if (card.sourceLecture?.startsWith('onenote:')) {
                    window.open(card.sourceLecture);
                } else {
                    const cleanLink = card.sourceLecture!.replace(/[[\]]/g, '');
                    this.app.workspace.openLinkText(cleanLink, card.filePath);
                }
            };
        }

        const questionEl = container.createDiv('pe-question-box');
        MarkdownRenderer.renderMarkdown(card.questionRaw, questionEl, card.filePath, this);

        const stage1Box = container.createDiv('pe-stage1-box');
        stage1Box.createEl('h4', { text: 'Stage 1: How does your retrieval feel?' });
        
        const effortOptions: { label: string; value: RetrievalEffort }[] = [
            { label: '⚡ Instant & Sure', value: 'FAST_CONFIDENT' },
            { label: '🧠 Needed Effort', value: 'EFFORTFUL' },
            { label: '🤔 Educated Guess', value: 'EDUCATED_GUESS' },
            { label: '❌ Total Blank', value: 'BLANK' }
        ];

        const effortBtnContainer = stage1Box.createDiv('pe-btn-group');
        effortOptions.forEach(opt => {
            const btn = effortBtnContainer.createEl('button', { text: opt.label });
            if (this.selectedEffort === opt.value) btn.addClass('is-selected');
            btn.onclick = () => {
                this.selectedEffort = opt.value;
                this.renderSession();
            };
        });

        if (!this.isAnswerRevealed) {
            const revealBtn = container.createEl('button', { 
                text: 'Reveal Answer', 
                cls: 'mod-cta pe-reveal-btn' 
            });
            revealBtn.disabled = !this.selectedEffort;
            revealBtn.onclick = () => {
                this.isAnswerRevealed = true;
                this.renderSession();
            };
            return;
        }

        const answerBox = container.createDiv('pe-answer-box');
        answerBox.createEl('h4', { text: 'Answer' });
        MarkdownRenderer.renderMarkdown(card.answerRaw, answerBox, card.filePath, this);

        if (card.concepts.length > 0) {
            const conceptBox = container.createDiv('pe-concept-checklist');
            conceptBox.createEl('h5', { text: 'Sub-concepts accurately retrieved:' });
            card.concepts.forEach(concept => {
                const row = conceptBox.createDiv('pe-checkbox-row');
                const cb = row.createEl('input', { type: 'checkbox' });
                cb.checked = this.checkedConcepts.has(concept);
                cb.onchange = () => {
                    if (cb.checked) this.checkedConcepts.add(concept);
                    else this.checkedConcepts.delete(concept);
                };
                row.createSpan({ text: ` ${concept}` });
            });
        }

        const ratingBox = container.createDiv('pe-rating-box');
        ratingBox.createEl('h4', { text: 'Stage 2: Evaluate Outcome' });
        
        const accuracyOptions: { label: string; value: ConceptualAccuracy; cls: string }[] = [
            { label: 'Flawless', value: 'FLAWLESS', cls: 'pe-btn-good' },
            { label: 'Factual Slip', value: 'FACTUAL_SLIP', cls: 'pe-btn-mid' },
            { label: 'Partial Concepts', value: 'PARTIAL_CONCEPTS', cls: 'pe-btn-mid' },
            { label: 'Conceptual Misunderstanding', value: 'CONCEPTUAL_FLAW', cls: 'pe-btn-bad' },
            { label: 'Total Failure', value: 'TOTAL_FAILURE', cls: 'pe-btn-bad' }
        ];

        const ratingBtnGroup = ratingBox.createDiv('pe-btn-group');
        accuracyOptions.forEach(opt => {
            const btn = ratingBtnGroup.createEl('button', { text: opt.label, cls: opt.cls });
            btn.onclick = async () => {
                await this.submitReview(card, this.selectedEffort!, opt.value);
            };
        });
    }

    private async submitReview(
        card: PracticeCard, 
        effort: RetrievalEffort, 
        accuracy: ConceptualAccuracy
    ): Promise<void> {
        const updatedMeta = PracticeScheduler.calculateNextReview(card.metadata, effort, accuracy);
        await this.parser.updateCardMetadata(card, updatedMeta);
        
        this.currentIndex++;
        this.resetCardState();
        this.renderSession();
    }
}