async function handleGetDocuments(req, res, dependencies) {
  const { docstore } = dependencies;
  const { ids } = req.body;

  console.log(`[get-documents] Request for ${ids?.length || 0} IDs.`);

  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: "Invalid request body." });
  }

  try {
    if (!docstore) {
      return res
        .status(503)
        .json({ error: "Document store is not initialized." });
    }

    const documents = await docstore.mget(ids);

    console.log(
      `[get-documents] Found ${documents.filter((d) => d).length} documents.`
    );

    res.status(200).json({ documents });
  } catch (error) {
    console.error("[get-documents] Error:", error);
    res.status(500).json({ error: "Failed to retrieve documents." });
  }
}

module.exports = { handleGetDocuments };
