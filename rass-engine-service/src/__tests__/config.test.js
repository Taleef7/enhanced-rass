// rass-engine-service/src/__tests__/config.test.js
// Unit tests for the centralized config loading module (Zod-based validation).

"use strict";

const yaml = require("js-yaml");

// Mock the built-in 'fs' module so tests don't need a real config.yml on disk.
jest.mock("fs");
const fs = require("fs");

const VALID_CONFIG = {
  LLM_PROVIDER: "openai",
  OPENAI_MODEL_NAME: "gpt-4.1-nano",
  GEMINI_MODEL_NAME: "gemini-2.0-flash",
  SEARCH_TERM_EMBEDDING_PROVIDER: "openai",
  EMBEDDING_PROVIDER: "openai",
  OPENAI_EMBED_MODEL_NAME: "text-embedding-3-large",
  GEMINI_EMBED_MODEL_NAME: "text-embedding-004",
  OPENSEARCH_HOST: "opensearch",
  OPENSEARCH_PORT: 9200,
  OPENSEARCH_INDEX_NAME: "knowledge_base",
  RASS_ENGINE_PORT: 8000,
  MCP_SERVER_PORT: 8080,
  EMBEDDING_SERVICE_PORT: 8001,
  DEFAULT_K_OPENSEARCH_HITS: 112,
  EMBED_DIM: 768,
  PARENT_CHUNK_SIZE: 2000,
  PARENT_CHUNK_OVERLAP: 500,
  CHILD_CHUNK_SIZE: 200,
  CHILD_CHUNK_OVERLAP: 100,
  REDIS_HOST: "redis",
  REDIS_PORT: 6379,
  REDIS_DB: 0,
  OPENSEARCH_SCORE_THRESHOLD: 0.1,
  search: { DEFAULT_TOP_K: 50 },
};

// Spy on process.exit so tests don't actually terminate
let exitSpy;
beforeAll(() => {
  exitSpy = jest.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`process.exit(${code})`);
  });
});
afterAll(() => exitSpy.mockRestore());

function loadConfig() {
  let configModule;
  jest.isolateModules(() => {
    configModule = require("../config");
  });
  return configModule;
}

describe("rass-engine-service/src/config.js", () => {
  test("loads and exports all required fields from a valid config.yml", () => {
    fs.readFileSync.mockReturnValue(yaml.dump(VALID_CONFIG));
    const config = loadConfig();

    expect(config.LLM_PROVIDER).toBe("openai");
    expect(config.OPENSEARCH_HOST).toBe("opensearch");
    expect(config.RASS_ENGINE_PORT).toBe(8000);
    expect(config.EMBEDDING_SERVICE_PORT).toBe(8001);
    expect(config.EMBEDDING_SERVICE_BASE_URL).toBe("http://embedding-service:8001");
    expect(config.DEFAULT_K_OPENSEARCH_HITS).toBe(112);
    expect(config.DEFAULT_TOP_K).toBe(50);
    expect(config.OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS).toBe("text-embedding-3-large");
  });

  test("throws a descriptive error when a required field is missing", () => {
    const missingFieldConfig = { ...VALID_CONFIG };
    delete missingFieldConfig.OPENSEARCH_HOST;
    fs.readFileSync.mockReturnValue(yaml.dump(missingFieldConfig));

    expect(() => loadConfig()).toThrow(/process\.exit/);
  });

  test("throws when EMBEDDING_SERVICE_PORT is missing", () => {
    const missingFieldConfig = { ...VALID_CONFIG };
    delete missingFieldConfig.EMBEDDING_SERVICE_PORT;
    fs.readFileSync.mockReturnValue(yaml.dump(missingFieldConfig));

    expect(() => loadConfig()).toThrow(/process\.exit/);
  });

  test("throws when search.DEFAULT_TOP_K is missing", () => {
    const badConfig = { ...VALID_CONFIG, search: {} };
    fs.readFileSync.mockReturnValue(yaml.dump(badConfig));

    expect(() => loadConfig()).toThrow(/process\.exit/);
  });

  test("throws when LLM_PROVIDER has an invalid value (e.g. 'anthropic')", () => {
    const badConfig = { ...VALID_CONFIG, LLM_PROVIDER: "anthropic" };
    fs.readFileSync.mockReturnValue(yaml.dump(badConfig));

    expect(() => loadConfig()).toThrow(/process\.exit/);
  });

  test("throws when EMBEDDING_PROVIDER is 'Gemini' (wrong case)", () => {
    const badConfig = { ...VALID_CONFIG, EMBEDDING_PROVIDER: "Gemini" };
    fs.readFileSync.mockReturnValue(yaml.dump(badConfig));

    expect(() => loadConfig()).toThrow(/process\.exit/);
  });

  test("throws when EMBED_DIM is negative", () => {
    const badConfig = { ...VALID_CONFIG, EMBED_DIM: -1 };
    fs.readFileSync.mockReturnValue(yaml.dump(badConfig));

    expect(() => loadConfig()).toThrow(/process\.exit/);
  });

  test("throws when PARENT_CHUNK_OVERLAP >= PARENT_CHUNK_SIZE (cross-field validation)", () => {
    const badConfig = {
      ...VALID_CONFIG,
      PARENT_CHUNK_OVERLAP: 2000,
      PARENT_CHUNK_SIZE: 2000,
    };
    fs.readFileSync.mockReturnValue(yaml.dump(badConfig));

    expect(() => loadConfig()).toThrow(/process\.exit/);
  });

  test("throws when CHILD_CHUNK_OVERLAP >= CHILD_CHUNK_SIZE (cross-field validation)", () => {
    const badConfig = {
      ...VALID_CONFIG,
      CHILD_CHUNK_OVERLAP: 200,
      CHILD_CHUNK_SIZE: 200,
    };
    fs.readFileSync.mockReturnValue(yaml.dump(badConfig));

    expect(() => loadConfig()).toThrow(/process\.exit/);
  });

  test("throws a descriptive error when config.yml cannot be read", () => {
    fs.readFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    expect(() => loadConfig()).toThrow(/Failed to read or parse config\.yml/);
  });
});

