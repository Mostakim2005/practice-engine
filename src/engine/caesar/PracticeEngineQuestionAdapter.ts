import {
	Question,
} from "../../types/question";
import { QuestionDescriptor, RepresentationType } from "./types";

const representationFromQuestion = (
	q: Question,
): RepresentationType => {
	if (q.diagram) {
		if (q.diagram.type === "table") return "data";
		return "diagram";
	}
	if (q.solution) return "numerical";
	if (q.type === "viva") return "verbal";
	if (q.type === "numerical") return "numerical";
	if (q.questionFamily === "diagram-analysis") return "diagram";
	if (q.questionFamily === "data-analysis") return "data";
	if (q.questionFamily === "calculation") return "symbolic";
	if (q.type === "multi-part") return "mixed";
	return "verbal";
};

export function toCAESARQuestion(
	q: Question,
): QuestionDescriptor {
	return {
		id: q.id,
		version: q.version,
		subject: q.subject,
		topic: q.topic,
		subtopic: q.subtopic,
		conceptIds: q.knowledgeConcepts ?? [],
		difficulty: q.difficulty,
		cognitiveLevel: q.cognitiveLevel,
		questionFamily: q.questionFamily,
		type: q.type,
		representationType: representationFromQuestion(q),
		verified: q.verification?.status === "verified",
		prerequisites: q.relationships?.prerequisites ?? [],
		contrastsWith: q.relationships?.contrastsWith ?? [],
		relatedConceptIds: q.relationships?.related ?? [],
		importance: q.tags?.some((tag) =>
			/exam|high[- ]?yield|important/i.test(tag),
		) ? 0.80 : 0.50,
		supportedInterventions: undefined,
		estimatedTimeMs: estimateQuestionTime(q),
	};
}

function estimateQuestionTime(q: Question): number {
	const base: Record<string, number> = {
		mcq: 45_000,
		"multiple-select": 60_000,
		"true-false": 30_000,
		written: 120_000,
		numerical: 150_000,
		matching: 75_000,
		ordering: 75_000,
		identification: 60_000,
		viva: 120_000,
		"multi-part": 210_000,
	};

	const familyMultiplier =
		q.type === "multi-part"
			? 1.35
			: q.questionFamily === "diagnosis" ||
					q.questionFamily === "troubleshooting" ||
					q.questionFamily === "design-decision"
				? 1.20
				: 1;

	const baseTime = base[q.type] ?? 90_000;

	return Math.max(
		20_000,
		Math.round(
			baseTime *
				familyMultiplier *
				(1 + (q.difficulty - 3) * 0.15),
		),
	);
}
