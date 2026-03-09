const { BaseStore } = require("@langchain/core/stores");

class RedisDocumentStore extends BaseStore {
  constructor(redisClient, keyPrefix = "docstore:") {
    super();
    this.redis = redisClient;
    this.keyPrefix = keyPrefix;
    console.log("[RedisDocumentStore] Initialized with prefix:", keyPrefix);
  }

  async mget(keys) {
    try {
      const prefixedKeys = keys.map((key) => `${this.keyPrefix}${key}`);
      const values = await this.redis.mget(...prefixedKeys);

      const results = values.map((value, index) => {
        if (value === null) {
          console.warn(`[RedisDocumentStore] Key not found: ${keys[index]}`);
          return null;
        }
        try {
          return JSON.parse(value);
        } catch (error) {
          console.error(
            `[RedisDocumentStore] Failed to parse value for key ${keys[index]}:`,
            error
          );
          return null;
        }
      });

      console.log(
        `[RedisDocumentStore] Retrieved ${
          results.filter((r) => r !== null).length
        }/${keys.length} documents`
      );

      return results;
    } catch (error) {
      console.error("[RedisDocumentStore] Error in mget:", error);
      throw error;
    }
  }

  async mset(keyValuePairs) {
    try {
      const pipeline = this.redis.pipeline();

      for (const [key, value] of keyValuePairs) {
        const prefixedKey = `${this.keyPrefix}${key}`;
        const serializedValue = JSON.stringify(value);
        pipeline.set(prefixedKey, serializedValue);
      }

      await pipeline.exec();
      console.log(
        `[RedisDocumentStore] Stored ${keyValuePairs.length} documents`
      );
    } catch (error) {
      console.error("[RedisDocumentStore] Error in mset:", error);
      throw error;
    }
  }

  async mdelete(keys) {
    try {
      const prefixedKeys = keys.map((key) => `${this.keyPrefix}${key}`);
      const result = await this.redis.del(...prefixedKeys);
      console.log(`[RedisDocumentStore] Deleted ${result} documents`);
      return result;
    } catch (error) {
      console.error("[RedisDocumentStore] Error in mdelete:", error);
      throw error;
    }
  }

  async yieldKeys(prefix) {
    try {
      const pattern = `${this.keyPrefix}${prefix || ""}*`;
      const keys = await this.redis.keys(pattern);
      return keys.map((key) => key.replace(this.keyPrefix, ""));
    } catch (error) {
      console.error("[RedisDocumentStore] Error in yieldKeys:", error);
      throw error;
    }
  }
}

module.exports = { RedisDocumentStore };
