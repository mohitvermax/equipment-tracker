// server.js - Node.js Backend for Equipment Tracker
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');

// Import Google News helper (create this file separately)
const {
  fetchEquipmentNews,
  fetchNewsByTopic,
  multiRegionSearch,
  getTrendingDefenseNews
} = require('./googleNewsHelper');

const app = express();
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

// Middleware
app.use(cors());
app.use(express.json());

// Constants
const ODIN_BASE_URL = 'https://odin.tradoc.army.mil';
const CASI_BASE_URL = 'https://www.airuniversity.af.edu/CASI/Articles';

/**
 * Search ODIN Database
 */
async function searchODIN(query) {
  try {
    const searchUrl = `${ODIN_BASE_URL}/Search/WEG/${encodeURIComponent(query)}`;
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const results = [];

    // Parse ODIN results
    $('.asset-card, .result-item').each((i, elem) => {
      const $elem = $(elem);
      results.push({
        name: $elem.find('.asset-title, h3').text().trim(),
        type: $elem.find('.asset-type, .type').text().trim(),
        description: $elem.find('.description, p').text().trim(),
        imageUrl: $elem.find('img').attr('src'),
        url: ODIN_BASE_URL + $elem.find('a').attr('href')
      });
    });

    return results;
  } catch (error) {
    console.error('ODIN search error:', error.message);
    return [];
  }
}

/**
 * Fetch detailed equipment info from ODIN
 */
async function getODINDetails(equipmentUrl) {
  try {
    const response = await axios.get(equipmentUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    const specifications = {};
    $('.specification-row, .spec-item').each((i, elem) => {
      const $elem = $(elem);
      const key = $elem.find('.spec-label, dt').text().trim();
      const value = $elem.find('.spec-value, dd').text().trim();
      if (key && value) {
        specifications[key] = value;
      }
    });

    return {
      fullName: $('h1, .equipment-title').first().text().trim(),
      description: $('.description, .overview').first().text().trim(),
      specifications,
      images: $('img.equipment-image, .gallery img').map((i, el) => $(el).attr('src')).get(),
      variants: $('.variant-list li').map((i, el) => $(el).text().trim()).get(),
      operators: $('.operator-list li').map((i, el) => $(el).text().trim()).get()
    };
  } catch (error) {
    console.error('ODIN details error:', error.message);
    return null;
  }
}

/**
 * Search CASI Articles
 */
async function searchCASI(query) {
  try {
    const searchUrl = `${CASI_BASE_URL}/Search?query=${encodeURIComponent(query)}`;
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const articles = [];

    $('.article-item, .result').each((i, elem) => {
      const $elem = $(elem);
      articles.push({
        title: $elem.find('h3, .title').text().trim(),
        source: 'Air University CASI',
        date: $elem.find('.date').text().trim(),
        type: 'Research Article',
        url: CASI_BASE_URL + $elem.find('a').attr('href')
      });
    });

    return articles;
  } catch (error) {
    console.error('CASI search error:', error.message);
    return [];
  }
}

/**
 * Search Google News using helper function
 */
async function searchGoogleNews(query) {
  try {
    return await fetchEquipmentNews(query, 'US', 10);
  } catch (error) {
    console.error('Google News error:', error.message);
    return [];
  }
}

/**
 * Search regional news using helper function
 */
async function searchRegionalNews(query, region = 'IN') {
  try {
    return await fetchEquipmentNews(query, region, 5);
  } catch (error) {
    console.error('Regional news error:', error.message);
    return [];
  }
}

/**
 * Main search endpoint
 */
app.get('/api/search', async (req, res) => {
  try {
    const { query, region = 'IN' } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    // Check cache
    const cacheKey = `search_${query}_${region}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Parallel searches
    const [odinResults, casiArticles, globalNews, regionalNews] = await Promise.all([
      searchODIN(query),
      searchCASI(query),
      searchGoogleNews(query),
      searchRegionalNews(query, region)
    ]);

    // Get detailed info for first result
    let detailedInfo = null;
    if (odinResults.length > 0 && odinResults[0].url) {
      detailedInfo = await getODINDetails(odinResults[0].url);
    }

    const result = {
      query,
      equipment: detailedInfo || {
        name: query,
        fullName: odinResults[0]?.name || query,
        description: odinResults[0]?.description || 'No description available',
        specifications: {},
        images: odinResults.map(r => r.imageUrl).filter(Boolean),
        variants: [],
        operators: []
      },
      odinResults,
      news: [...globalNews, ...regionalNews]
        .map(article => ({
          title: article.title,
          source: article.source,
          date: article.date,
          url: article.link || article.url,
          excerpt: article.excerpt || article.description
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
      articles: casiArticles,
      timestamp: new Date().toISOString()
    };

    // Cache result
    cache.set(cacheKey, result);

    res.json(result);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * Image search endpoint (for future implementation)
 */
app.post('/api/search/image', async (req, res) => {
  try {
    const { imageUrl, imageData } = req.body;

    // TODO: Implement image recognition using:
    // - Google Cloud Vision API
    // - AWS Rekognition
    // - Custom ML model

    res.json({
      message: 'Image search not yet implemented',
      suggestion: 'Use text search for now'
    });
  } catch (error) {
    console.error('Image search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get trending/recent equipment
 */
app.get('/api/trending', async (req, res) => {
  try {
    const trending = [
      'BrahMos',
      'F-35',
      'S-400',
      'HIMARS',
      'Javelin',
      'Patriot',
      'Leopard 2',
      'Abrams'
    ];

    res.json({ trending });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Equipment Tracker API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;