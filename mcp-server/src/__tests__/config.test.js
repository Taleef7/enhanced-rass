// mcp-server/src/__tests__/config.test.js
// Unit tests for the centralized config loading module.

"use strict";

const yaml = require("js-yaml");

// Mock the built-in 'fs' module so tests don't need a real config.yml on disk.
jest.mock("fs");
const fs = require("fs");

const VALID_CONFIG = {
  MCP_SERVER_PORT: 8080,
  OPENSEARCH_HOST: "opensearch",
  OPENSEARCH_PORT: 9200,
  OPENSEARCH_INDEX_NAME: "knowledge_base",
  RASS_ENGINE_PORT: 8000,
  EMBEDDING_SERVICE_PORT: 8001,
};

function loadConfig() {
  let configModule;
  jest.isolateModules(() => {
    configModule = require("../config");
  });
  return configModule;
}

describe("mcp-server/src/config.js", () => {
  test("loads and exports all required fields from a valid config.yml", () => {
    fs.readFileSync.mockReturnValue(yaml.dump(VALID_CONFIG));
    const config = loadConfig();

    expect(config.MCP_SERVER_PORT).toBe(8080);
    expect(config.OPENSEARCH_HOST).toBe("opensearch");
    expect(config.OPENSEARCH_PORT).toBe(9200);
    expect(config.OPENSEARCH_INDEX_NAME).toBe("knowledge_base");
    expect(config.RASS_ENGINE_PORT).toBe(8000);
    expect(config.EMBEDDING_SERVICE_PORT).toBe(8001);
  });

  test("exports derived base URLs built from config ports", () => {
    fs.readFileSync.mockReturnValue(yaml.dump(VALID_CONFIG));
    const config = loadConfig();

    expect(config.RASS_ENGINE_BASE_URL).toBe("http://rass-engine-service:8000");
    expect(config.EMBEDDING_SERVICE_BASE_URL).toBe("http://embedding-service:8001");
  });

  test("throws a descriptive error when a required field is missing", () => {
    const missingFieldConfig = { ...VALID_CONFIG };
    delete missingFieldConfig.OPENSEARCH_INDEX_NAME;
    fs.readFileSync.mockReturnValue(yaml.dump(missingFieldConfig));

    expect(() => loadConfig()).toThrow(/OPENSEARCH_INDEX_NAME/);
  });

  test("throws when RASS_ENGINE_PORT is missing", () => {
    const missingFieldConfig = { ...VALID_CONFIG };
    delete missingFieldConfig.RASS_ENGINE_PORT;
    fs.readFileSync.mockReturnValue(yaml.dump(missingFieldConfig));

    expect(() => loadConfig()).toThrow(/RASS_ENGINE_PORT/);
  });

  test("throws a descriptive error when config.yml cannot be read", () => {
    fs.readFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    expect(() => loadConfig()).toThrow(/Failed to read or parse config\.yml/);
  });
});
