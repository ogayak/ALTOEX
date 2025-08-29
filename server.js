// server.js
const express = require("express");
const axios = require("axios");
const NodeCache = require("node-cache");
const path = require("path");

const app = express();
const cache = new NodeCache({ stdTTL: 30 }); // cache for 2 minutes
const PORT = 5000;

// Serve frontend (since all files are directly in project-root)
app.use(express.static(__dirname));

// API proxy with caching (multiple coins supported)
app.get("/api/price", async (req, res) => {
  const ids = req.query.ids; // e.g. /api/price?ids=bitcoin,ethereum,solana

  if (!ids) {
    return res.status(400).json({ error: "Please provide ?ids=bitcoin,ethereum" });
  }

  const cacheKey = `price_${ids}`;

  if (cache.has(cacheKey)) {
    return res.json({ source: "cache", data: cache.get(cacheKey) });
  }

  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
    );

    const data = response.data;
    cache.set(cacheKey, data);

    res.json({ source: "api", data });
  } catch (error) {
    console.error("Error fetching prices:", error.message);
    res.status(500).json({ error: "Failed to fetch price data" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
