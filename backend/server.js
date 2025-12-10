// server.js - Updated with enhanced ODIN scraping
const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');

// Import modules
const {
  fetchEquipmentNews,
  multiRegionSearch,
  getTrendingDefenseNews
} = require('./googleNewsHelper');

const {
  searchODIN,
  parseEquipmentData
} = require('./odinScraper');

const app = express();
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

// Middleware
app.use(cors());
app.use(express.json());

/**
 * Main search endpoint with enhanced ODIN scraping
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
      console.log('Returning cached result');
      return res.json(cached);
    }

    console.log(`New search request: ${query}`);

    // Search ODIN with modal handling (this takes longer)
    const odinResult = await searchODIN(query);
    
    // Fetch news in parallel while ODIN loads
    const newsPromise = fetchEquipmentNews(query, region, 15);
    const globalNewsPromise = fetchEquipmentNews(query, 'US', 10);
    
    const [regionalNews, globalNews] = await Promise.all([
      newsPromise.catch(err => {
        console.error('Regional news error:', err);
        return [];
      }),
      globalNewsPromise.catch(err => {
        console.error('Global news error:', err);
        return [];
      })
    ]);

    // Combine and deduplicate news
    const allNews = [...regionalNews, ...globalNews];
    const uniqueNews = Array.from(
      new Map(allNews.map(article => [article.link || article.title, article])).values()
    );

    // Sort by date
    uniqueNews.sort((a, b) => b.timestamp - a.timestamp);

    // Prepare response
    const result = {
      query,
      equipment: odinResult.success && odinResult.equipment ? {
        name: odinResult.equipment.name,
        fullName: odinResult.equipment.fullName,
        type: odinResult.equipment.type,
        description: odinResult.equipment.description,
        specifications: odinResult.equipment.specifications,
        images: odinResult.equipment.images,
        notes: odinResult.equipment.notes,
        intelligence: odinResult.equipment.intelligence,
        status: 'Active' // You can extract this from notes
      } : {
        name: query,
        fullName: query,
        type: 'Military Equipment',
        description: 'No detailed information available',
        specifications: {},
        images: [],
        notes: '',
        intelligence: {},
        status: 'Unknown'
      },
      
      // Variants and operators from ODIN
      variants: odinResult.success && odinResult.equipment ? 
        odinResult.equipment.variants : [],
      
      operators: odinResult.success && odinResult.equipment ? 
        odinResult.equipment.operators : [],
      
      // News formatted for frontend
      news: uniqueNews.slice(0, 20).map(article => ({
        title: article.title,
        source: article.source,
        date: article.date,
        url: article.link || article.url,
        excerpt: article.excerpt || article.description,
        region: article.region || region
      })),
      
      // Articles placeholder (can add CASI later)
      articles: [],
      
      // Metadata
      timestamp: new Date().toISOString(),
      dataSource: odinResult.success ? 'ODIN' : 'Limited',
      odinSuccess: odinResult.success
    };

    // Cache the result
    cache.set(cacheKey, result);

    res.json(result);

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message,
      query: req.query.query
    });
  }
});

/**
 * Generate detailed report endpoint
 */
app.post('/api/generate-report', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Get comprehensive data
    const cacheKey = `search_${query}_IN`;
    let data = cache.get(cacheKey);

    if (!data) {
      // Fetch fresh data
      const odinResult = await searchODIN(query);
      const news = await fetchEquipmentNews(query, 'IN', 20);

      data = {
        query,
        equipment: odinResult.equipment || {},
        news: news || [],
        variants: odinResult.equipment?.variants || [],
        operators: odinResult.equipment?.operators || []
      };
    }

    // Generate report document
    const report = generateReportDocument(data);

    res.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate report',
      message: error.message 
    });
  }
});

/**
 * Generate formatted report document
 */
function generateReportDocument(data) {
  const equipment = data.equipment;
  
  let report = `# INTELLIGENCE REPORT: ${equipment.fullName || data.query}\n\n`;
  report += `Generated: ${new Date().toLocaleString()}\n\n`;
  
  report += `## OVERVIEW\n\n`;
  report += `**Equipment Name:** ${equipment.fullName || data.query}\n`;
  report += `**Type:** ${equipment.type || 'Unknown'}\n`;
  report += `**Status:** ${equipment.status || 'Unknown'}\n\n`;
  report += `**Description:**\n${equipment.description || 'No description available'}\n\n`;
  
  if (equipment.notes) {
    report += `## DETAILED NOTES\n\n`;
    report += `${equipment.notes}\n\n`;
  }
  
  if (data.operators && data.operators.length > 0) {
    report += `## OPERATORS\n\n`;
    data.operators.forEach(op => {
      report += `- ${op}\n`;
    });
    report += `\n`;
  }
  
  if (data.variants && data.variants.length > 0) {
    report += `## VARIANTS\n\n`;
    data.variants.forEach(variant => {
      report += `- ${variant}\n`;
    });
    report += `\n`;
  }
  
  if (equipment.specifications && Object.keys(equipment.specifications).length > 0) {
    report += `## TECHNICAL SPECIFICATIONS\n\n`;
    Object.entries(equipment.specifications).forEach(([key, value]) => {
      report += `**${key}:** ${value}\n`;
    });
    report += `\n`;
  }
  
  if (equipment.intelligence) {
    const intel = equipment.intelligence;
    
    if (intel.system) {
      report += `## SYSTEM INFORMATION\n\n${intel.system}\n\n`;
    }
    
    if (intel.dimensions) {
      report += `## DIMENSIONS\n\n${intel.dimensions}\n\n`;
    }
    
    if (intel.payload) {
      report += `## PAYLOAD\n\n${intel.payload}\n\n`;
    }
    
    if (intel.propulsion) {
      report += `## PROPULSION CHARACTERISTICS\n\n${intel.propulsion}\n\n`;
    }
    
    if (intel.fireControl) {
      report += `## FIRE CONTROL\n\n${intel.fireControl}\n\n`;
    }
  }
  
  if (data.news && data.news.length > 0) {
    report += `## RECENT NEWS & DEVELOPMENTS\n\n`;
    data.news.slice(0, 10).forEach(article => {
      report += `### ${article.title}\n`;
      report += `**Source:** ${article.source} | **Date:** ${article.date}\n`;
      report += `${article.excerpt || article.description || ''}\n`;
      report += `**URL:** ${article.url || article.link}\n\n`;
    });
  }
  
  report += `---\n\n`;
  report += `*This report was automatically generated from multiple intelligence sources.*\n`;
  
  return report;
}

/**
 * Get trending equipment
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
      'Abrams',
      'Rafale',
      'Su-57'
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
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cacheSize: cache.keys().length
  });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Equipment Tracker API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log('Enhanced ODIN scraping enabled');
});

module.exports = app;