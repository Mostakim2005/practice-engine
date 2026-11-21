import { requestUrl } from "obsidian";
import type { IndexedCard, PracticeSettings } from "../types";

export class AnkiBridge {
  private ensuredDecks = new Set<string>();
  private ensuredModels = new Set<string>();

  constructor(private getSettings: () => PracticeSettings) {}

  resetSessionCache(): void {
    this.ensuredDecks.clear();
    this.ensuredModels.clear();
  }

  async invokeAnkiConnect<T = unknown>(
    action: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const url = (this.getSettings().ankiConnectUrl || "http://127.0.0.1:8765").trim();
    const resp = await requestUrl({
      url,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ action, version: 6, params }),
    });
    const payload = resp.json as { result: T; error: string | null };
    if (payload.error) {
      throw new Error(`AnkiConnect error (${action}): ${payload.error}`);
    }
    return payload.result;
  }

  async checkConnection(): Promise<{ ok: boolean; version?: number; error?: string }> {
    try {
      const version = await this.invokeAnkiConnect<number>("version");
      return { ok: true, version };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async ensureDeck(deckName: string): Promise<void> {
    if (this.ensuredDecks.has(deckName)) return;
    await this.invokeAnkiConnect("createDeck", { deck: deckName });
    this.ensuredDecks.add(deckName);
  }

  async ensureModel(modelName: string): Promise<void> {
    if (this.ensuredModels.has(modelName)) return;
    const existing = await this.invokeAnkiConnect<string[]>("modelNames");
    if (!existing.includes(modelName)) {
      await this.invokeAnkiConnect("createModel", {
        modelName,
        inOrderFields: ["Front", "Back", "PE_Meta"],
        cardTemplates: [
          {
            Name: "Card 1",
            Front: "{{Front}}",
            Back: "{{FrontSide}}<hr id=answer>{{Back}}",
          },
        ],
      });
    }
    this.ensuredModels.add(modelName);
  }

  async pushCardToAnkiConnect(card: IndexedCard): Promise<number> {
    const settings = this.getSettings();
    const deckName = card.deck || settings.ankiDefaultDeck || "Practice Engine";
    const modelName = settings.ankiNoteType || "PracticeEngine-2Stage";

    await this.ensureDeck(deckName);
    await this.ensureModel(modelName);

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
        modelName,
        fields,
        tags: Array.from(new Set([...card.tags, "practice-engine"])),
        options: {
          allowDuplicate: false,
          duplicateScope: "deck",
        },
      },
    });
  }

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

  exportFsrs4AnkiReviewLog(cards: IndexedCard[]): string {
    const rows = cards.flatMap((c) =>
      (c.meta.hist || []).map((entry) => {
        const [date, effort, accuracy] = entry.split(":");
        return {
          card_id: c.meta.id,
          anki_note_id: c.meta.ankiNoteId ?? null,
          review_date: date ?? "",
          effort_code: effort ?? "",
          accuracy_code: accuracy ?? "",
          stability: c.meta.s,
          difficulty: c.meta.d,
          lapses: c.meta.lapses,
        };
      })
    );
    return JSON.stringify({ format: "practice-engine-fsrs4anki-v1", reviews: rows }, null, 2);
  }
}
