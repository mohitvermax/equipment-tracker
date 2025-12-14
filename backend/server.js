// server.js - Enhanced with image recognition
const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const multer = require('multer');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

// Import modules
const {
  fetchEquipmentNews,
  multiRegionSearch,
  getTrendingDefenseNews
} = require('./googleNewsHelper');

const {
  searchODIN
} = require('./odinScraper');

const app = express();
const cache = new NodeCache({ stdTTL: 3600 });

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use('/downloads', express.static('downloads'));

/**
 * Image recognition endpoint using Google Reverse Image Search
 */
app.post('/api/recognize-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`IMAGE RECOGNITION REQUEST`);
    console.log(`File: ${req.file.filename}`);
    console.log(`${'='.repeat(60)}\n`);

    const imagePath = req.file.path;
    const imageUrl = `http://localhost:3001/uploads/${req.file.filename}`;

    console.log('Performing Google Reverse Image Search...');

    // Use Google Lens/Images reverse search
    const searchResults = await reverseImageSearch(imageUrl);
    
    if (searchResults.length === 0) {
      return res.json({
        success: false,
        message: 'No results found from image search',
        suggestions: ['Try a clearer image', 'Ensure equipment is visible']
      });
    }

    console.log(`Found ${searchResults.length} results from image search`);

    // Extract equipment names from results
    const equipmentKeywords = extractEquipmentFromSearchResults(searchResults);
    
    console.log('Identified equipment:', equipmentKeywords);

    if (equipmentKeywords.length === 0) {
      return res.json({
        success: false,
        message: 'No military equipment identified in search results',
        searchResults: searchResults.slice(0, 5).map(r => r.title),
        suggestions: ['Try uploading a different angle', 'Ensure image shows equipment clearly']
      });
    }

    const primaryEquipment = equipmentKeywords[0];

    res.json({
      success: true,
      equipment: primaryEquipment,
      alternativeNames: equipmentKeywords.slice(1, 5),
      searchResults: searchResults.slice(0, 10).map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet
      })),
      imageUrl: `/uploads/${req.file.filename}`
    });

  } catch (error) {
    console.error('Image recognition error:', error);
    res.status(500).json({
      error: 'Image recognition failed',
      message: error.message
    });
  }
});

/**
 * Perform reverse image search using Google
 */
async function reverseImageSearch(imageUrl) {
  try {
    // Use Google Images search with the image URL
    const encodedImageUrl = encodeURIComponent(imageUrl);
    const searchUrl = `https://www.google.com/searchbyimage?image_url=${encodedImageUrl}&encoded_image=&image_content=&filename=&hl=en`;
    
    console.log('Reverse search URL:', searchUrl);

    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://www.google.com/'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const results = [];

    // Extract search results
    $('.g, .Gx5Zad').each((i, elem) => {
      const $elem = $(elem);
      const title = $elem.find('h3, .DKV0Md').text().trim();
      const url = $elem.find('a').attr('href');
      const snippet = $elem.find('.VwiC3b, .yXK7lf').text().trim();

      if (title && title.length > 0) {
        results.push({ title, url, snippet });
      }
    });

    // If regular search didn't work, try extracting from other elements
    if (results.length === 0) {
      $('div[data-hveid] h3, div[jsname] h3').each((i, elem) => {
        const title = $(elem).text().trim();
        if (title) {
          results.push({ 
            title, 
            url: '', 
            snippet: '' 
          });
        }
      });
    }

    // Also check for "best guess" or similar results
    const bestGuess = $('.fKDtNb, [data-attrid="title"]').first().text().trim();
    if (bestGuess && bestGuess.length > 3) {
      results.unshift({
        title: bestGuess,
        url: '',
        snippet: 'Best guess from image search'
      });
    }

    console.log(`Extracted ${results.length} results`);
    
    return results;

  } catch (error) {
    console.error('Reverse image search error:', error.message);
    
    // Fallback: Try using the image filename as a hint
    return [{
      title: 'Search failed - please try text search',
      url: '',
      snippet: ''
    }];
  }
}

/**
 * Extract equipment names from search results
 */
function extractEquipmentFromSearchResults(searchResults) {
  const equipmentNames = new Set();

  // Known military equipment list
  const knownEquipment = [
    'BrahMos', 'F-35', 'F-16', 'F-22', 'F-18', 'S-400', 'S-300', 'Patriot', 'THAAD',
    'HIMARS', 'Javelin', 'Stinger', 'Tomahawk', 'Harpoon', 'Abrams', 'Leopard',
    'Challenger', 'T-90', 'T-72', 'T-14', 'Apache', 'Black Hawk', 'Chinook',
    'Rafale', 'Eurofighter', 'Typhoon', 'Su-57', 'Su-35', 'Su-30', 'MiG-29', 
    'MiG-31', 'J-20', 'J-10', 'Akash', 'Prithvi', 'Agni', 'Tejas', 'Arjun',
    'M1 Abrams', 'M2 Bradley', 'NASAMS', 'Iron Dome', 'Arrow', 'David\'s Sling'
  ];

  // Equipment designation patterns
  const patterns = [
    /\b([A-Z]-?\d{1,3}[A-Z]?)\b/g,  // F-35, S-400, MiG-29
    /\b([A-Z]{2,}-?\d+)\b/g,         // HIMARS, SA-21
    /\b(M\d{1,3}[A-Z]?\d?)\b/g,      // M1A2, M142
  ];

  searchResults.forEach(result => {
    const text = `${result.title} ${result.snippet}`.toLowerCase();

    // Check for known equipment
    knownEquipment.forEach(equipment => {
      const lowerEquip = equipment.toLowerCase();
      if (text.includes(lowerEquip)) {
        equipmentNames.add(equipment);
      }
    });

    // Check for patterns in original case
    const originalText = `${result.title} ${result.snippet}`;
    patterns.forEach(pattern => {
      const matches = originalText.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleaned = match.trim();
          if (cleaned.length >= 3 && cleaned.length <= 15) {
            // Verify it looks like military equipment
            if (/^[A-Z]/.test(cleaned)) {
              equipmentNames.add(cleaned);
            }
          }
        });
      }
    });
  });

  // Prioritize known equipment
  const result = [];
  const knownFound = Array.from(equipmentNames).filter(name => 
    knownEquipment.includes(name)
  );
  const otherFound = Array.from(equipmentNames).filter(name => 
    !knownEquipment.includes(name)
  );

  return [...knownFound, ...otherFound];
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

    const cacheKey = `search_${query}_${region}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log('Returning cached result');
      return res.json(cached);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`NEW SEARCH REQUEST: ${query}`);
    console.log(`${'='.repeat(60)}\n`);

    const odinResult = await searchODIN(query, { downloadPath: './downloads' });
    
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

    const allNews = [...regionalNews, ...globalNews];
    const uniqueNews = Array.from(
      new Map(allNews.map(article => [article.link || article.title, article])).values()
    );

    uniqueNews.sort((a, b) => b.timestamp - a.timestamp);

    let result;
    
    if (odinResult.success && odinResult.frontendData) {
      const frontendData = odinResult.frontendData;
      const militaryReport = odinResult.militaryReport;
      
      result = {
        query,
        equipment: {
          name: frontendData.overview.name,
          fullName: frontendData.overview.name,
          type: frontendData.overview.type,
          description: militaryReport.intelligenceNotes || 'Military equipment system',
          status: militaryReport.executiveSummary.operationalStatus,
          threatLevel: militaryReport.executiveSummary.threatLevel,
          primaryRole: frontendData.overview.primaryRole,
          image: frontendData.overview.image,
          specifications: frontendData.specificationsTab,
          intelligence: {
            operationalStatus: frontendData.intelligenceTab.operationalStatus,
            operators: frontendData.intelligenceTab.operators,
            variants: frontendData.intelligenceTab.variants,
            deploymentRegions: frontendData.intelligenceTab.deploymentRegions,
            operationalRange: frontendData.intelligenceTab.operationalRange
          },
          capabilities: {
            primaryRole: frontendData.capabilitiesTab.primaryRole,
            targetTypes: frontendData.capabilitiesTab.targetTypes,
            guidanceSystem: frontendData.capabilitiesTab.guidanceSystem,
            warheadType: frontendData.capabilitiesTab.warheadType
          },
          assessment: {
            strengths: frontendData.assessmentTab.strengths,
            limitations: frontendData.assessmentTab.limitations,
            counterMeasures: frontendData.assessmentTab.counterMeasures
          },
          notes: frontendData.notesTab.intelligenceNotes,
          lastUpdated: frontendData.notesTab.lastUpdated
        },
        images: frontendData.images || [],
        variants: frontendData.intelligenceTab.variants || [],
        operators: frontendData.intelligenceTab.operators || [],
        news: uniqueNews.slice(0, 20).map(article => ({
          title: article.title,
          source: article.source,
          date: article.date,
          url: article.link || article.url,
          excerpt: article.excerpt || article.description,
          region: article.region || region
        })),
        articles: [],
        timestamp: new Date().toISOString(),
        dataSource: 'ODIN Military Intelligence',
        odinSuccess: true,
        _militaryReport: militaryReport,
        _frontendData: frontendData
      };
      
    } else {
      result = {
        query,
        equipment: {
          name: query,
          fullName: query,
          type: 'Military Equipment',
          description: 'No detailed information available from ODIN',
          specifications: {},
          intelligence: {},
          capabilities: {},
          assessment: {},
          images: [],
          notes: '',
          status: 'Unknown'
        },
        variants: [],
        operators: [],
        news: uniqueNews.slice(0, 20).map(article => ({
          title: article.title,
          source: article.source,
          date: article.date,
          url: article.link || article.url,
          excerpt: article.excerpt || article.description,
          region: article.region || region
        })),
        articles: [],
        timestamp: new Date().toISOString(),
        dataSource: 'News Only',
        odinSuccess: false,
        error: odinResult.error || 'ODIN search failed'
      };
    }

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
 * Generate enhanced PDF-style report
 */
app.post('/api/generate-report', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const cacheKey = `search_${query}_IN`;
    let data = cache.get(cacheKey);

    if (!data) {
      const odinResult = await searchODIN(query, { downloadPath: './downloads' });
      
      if (odinResult.success) {
        data = {
          query,
          equipment: {
            name: odinResult.frontendData.overview.name,
            specifications: odinResult.frontendData.specificationsTab,
            intelligence: odinResult.frontendData.intelligenceTab,
            capabilities: odinResult.frontendData.capabilitiesTab,
            assessment: odinResult.frontendData.assessmentTab,
            notes: odinResult.frontendData.notesTab.intelligenceNotes
          },
          images: odinResult.frontendData.images,
          variants: odinResult.frontendData.intelligenceTab.variants,
          operators: odinResult.frontendData.intelligenceTab.operators,
          _militaryReport: odinResult.militaryReport
        };
      }
    }

    if (!data) {
      return res.status(404).json({ 
        error: 'No data available for report generation',
        query 
      });
    }

    const report = generateEnhancedReport(data);

    res.json({
      success: true,
      report,
      format: 'markdown',
      timestamp: new Date().toISOString()
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
 * Generate enhanced formatted report with images
 */
function generateEnhancedReport(data) {
  const equipment = data.equipment;
  const militaryReport = data._militaryReport;
  const images = data.images || [];
  
  let report = '';
  
  // Header
  report += `╔═══════════════════════════════════════════════════════════════════════╗\n`;
  report += `║                    MILITARY INTELLIGENCE REPORT                       ║\n`;
  report += `║                          CLASSIFIED: UNCLASSIFIED                     ║\n`;
  report += `╚═══════════════════════════════════════════════════════════════════════╝\n\n`;
  
  report += `EQUIPMENT DESIGNATION: ${equipment.name}\n`;
  report += `REPORT GENERATED: ${new Date().toLocaleString('en-US', { 
    dateStyle: 'full', 
    timeStyle: 'long',
    timeZone: 'UTC'
  })} UTC\n`;
  report += `CLASSIFICATION: UNCLASSIFIED\n`;
  report += `DISTRIBUTION: AUTHORIZED PERSONNEL ONLY\n\n`;
  
  report += `${'═'.repeat(75)}\n\n`;
  
  // Document Images Section
  if (images.length > 0) {
    report += `VISUAL INTELLIGENCE ASSETS\n`;
    report += `${'─'.repeat(75)}\n\n`;
    report += `The following photographic intelligence has been collected:\n\n`;
    images.forEach((img, idx) => {
      report += `  [IMAGE ${idx + 1}] ${img}\n`;
    });
    report += `\n`;
    report += `NOTE: Images available in digital format. See attached files.\n\n`;
    report += `${'═'.repeat(75)}\n\n`;
  }
  
  // Executive Summary
  if (militaryReport) {
    report += `SECTION 1: EXECUTIVE SUMMARY\n`;
    report += `${'─'.repeat(75)}\n\n`;
    report += `Equipment Name:        ${militaryReport.executiveSummary.name}\n`;
    report += `Classification:        ${militaryReport.executiveSummary.classification}\n`;
    report += `Operational Status:    ${militaryReport.executiveSummary.operationalStatus}\n`;
    report += `Threat Assessment:     ${militaryReport.executiveSummary.threatLevel}\n\n`;
  }
  
  // Operational Intelligence
  if (data.operators && data.operators.length > 0) {
    report += `${'═'.repeat(75)}\n\n`;
    report += `SECTION 2: OPERATIONAL INTELLIGENCE\n`;
    report += `${'─'.repeat(75)}\n\n`;
    
    report += `2.1 KNOWN OPERATORS\n\n`;
    data.operators.forEach((op, idx) => {
      report += `  ${String(idx + 1).padStart(2, '0')}. ${op}\n`;
    });
    report += `\n`;
  }
  
  if (data.variants && data.variants.length > 0) {
    report += `2.2 IDENTIFIED VARIANTS\n\n`;
    data.variants.forEach((variant, idx) => {
      report += `  ${String(idx + 1).padStart(2, '0')}. ${variant}\n`;
    });
    report += `\n`;
  }
  
  if (equipment.intelligence) {
    const intel = equipment.intelligence;
    
    if (intel.deploymentRegions && intel.deploymentRegions.length > 0) {
      report += `2.3 DEPLOYMENT REGIONS\n\n`;
      intel.deploymentRegions.forEach((region, idx) => {
        report += `  ${String(idx + 1).padStart(2, '0')}. ${region}\n`;
      });
      report += `\n`;
    }
    
    if (intel.operationalRange) {
      report += `2.4 OPERATIONAL PARAMETERS\n\n`;
      report += `  Effective Range: ${intel.operationalRange}\n\n`;
    }
  }
  
  // Technical Specifications
  if (equipment.specifications && Object.keys(equipment.specifications).length > 0) {
    report += `${'═'.repeat(75)}\n\n`;
    report += `SECTION 3: TECHNICAL SPECIFICATIONS\n`;
    report += `${'─'.repeat(75)}\n\n`;
    
    const dimensions = {};
    const performance = {};
    const armament = {};
    const other = {};
    
    Object.entries(equipment.specifications).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('length') || lowerKey.includes('diameter') || 
          lowerKey.includes('weight') || lowerKey.includes('span')) {
        dimensions[key] = value;
      } else if (lowerKey.includes('range') || lowerKey.includes('speed') || 
                 lowerKey.includes('altitude') || lowerKey.includes('mach')) {
        performance[key] = value;
      } else if (lowerKey.includes('warhead') || lowerKey.includes('payload') || 
                 lowerKey.includes('explosive')) {
        armament[key] = value;
      } else {
        other[key] = value;
      }
    });
    
    if (Object.keys(dimensions).length > 0) {
      report += `3.1 PHYSICAL DIMENSIONS\n\n`;
      Object.entries(dimensions).forEach(([key, value]) => {
        report += `  ${key.padEnd(30, '.')}: ${value}\n`;
      });
      report += `\n`;
    }
    
    if (Object.keys(performance).length > 0) {
      report += `3.2 PERFORMANCE CHARACTERISTICS\n\n`;
      Object.entries(performance).forEach(([key, value]) => {
        report += `  ${key.padEnd(30, '.')}: ${value}\n`;
      });
      report += `\n`;
    }
    
    if (Object.keys(armament).length > 0) {
      report += `3.3 ARMAMENT SPECIFICATIONS\n\n`;
      Object.entries(armament).forEach(([key, value]) => {
        report += `  ${key.padEnd(30, '.')}: ${value}\n`;
      });
      report += `\n`;
    }
    
    if (Object.keys(other).length > 0) {
      report += `3.4 ADDITIONAL SPECIFICATIONS\n\n`;
      Object.entries(other).forEach(([key, value]) => {
        report += `  ${key.padEnd(30, '.')}: ${value}\n`;
      });
      report += `\n`;
    }
  }
  
  // Combat Capabilities
  if (equipment.capabilities) {
    report += `${'═'.repeat(75)}\n\n`;
    report += `SECTION 4: COMBAT CAPABILITIES ASSESSMENT\n`;
    report += `${'─'.repeat(75)}\n\n`;
    
    report += `4.1 PRIMARY ROLE\n\n`;
    report += `  ${equipment.capabilities.primaryRole || 'Unknown'}\n\n`;
    
    if (equipment.capabilities.targetTypes && equipment.capabilities.targetTypes.length > 0) {
      report += `4.2 TARGET ENGAGEMENT CAPABILITY\n\n`;
      equipment.capabilities.targetTypes.forEach((target, idx) => {
        report += `  ${String(idx + 1).padStart(2, '0')}. ${target}\n`;
      });
      report += `\n`;
    }
    
    if (equipment.capabilities.guidanceSystem) {
      report += `4.3 GUIDANCE & NAVIGATION\n\n`;
      report += `  System: ${equipment.capabilities.guidanceSystem}\n\n`;
    }
    
    if (equipment.capabilities.warheadType) {
      report += `4.4 WARHEAD CONFIGURATION\n\n`;
      report += `  Type: ${equipment.capabilities.warheadType}\n\n`;
    }
  }
  
  // Strategic Assessment
  if (equipment.assessment) {
    report += `${'═'.repeat(75)}\n\n`;
    report += `SECTION 5: STRATEGIC ASSESSMENT\n`;
    report += `${'─'.repeat(75)}\n\n`;
    
    if (equipment.assessment.strengths && equipment.assessment.strengths.length > 0) {
      report += `5.1 TACTICAL ADVANTAGES\n\n`;
      equipment.assessment.strengths.forEach((strength, idx) => {
        report += `  ${String(idx + 1).padStart(2, '0')}. ${strength}\n`;
      });
      report += `\n`;
    }
    
    if (equipment.assessment.limitations && equipment.assessment.limitations.length > 0) {
      report += `5.2 IDENTIFIED LIMITATIONS\n\n`;
      equipment.assessment.limitations.forEach((limitation, idx) => {
        report += `  ${String(idx + 1).padStart(2, '0')}. ${limitation}\n`;
      });
      report += `\n`;
    }
    
    if (equipment.assessment.counterMeasures && equipment.assessment.counterMeasures.length > 0) {
      report += `5.3 RECOMMENDED COUNTERMEASURES\n\n`;
      equipment.assessment.counterMeasures.forEach((countermeasure, idx) => {
        report += `  ${String(idx + 1).padStart(2, '0')}. ${countermeasure}\n`;
      });
      report += `\n`;
    }
  }
  
  // Intelligence Notes
  if (equipment.notes) {
    report += `${'═'.repeat(75)}\n\n`;
    report += `SECTION 6: DETAILED INTELLIGENCE NOTES\n`;
    report += `${'─'.repeat(75)}\n\n`;
    report += `${equipment.notes}\n\n`;
  }
  
  // Footer
  report += `${'═'.repeat(75)}\n\n`;
  report += `REPORT METADATA\n`;
  report += `${'─'.repeat(75)}\n\n`;
  report += `Generated By:     Military Equipment Intelligence Platform\n`;
  report += `Data Source:      ODIN Defense Systems Database\n`;
  report += `Report Date:      ${new Date().toISOString()}\n`;
  report += `Classification:   UNCLASSIFIED\n`;
  report += `Authority:        Automated Intelligence Gathering System\n\n`;
  
  report += `${'═'.repeat(75)}\n\n`;
  report += `END OF REPORT\n\n`;
  report += `This document contains information compiled from open-source intelligence\n`;
  report += `and authorized military databases. Handle in accordance with applicable\n`;
  report += `security protocols and distribution guidelines.\n`;
  
  return report;
}

/**
 * Get equipment library/catalog
 */
app.get('/api/equipment-library', (req, res) => {
  const equipmentLibrary = [
    // Fighter Jets
    { id: 1, name: 'F-35 Lightning II', type: 'Stealth Fighter', category: 'Aircraft', tier: 'Tier 1', image: 'https://images.unsplash.com/photo-1583157480029-3c644fa2de12' },
    { id: 2, name: 'F-22 Raptor', type: 'Air Superiority Fighter', category: 'Aircraft', tier: 'Tier 1' },
    { id: 3, name: 'Su-57 Felon', type: 'Stealth Fighter', category: 'Aircraft', tier: 'Tier 1' },
    { id: 4, name: 'J-20', type: 'Stealth Fighter', category: 'Aircraft', tier: 'Tier 1' },
    { id: 5, name: 'Rafale', type: 'Multirole Fighter', category: 'Aircraft', tier: 'Tier 1' },
    { id: 6, name: 'Eurofighter Typhoon', type: 'Multirole Fighter', category: 'Aircraft', tier: 'Tier 1' },
    { id: 7, name: 'F-16 Fighting Falcon', type: 'Multirole Fighter', category: 'Aircraft', tier: 'Tier 2' },
    { id: 8, name: 'F-15 Eagle', type: 'Air Superiority Fighter', category: 'Aircraft', tier: 'Tier 1' },
    { id: 9, name: 'MiG-29', type: 'Multirole Fighter', category: 'Aircraft', tier: 'Tier 2' },
    { id: 10, name: 'Su-35', type: 'Air Superiority Fighter', category: 'Aircraft', tier: 'Tier 1' },
    
    // Missiles
    { id: 11, name: 'BrahMos', type: 'Cruise Missile', category: 'Missile', tier: 'Tier 1' },
    { id: 12, name: 'Tomahawk', type: 'Cruise Missile', category: 'Missile', tier: 'Tier 1' },
    { id: 13, name: 'Javelin', type: 'Anti-Tank Missile', category: 'Missile', tier: 'Tier 2' },
    { id: 14, name: 'Stinger', type: 'MANPADS', category: 'Missile', tier: 'Tier 2' },
    { id: 15, name: 'Harpoon', type: 'Anti-Ship Missile', category: 'Missile', tier: 'Tier 2' },
    { id: 16, name: 'AGM-158 JASSM', type: 'Cruise Missile', category: 'Missile', tier: 'Tier 1' },
    
    // Air Defense
    { id: 17, name: 'S-400 Triumf', type: 'Air Defense System', category: 'Air Defense', tier: 'Tier 1' },
    { id: 18, name: 'Patriot', type: 'Air Defense System', category: 'Air Defense', tier: 'Tier 1' },
    { id: 19, name: 'THAAD', type: 'Missile Defense', category: 'Air Defense', tier: 'Tier 1' },
    { id: 20, name: 'Iron Dome', type: 'Air Defense System', category: 'Air Defense', tier: 'Tier 1' },
    { id: 21, name: 'S-300', type: 'Air Defense System', category: 'Air Defense', tier: 'Tier 1' },
    { id: 22, name: 'Akash', type: 'Air Defense System', category: 'Air Defense', tier: 'Tier 2' },
    
    // Tanks
    { id: 23, name: 'M1 Abrams', type: 'Main Battle Tank', category: 'Tank', tier: 'Tier 1' },
    { id: 24, name: 'Leopard 2', type: 'Main Battle Tank', category: 'Tank', tier: 'Tier 1' },
    { id: 25, name: 'T-90', type: 'Main Battle Tank', category: 'Tank', tier: 'Tier 2' },
    { id: 26, name: 'T-14 Armata', type: 'Main Battle Tank', category: 'Tank', tier: 'Tier 1' },
    { id: 27, name: 'Challenger 2', type: 'Main Battle Tank', category: 'Tank', tier: 'Tier 1' },
    { id: 28, name: 'K2 Black Panther', type: 'Main Battle Tank', category: 'Tank', tier: 'Tier 1' },
    
    // Artillery
    { id: 29, name: 'HIMARS', type: 'Rocket Artillery', category: 'Artillery', tier: 'Tier 1' },
    { id: 30, name: 'M777 Howitzer', type: 'Artillery', category: 'Artillery', tier: 'Tier 2' },
    { id: 31, name: 'PzH 2000', type: 'Self-Propelled Howitzer', category: 'Artillery', tier: 'Tier 1' },
    { id: 32, name: 'Dhanush', type: 'Artillery Gun', category: 'Artillery', tier: 'Tier 2' },
    
    // Helicopters
    { id: 33, name: 'AH-64 Apache', type: 'Attack Helicopter', category: 'Helicopter', tier: 'Tier 1' },
    { id: 34, name: 'UH-60 Black Hawk', type: 'Utility Helicopter', category: 'Helicopter', tier: 'Tier 2' },
    { id: 35, name: 'Mi-24 Hind', type: 'Attack Helicopter', category: 'Helicopter', tier: 'Tier 2' },
    { id: 36, name: 'Ka-52 Alligator', type: 'Attack Helicopter', category: 'Helicopter', tier: 'Tier 1' },
    { id: 37, name: 'CH-47 Chinook', type: 'Transport Helicopter', category: 'Helicopter', tier: 'Tier 2' },
    
    // Drones/UAVs
    { id: 38, name: 'MQ-9 Reaper', type: 'Combat UAV', category: 'UAV', tier: 'Tier 1' },
    { id: 39, name: 'Bayraktar TB2', type: 'Combat UAV', category: 'UAV', tier: 'Tier 2' },
    { id: 40, name: 'RQ-4 Global Hawk', type: 'Surveillance UAV', category: 'UAV', tier: 'Tier 1' },
    { id: 41, name: 'CH-4 Rainbow', type: 'Combat UAV', category: 'UAV', tier: 'Tier 2' },
    
    // Bombers
    { id: 42, name: 'B-2 Spirit', type: 'Stealth Bomber', category: 'Aircraft', tier: 'Tier 1' },
    { id: 43, name: 'B-52 Stratofortress', type: 'Strategic Bomber', category: 'Aircraft', tier: 'Tier 1' },
    { id: 44, name: 'Tu-160', type: 'Strategic Bomber', category: 'Aircraft', tier: 'Tier 1' },
    
    // Naval
    { id: 45, name: 'Arleigh Burke Destroyer', type: 'Destroyer', category: 'Naval', tier: 'Tier 1' },
    { id: 46, name: 'Type 055 Destroyer', type: 'Destroyer', category: 'Naval', tier: 'Tier 1' },
    { id: 47, name: 'Kolkata Class', type: 'Destroyer', category: 'Naval', tier: 'Tier 2' },
    
    // More Equipment
    { id: 48, name: 'Tejas', type: 'Light Combat Aircraft', category: 'Aircraft', tier: 'Tier 2' },
    { id: 49, name: 'Prithvi Missile', type: 'Tactical Ballistic Missile', category: 'Missile', tier: 'Tier 2' },
    { id: 50, name: 'Agni-V', type: 'ICBM', category: 'Missile', tier: 'Tier 1' }
  ];
  
  res.json({ equipment: equipmentLibrary });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cacheSize: cache.keys().length
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`MILITARY EQUIPMENT INTELLIGENCE PLATFORM`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Features:`);
  console.log(`  ✓ ODIN Database Scraping`);
  console.log(`  ✓ Image Recognition & OCR`);
  console.log(`  ✓ Enhanced Report Generation`);
  console.log(`  ✓ News Aggregation`);
  console.log(`${'='.repeat(60)}\n`);
});

module.exports = app;