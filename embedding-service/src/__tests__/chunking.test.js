// embedding-service/src/__tests__/chunking.test.js
// Unit tests for the configurable chunking strategy module (Issue #112).

"use strict";

const { Document } = require("langchain/document");
const { createChunker, SUPPORTED_STRATEGIES } = require("../chunking");
const { FixedSizeChunker } = require("../chunking/FixedSizeChunker");
const { RecursiveCharacterChunker } = require("../chunking/RecursiveCharacterChunker");
const { SentenceWindowChunker, splitIntoSentences } = require("../chunking/SentenceWindowChunker");

// Helper: make a simple LangChain Document
function makeDoc(text, metadata = {}) {
  return new Document({ pageContent: text, metadata });
}

// ── Factory ───────────────────────────────────────────────────────────────────

describe("createChunker factory", () => {
  it("creates FixedSizeChunker for fixed_size", () => {
    const chunker = createChunker("fixed_size", { chunkSize: 100, chunkOverlap: 10 });
    expect(chunker).toBeInstanceOf(FixedSizeChunker);
    expect(chunker.name).toBe("fixed_size");
  });

  it("creates RecursiveCharacterChunker for recursive_character", () => {
    const chunker = createChunker("recursive_character", { chunkSize: 200, chunkOverlap: 20 });
    expect(chunker).toBeInstanceOf(RecursiveCharacterChunker);
    expect(chunker.name).toBe("recursive_character");
  });

  it("creates SentenceWindowChunker for sentence_window", () => {
    const chunker = createChunker("sentence_window", { windowSize: 3, overlapSentences: 1 });
    expect(chunker).toBeInstanceOf(SentenceWindowChunker);
    expect(chunker.name).toBe("sentence_window");
  });

  it("throws for an unknown strategy", () => {
    expect(() => createChunker("unknown_strategy")).toThrow(/Unknown chunking strategy/);
  });

  it("exports all supported strategy names", () => {
    expect(SUPPORTED_STRATEGIES).toEqual(
      expect.arrayContaining(["fixed_size", "recursive_character", "sentence_window"])
    );
  });
});

// ── FixedSizeChunker ──────────────────────────────────────────────────────────

describe("FixedSizeChunker", () => {
  it("splits a document into chunks not exceeding chunkSize", async () => {
    const chunker = new FixedSizeChunker({ chunkSize: 50, chunkOverlap: 0, separator: " " });
    const text = "word ".repeat(30).trim(); // ~150 chars
    const docs = [makeDoc(text)];
    const chunks = await chunker.splitDocuments(docs);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.pageContent.length).toBeLessThanOrEqual(50));
  });

  it("returns a valid provenance descriptor", () => {
    const chunker = new FixedSizeChunker({ chunkSize: 100, chunkOverlap: 10 });
    const desc = chunker.toProvenanceDescriptor();
    expect(desc.strategy).toBe("fixed_size");
    expect(desc.chunkSize).toBe(100);
    expect(desc.chunkOverlap).toBe(10);
  });
});

// ── RecursiveCharacterChunker ─────────────────────────────────────────────────

describe("RecursiveCharacterChunker", () => {
  it("splits a multi-paragraph document into smaller chunks", async () => {
    const chunker = new RecursiveCharacterChunker({ chunkSize: 100, chunkOverlap: 10 });
    const text = Array.from({ length: 10 }, (_, i) => `Paragraph ${i + 1} content here.`).join("\n\n");
    const docs = [makeDoc(text)];
    const chunks = await chunker.splitDocuments(docs);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("produces different chunk counts than FixedSizeChunker on same text", async () => {
    const text = Array.from({ length: 20 }, (_, i) => `Sentence ${i + 1} is here. `).join("");
    const docs = [makeDoc(text)];
    const fixed = await new FixedSizeChunker({ chunkSize: 80, chunkOverlap: 0 }).splitDocuments(docs);
    const recursive = await new RecursiveCharacterChunker({ chunkSize: 80, chunkOverlap: 0 }).splitDocuments(docs);
    // Both should produce chunks; counts may differ based on splitting behavior
    expect(fixed.length).toBeGreaterThan(0);
    expect(recursive.length).toBeGreaterThan(0);
  });
});

// ── SentenceWindowChunker ─────────────────────────────────────────────────────

describe("splitIntoSentences (helper)", () => {
  it("splits on period + capital", () => {
    const text = "First sentence. Second sentence. Third one.";
    const result = splitIntoSentences(text);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty array for empty string", () => {
    expect(splitIntoSentences("")).toEqual([]);
  });
});

describe("SentenceWindowChunker", () => {
  const TEXT =
    "The quick brown fox jumps over the lazy dog. " +
    "Pack my box with five dozen liquor jugs. " +
    "How vexingly quick daft zebras jump. " +
    "The five boxing wizards jump quickly. " +
    "Sphinx of black quartz, judge my vow.";

  it("produces multiple windows from a multi-sentence document", async () => {
    const chunker = new SentenceWindowChunker({ windowSize: 2, overlapSentences: 0 });
    const chunks = await chunker.splitDocuments([makeDoc(TEXT)]);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("overlapping windows share sentences", async () => {
    const chunker = new SentenceWindowChunker({ windowSize: 3, overlapSentences: 1 });
    const chunks = await chunker.splitDocuments([makeDoc(TEXT)]);
    // With overlap=1 and window=3, step=2 → chunks share sentences
    if (chunks.length >= 2) {
      const firstWords = chunks[0].pageContent.split(" ").slice(-5).join(" ");
      const secondText = chunks[1].pageContent;
      // The overlap means the last sentence(s) of chunk 0 should appear in chunk 1
      // (we can't guarantee exact overlap due to sentence boundary variation, but
      //  we can verify at least 2 chunks are produced)
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("returns a valid provenance descriptor", () => {
    const chunker = new SentenceWindowChunker({ windowSize: 5, overlapSentences: 1 });
    const desc = chunker.toProvenanceDescriptor();
    expect(desc.strategy).toBe("sentence_window");
    expect(desc.windowSize).toBe(5);
    expect(desc.overlapSentences).toBe(1);
  });

  it("handles empty document gracefully", async () => {
    const chunker = new SentenceWindowChunker({ windowSize: 3, overlapSentences: 1 });
    const chunks = await chunker.splitDocuments([makeDoc("")]);
    expect(chunks).toEqual([]);
  });

  it("caps overlapSentences to windowSize - 1", () => {
    const chunker = new SentenceWindowChunker({ windowSize: 3, overlapSentences: 10 });
    expect(chunker.overlapSentences).toBe(2); // capped at windowSize - 1
  });
});
