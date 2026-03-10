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
  });

  test("throws a descriptive error when a required field is missing", () => {
    const missingFieldConfig = { ...VALID_CONFIG };
    delete missingFieldConfig.OPENSEARCH_INDEX_NAME;
    fs.readFileSync.mockReturnValue(yaml.dump(missingFieldConfig));

    expect(() => loadConfig()).toThrow(/OPENSEARCH_INDEX_NAME/);
  });

  test("throws a descriptive error when config.yml cannot be read", () => {
    fs.readFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    expect(() => loadConfig()).toThrow(/Failed to read or parse config\.yml/);
  });
});
