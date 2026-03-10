// embedding-service/src/__tests__/config.test.js
// Unit tests for the centralized config loading module (Zod-based validation).

"use strict";

const yaml = require("js-yaml");

// We mock 'fs-extra' so these tests don't need a real config.yml on disk.
jest.mock("fs-extra");
const fs = require("fs-extra");

const VALID_CONFIG = {
  EMBEDDING_PROVIDER: "openai",
  OPENSEARCH_HOST: "opensearch",
  OPENSEARCH_PORT: 9200,
  OPENSEARCH_INDEX_NAME: "knowledge_base",
  EMBEDDING_SERVICE_PORT: 8001,
  PARENT_CHUNK_SIZE: 2000,
  PARENT_CHUNK_OVERLAP: 500,
  CHILD_CHUNK_SIZE: 200,
  CHILD_CHUNK_OVERLAP: 100,
  EMBED_DIM: 1536,
  OPENAI_EMBED_MODEL_NAME: "text-embedding-3-large",
  GEMINI_EMBED_MODEL_NAME: "text-embedding-004",
  REDIS_HOST: "redis",
  REDIS_PORT: 6379,
  REDIS_DB: 0,
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

describe("embedding-service/src/config.js", () => {
  test("loads and exports all required fields from a valid config.yml", () => {
    fs.readFileSync.mockReturnValue(yaml.dump(VALID_CONFIG));
    const config = loadConfig();

    expect(config.EMBEDDING_PROVIDER).toBe("openai");
    expect(config.OPENSEARCH_HOST).toBe("opensearch");
    expect(config.OPENSEARCH_PORT).toBe(9200);
    expect(config.OPENSEARCH_INDEX_NAME).toBe("knowledge_base");
    expect(config.EMBEDDING_SERVICE_PORT).toBe(8001);
    expect(config.EMBED_DIM).toBe(1536);
    expect(config.REDIS_HOST).toBe("redis");
  });

  test("throws a descriptive error when a required field is missing", () => {
    const missingFieldConfig = { ...VALID_CONFIG };
    delete missingFieldConfig.OPENSEARCH_HOST;
    fs.readFileSync.mockReturnValue(yaml.dump(missingFieldConfig));

    expect(() => loadConfig()).toThrow(/process\.exit/);
  });

  test("throws when EMBEDDING_PROVIDER has an invalid value (e.g. 'Gemini')", () => {
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

