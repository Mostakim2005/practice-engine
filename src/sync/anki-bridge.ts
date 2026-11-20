import { requestUrl } from "obsidian";
import type { IndexedCard, PracticeSettings } from "../types";

export class AnkiBridge {
  constructor(private getSettings: () => PracticeSettings) {}

  async invokeAnkiConnect<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const url = this.getSettings().ankiConnectUrl || "http://127.0.0.1:8765";
    const resp = await requestUrl({
      url,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ action, version: 6, params }),
    });
    const payload = resp.json as { result: T; error: string | null };
    if (payload.error) throw new Error(`AnkiConnect error (${action}): ${payload.error}`);
    return payload.result;
  }

  async pushCardToAnkiConnect(card: IndexedCard): Promise<number> {
    const settings = this.getSettings();
    const deckName = card.deck || settings.ankiDefaultDeck || "Practice Engine";
    await this.invokeAnkiConnect("createDeck", { deck: deckName });

    const fields = {
      Front: card.questionMd,
      Back: card.answerMd,
      PE_Meta: JSON.stringify(card.meta),
    };

    if (card.meta.ankiNoteId) {
      await this.invokeAnkiConnect("updateNoteFields", {
        note: { id: card.meta.ankiNoteId, fields },
      });
      return card.meta.ankiNoteId;
    }

    return await this.invokeAnkiConnect<number>("addNote", {
      note: {
        deckName,
        modelName: settings.ankiNoteType || "PracticeEngine-2Stage",
        fields,
        tags: [...card.tags, "practice-engine"],
      },
    });
  }

  /**
   * Formats a card block compatible with Obsidian_to_Anki (ObsidianToAnki/Obsidian_to_Anki).
   */
  formatObsidianToAnkiBlock(card: IndexedCard): string {
    const settings = this.getSettings();
    const deck = card.deck || settings.ankiDefaultDeck || "Practice Engine";
    const idLine = card.meta.ankiNoteId ? `<!--ID: ${card.meta.ankiNoteId}-->\n` : "";
    return [
      `TARGET DECK: ${deck}`,
      "START",
      settings.ankiNoteType || "Basic",
      card.questionMd,
      "Back:",
      card.answerMd,
      `Tags: ${card.tags.join(" ")}`,
      `${idLine}END`,
    ].join("\n");
  }

  /**
   * Exports review history in a JSON shape ready for FSRS4Anki parameter optimization.
   */
  exportFsrs4AnkiReviewLog(cards: IndexedCard[]): string {
    const rows = cards.flatMap((c) =>
      (c.meta.hist || []).map((entry) => {
        const [date, effort, accuracy] = entry.split(":");
        return {
          card_id: c.meta.id,
          anki_note_id: c.meta.ankiNoteId ?? null,
          review_date: date,
          effort_code: effort,
          accuracy_code: accuracy,
          stability: c.meta.s,
          difficulty: c.meta.d,
          lapses: c.meta.lapses,
        };
      })
    );
    return JSON.stringify({ format: "practice-engine-fsrs4anki-v1", reviews: rows }, null, 2);
  }
}
