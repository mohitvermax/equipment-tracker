// enhanced-server.js - Complete Equipment Intelligence Backend
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');
const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } = require('docx');
const fs = require('fs');
const path = require('path');

const app = express();
const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache

// Middleware
app.use(cors());
app.use(express.json());

// In-memory task tracking
const activeTasks = {};

// Import Google News helper
const {
  fetchEquipmentNews,
  fetchNewsByTopic,
  multiRegionSearch
} = require('./googleNewsHelper');

// Constants
const ODIN_BASE_URL = 'https://odin.tradoc.army.mil';
const CASI_BASE_URL = 'https://www.airuniversity.af.edu/CASI/Articles';

/**
 * COMPREHENSIVE SCRAPING - ODIN Database
 */
async function searchODIN(query, deepScrape = true) {
  try {
    const searchUrl = `${ODIN_BASE_URL}/Search/WEG/${encodeURIComponent(query)}`;
    const response = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const results = [];

    $('.asset-card, .result-item, .equipment-item').each((i, elem) => {
      const $elem = $(elem);
      const title = $elem.find('.asset-title, h3, .title').text().trim();
      const type = $elem.find('.asset-type, .type, .category').text().trim();
      const description = $elem.find('.description, p, .summary').text().trim();
      const imageUrl = $elem.find('img').attr('src');
      const url = $elem.find('a').attr('href');

      if (title) {
        results.push({
          name: title,
          type: type || 'Military Equipment',
          description: description || 'No description available',
          imageUrl: imageUrl ? (imageUrl.startsWith('http') ? imageUrl : `${ODIN_BASE_URL}${imageUrl}`) : null,
          url: url ? (url.startsWith('http') ? url : `${ODIN_BASE_URL}${url}`) : null,
          source: 'ODIN'
        });
      }
    });

    // Deep scrape if requested and we have URLs
    if (deepScrape && results.length > 0 && results[0].url) {
      const detailed = await getODINDetails(results[0].url);
      if (detailed) {
        results[0] = { ...results[0], ...detailed };
      }
    }

    return results;
  } catch (error) {
    console.error('ODIN search error:', error.message);
    return [];
  }
}

/**
 * DEEP SCRAPING - Get detailed equipment info from ODIN
 */
async function getODINDetails(equipmentUrl) {
  try {
    const response = await axios.get(equipmentUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    
    // Extract specifications
    const specifications = {};
    $('.specification-row, .spec-item, table tr').each((i, elem) => {
      const $elem = $(elem);
      const key = $elem.find('.spec-label, dt, td:first-child').text().trim();
      const value = $elem.find('.spec-value, dd, td:last-child').text().trim();
      if (key && value && key !== value) {
        specifications[key] = value;
      }
    });

    // Extract all images
    const images = [];
    $('img.equipment-image, .gallery img, img[src*="equipment"], img[src*="weapon"]').each((i, elem) => {
      const src = $(elem).attr('src');
      if (src && !src.includes('logo') && !src.includes('icon')) {
        images.push(src.startsWith('http') ? src : `${ODIN_BASE_URL}${src}`);
      }
    });

    // Extract variants
    const variants = [];
    $('.variant-list li, .versions li, .types li').each((i, elem) => {
      const variant = $(elem).text().trim();
      if (variant) variants.push(variant);
    });

    // Extract operators
    const operators = [];
    $('.operator-list li, .countries li, .users li').each((i, elem) => {
      const operator = $(elem).text().trim();
      if (operator) operators.push(operator);
    });

    return {
      fullName: $('h1, .equipment-title').first().text().trim() || null,
      description: $('.description, .overview, .summary').first().text().trim() || null,
      specifications: Object.keys(specifications).length > 0 ? specifications : null,
      images: images.length > 0 ? images : null,
      variants: variants.length > 0 ? variants : null,
      operators: operators.length > 0 ? operators : null
    };
  } catch (error) {
    console.error('ODIN details error:', error.message);
    return null;
  }
}

/**
 * MULTI-SOURCE NEWS SCRAPING
 */
async function comprehensiveNewsSearch(query, region, languages = ['en']) {
  try {
    const allNews = [];

    // 1. Equipment-specific news
    const equipmentNews = await fetchEquipmentNews(query, region, 15);
    allNews.push(...equipmentNews);

    // 2. Multi-region search
    const regions = ['US', 'IN', 'RU', 'CN', 'GB'];
    const multiRegionResults = await multiRegionSearch(query);
    multiRegionResults.forEach(regionResult => {
      allNews.push(...regionResult.articles);
    });

    // 3. Topic-based search with context
    const topics = [
      `${query} military`,
      `${query} defense`,
      `${query} deployment`,
      `${query} specifications`
    ];

    for (const topic of topics) {
      const topicNews = await fetchNewsByTopic(topic, [region]);
      allNews.push(...topicNews);
    }

    // Deduplicate and sort
    const uniqueNews = Array.from(
      new Map(allNews.map(article => [article.link, article])).values()
    );

    uniqueNews.sort((a, b) => b.timestamp - a.timestamp);

    return uniqueNews.slice(0, 50); // Return top 50
  } catch (error) {
    console.error('Comprehensive news search error:', error.message);
    return [];
  }
}

/**
 * CASI RESEARCH ARTICLES
 */
async function searchCASI(query) {
  try {
    const searchUrl = `${CASI_BASE_URL}/Search?query=${encodeURIComponent(query)}`;
    const response = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const articles = [];

    $('.article-item, .result, .publication').each((i, elem) => {
      const $elem = $(elem);
      articles.push({
        title: $elem.find('h3, .title, a').text().trim(),
        source: 'Air University CASI',
        date: $elem.find('.date, time').text().trim(),
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
 * GENERATE COMPREHENSIVE INTELLIGENCE REPORT
 */
async function generateIntelligenceReport(equipmentName, analysisData, filepath) {
  try {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // Title Page
          new Paragraph({
            text: "MILITARY EQUIPMENT INTELLIGENCE REPORT",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),
          new Paragraph({
            text: equipmentName.toUpperCase(),
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),
          new Paragraph({
            text: `Classification: UNCLASSIFIED`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
          }),
          new Paragraph({
            text: `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 800 }
          }),

          // Executive Summary
          new Paragraph({
            text: "EXECUTIVE SUMMARY",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({
            text: `This intelligence report provides comprehensive analysis of ${equipmentName} based on multi-source intelligence gathering. Data collected from ${analysisData.metadata?.sources_collected || 4} verified sources including ODIN database, global news agencies, and defense research institutions.`,
            spacing: { after: 200 }
          }),

          // Key Metrics
          new Paragraph({
            text: "INTELLIGENCE METRICS",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({
            text: `• Total Data Sources: ${analysisData.metadata?.sources_collected || 4}`,
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: `• News Articles Analyzed: ${analysisData.news?.length || 0}`,
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: `• Technical Documents: ${analysisData.odinResults?.length || 0}`,
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: `• Research Publications: ${analysisData.articles?.length || 0}`,
            spacing: { after: 400 }
          }),

          // Equipment Overview
          new Paragraph({
            text: "EQUIPMENT OVERVIEW",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({
            text: `Name: ${analysisData.equipment?.fullName || equipmentName}`,
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: `Type: ${analysisData.equipment?.type || 'Military Equipment'}`,
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: `Status: ${analysisData.equipment?.status || 'Active'}`,
            spacing: { after: 200 }
          }),
          new Paragraph({
            text: analysisData.equipment?.description || 'Comprehensive intelligence analysis of military equipment from multiple verified sources.',
            spacing: { after: 400 }
          }),

          // Operators
          new Paragraph({
            text: "OPERATIONAL DEPLOYMENT",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({
            text: `Confirmed Operators: ${(analysisData.operators || []).join(', ') || 'Under Analysis'}`,
            spacing: { after: 400 }
          }),

          // Variants
          new Paragraph({
            text: "SYSTEM VARIANTS",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          ...(analysisData.variants || []).map(variant => 
            new Paragraph({
              text: `• ${variant}`,
              spacing: { after: 100 }
            })
          ),

          // News Intelligence
          new Paragraph({
            text: "INTELLIGENCE FEED ANALYSIS",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({
            text: `Total articles analyzed: ${analysisData.news?.length || 0}`,
            spacing: { after: 200 }
          }),
          ...(analysisData.news || []).slice(0, 10).map(article => 
            new Paragraph({
              text: `• ${article.title} (${article.source}, ${article.date})`,
              spacing: { after: 100 }
            })
          ),

          // Sources
          new Paragraph({
            text: "DATA SOURCES",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({
            text: "• ODIN Military Equipment Database",
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: "• Google News RSS Feeds (Multi-Regional)",
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: "• Air University CASI Research Database",
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: "• Verified Defense Publications",
            spacing: { after: 400 }
          }),

          // Disclaimer
          new Paragraph({
            text: "DISCLAIMER",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({
            text: "This report is generated from open-source intelligence and should be verified through additional classified channels before operational use. Information accuracy depends on source reliability and may require periodic updates.",
            spacing: { after: 200 }
          })
        ]
      }]
    });

    // Save document
    const Packer = require('docx').Packer;
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filepath, buffer);
    
    console.log(`Report generated: ${filepath}`);
    return true;
  } catch (error) {
    console.error('Report generation error:', error);
    return false;
  }
}

/**
 * MAIN ANALYSIS ENDPOINT
 */
app.post('/api/equipment/analyze', async (req, res) => {
  try {
    const { equipment_name, region = 'IN', languages = ['en'], deep_scrape = true } = req.body;

    if (!equipment_name) {
      return res.status(400).json({ error: 'Equipment name is required' });
    }

    // Generate task ID
    const taskId = `${equipment_name.replace(/\s+/g, '_')}_${Date.now()}`;
    
    // Initialize task
    activeTasks[taskId] = {
      status: 'initializing',
      progress: 0,
      message: 'Starting equipment analysis...',
      started_at: new Date().toISOString()
    };

    // Start background processing
    processEquipmentAnalysis(taskId, equipment_name, region, languages, deep_scrape);

    res.json({
      task_id: taskId,
      status: 'started',
      message: 'Analysis started successfully',
      check_status_url: `/api/status/${taskId}`
    });

  } catch (error) {
    console.error('Analysis start error:', error);
    res.status(500).json({ error: 'Failed to start analysis' });
  }
});

/**
 * BACKGROUND PROCESSING
 */
async function processEquipmentAnalysis(taskId, equipmentName, region, languages, deepScrape) {
  try {
    // Update progress: Starting
    activeTasks[taskId] = { ...activeTasks[taskId], status: 'processing', progress: 10, message: 'Searching ODIN database...' };
    
    // 1. ODIN Search
    const odinResults = await searchODIN(equipmentName, deepScrape);
    activeTasks[taskId].progress = 25;
    
    // 2. Comprehensive News Search
    activeTasks[taskId].message = 'Gathering intelligence from news sources...';
    const newsResults = await comprehensiveNewsSearch(equipmentName, region, languages);
    activeTasks[taskId].progress = 50;
    
    // 3. CASI Research
    activeTasks[taskId].message = 'Searching research databases...';
    const casiResults = await searchCASI(equipmentName);
    activeTasks[taskId].progress = 70;
    
    // 4. Generate Report
    activeTasks[taskId].message = 'Generating intelligence report...';
    const filename = `${equipmentName.replace(/\s+/g, '_')}_Intelligence_Report_${Date.now()}.docx`;
    const filepath = path.join(__dirname, 'reports', filename);
    
    // Ensure reports directory exists
    if (!fs.existsSync(path.join(__dirname, 'reports'))) {
      fs.mkdirSync(path.join(__dirname, 'reports'));
    }
    
    const analysisData = {
      equipment: odinResults[0] || { name: equipmentName, description: 'Intelligence gathered from multiple sources' },
      odinResults,
      news: newsResults.map(n => ({
        title: n.title,
        source: n.source,
        date: n.date,
        url: n.link,
        excerpt: n.excerpt || n.description
      })),
      articles: casiResults,
      operators: odinResults[0]?.operators || [],
      variants: odinResults[0]?.variants || [],
      metadata: {
        sources_collected: 4,
        analyzed_at: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };
    
    await generateIntelligenceReport(equipmentName, analysisData, filepath);
    activeTasks[taskId].progress = 90;
    
    // 5. Complete
    activeTasks[taskId] = {
      ...activeTasks[taskId],
      status: 'completed',
      progress: 100,
      message: 'Analysis completed successfully',
      completed_at: new Date().toISOString(),
      results: {
        ...analysisData,
        document: {
          filename,
          download_url: `/api/download/${filename}`
        }
      }
    };
    
  } catch (error) {
    console.error('Processing error:', error);
    activeTasks[taskId] = {
      ...activeTasks[taskId],
      status: 'failed',
      message: `Error: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * STATUS CHECK ENDPOINT
 */
app.get('/api/status/:task_id', (req, res) => {
  const { task_id } = req.params;
  
  if (!activeTasks[task_id]) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  res.json(activeTasks[task_id]);
});

/**
 * DOWNLOAD ENDPOINT
 */
app.get('/api/download/:filename', (req, res) => {
  const { filename } = req.params;
  const filepath = path.join(__dirname, 'reports', filename);
  
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.download(filepath);
});

/**
 * HEALTH CHECK
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    active_tasks: Object.keys(activeTasks).length
  });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Enhanced Equipment Tracker API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;