import { CardMetadata, ConceptualAccuracy, RetrievalEffort } from './types';

export class PracticeScheduler {
    static calculateNextReview(
        meta: CardMetadata,
        effort: RetrievalEffort,
        accuracy: ConceptualAccuracy
    ): CardMetadata {
        let { interval, reps, difficulty, history } = meta;

        const isConfidentError = effort === 'FAST_CONFIDENT' && 
            (accuracy === 'CONCEPTUAL_FLAW' || accuracy === 'TOTAL_FAILURE');

        let performanceMultiplier = 0.0;
        switch (accuracy) {
            case 'FLAWLESS':
                performanceMultiplier = effort === 'EFFORTFUL' ? 1.15 : 1.0;
                break;
            case 'FACTUAL_SLIP':
                performanceMultiplier = 0.75;
                break;
            case 'PARTIAL_CONCEPTS':
                performanceMultiplier = 0.50;
                break;
            case 'CONCEPTUAL_FLAW':
                performanceMultiplier = 0.10;
                break;
            case 'TOTAL_FAILURE':
                performanceMultiplier = 0.0;
                break;
        }

        if (effort === 'EDUCATED_GUESS') {
            performanceMultiplier *= 0.6;
        }

        if (performanceMultiplier < 0.6 || isConfidentError) {
            reps = 0;
            interval = 1;
            difficulty = Math.min(5.0, Number((difficulty + (isConfidentError ? 0.6 : 0.3)).toFixed(2)));
        } else {
            reps += 1;
            if (reps === 1) {
                interval = effort === 'FAST_CONFIDENT' ? 2 : 1;
            } else if (reps === 2) {
                interval = Math.round(4 * performanceMultiplier);
            } else {
                const ease = Math.max(1.3, 2.8 - (difficulty * 0.3));
                interval = Math.round(interval * ease * performanceMultiplier);
            }
            if (accuracy === 'FLAWLESS' && effort === 'FAST_CONFIDENT') {
                difficulty = Math.max(1.0, Number((difficulty - 0.15).toFixed(2)));
            }
        }

        interval = Math.max(1, interval);
        const nextDueDate = new Date();
        nextDueDate.setDate(nextDueDate.getDate() + interval);
        const dueString = nextDueDate.toISOString().split('T')[0];

        const record = `${dueString}:${effort.substring(0, 2)}:${accuracy.substring(0, 2)}`;
        const updatedHistory = [...(history || []), record].slice(-10);

        return {
            due: dueString,
            interval,
            reps,
            difficulty,
            history: updatedHistory
        };
    }
}