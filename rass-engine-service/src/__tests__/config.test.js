// rass-engine-service/src/__tests__/config.test.js
// Unit tests for the centralized config loading module.

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
  OPENAI_EMBED_MODEL_NAME: "text-embedding-3-large",
  GEMINI_EMBED_MODEL_NAME: "text-embedding-004",
  OPENSEARCH_HOST: "opensearch",
  OPENSEARCH_PORT: 9200,
  OPENSEARCH_INDEX_NAME: "knowledge_base",
  RASS_ENGINE_PORT: 8000,
  DEFAULT_K_OPENSEARCH_HITS: 112,
  EMBED_DIM: 768,
  search: { DEFAULT_TOP_K: 50 },
};

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
    expect(config.DEFAULT_K_OPENSEARCH_HITS).toBe(112);
    expect(config.DEFAULT_TOP_K).toBe(50);
    expect(config.OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS).toBe("text-embedding-3-large");
  });

  test("throws a descriptive error when a required field is missing", () => {
    const missingFieldConfig = { ...VALID_CONFIG };
    delete missingFieldConfig.OPENSEARCH_HOST;
    fs.readFileSync.mockReturnValue(yaml.dump(missingFieldConfig));

    expect(() => loadConfig()).toThrow(/OPENSEARCH_HOST/);
  });

  test("throws when search.DEFAULT_TOP_K is missing", () => {
    const badConfig = { ...VALID_CONFIG, search: {} };
    fs.readFileSync.mockReturnValue(yaml.dump(badConfig));

    expect(() => loadConfig()).toThrow(/search\.DEFAULT_TOP_K/);
  });

  test("throws when LLM_PROVIDER has an invalid value", () => {
    const badConfig = { ...VALID_CONFIG, LLM_PROVIDER: "anthropic" };
    fs.readFileSync.mockReturnValue(yaml.dump(badConfig));

    expect(() => loadConfig()).toThrow(/LLM_PROVIDER/);
  });

  test("throws a descriptive error when config.yml cannot be read", () => {
    fs.readFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    expect(() => loadConfig()).toThrow(/Failed to read or parse config\.yml/);
  });
});

