// server.js - Enhanced with image recognition
const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
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
 * Image recognition endpoint
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

    // Preprocess image for better OCR
    const processedImagePath = imagePath.replace(path.extname(imagePath), '_processed.jpg');
    await sharp(imagePath)
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .grayscale()
      .normalize()
      .sharpen()
      .toFile(processedImagePath);

    console.log('Image preprocessed for OCR...');

    // Perform OCR
    console.log('Running OCR...');
    const { data: { text } } = await Tesseract.recognize(processedImagePath, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });

    console.log('OCR completed');
    console.log('Extracted text:', text.substring(0, 200) + '...');

    // Extract equipment names using pattern matching
    const equipmentKeywords = extractEquipmentNames(text);
    
    console.log('Identified equipment keywords:', equipmentKeywords);

    // Clean up processed image
    if (fs.existsSync(processedImagePath)) {
      fs.unlinkSync(processedImagePath);
    }

    if (equipmentKeywords.length === 0) {
      return res.json({
        success: false,
        message: 'No equipment identified in image',
        extractedText: text,
        suggestions: ['Try uploading a clearer image', 'Ensure equipment name is visible']
      });
    }

    // Return the most likely equipment name
    const primaryEquipment = equipmentKeywords[0];

    res.json({
      success: true,
      equipment: primaryEquipment,
      alternativeNames: equipmentKeywords.slice(1, 5),
      extractedText: text,
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
 * Extract equipment names from OCR text
 */
function extractEquipmentNames(text) {
  const equipmentNames = [];
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);

  // Common military equipment patterns
  const patterns = [
    /\b([A-Z][a-zA-Z]*-?\d+[A-Z]?)\b/g, // F-35, S-400, MiG-29
    /\b(BrahMos|Javelin|Patriot|HIMARS|THAAD|Abrams|Leopard)\b/gi,
    /\b([A-Z]{2,}[-\s]?\d+)\b/g, // HIMARS, SA-21
  ];

  // Extract using patterns
  patterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const cleaned = match.trim();
        if (cleaned.length >= 3 && !equipmentNames.includes(cleaned)) {
          equipmentNames.push(cleaned);
        }
      });
    }
  });

  // Check for known equipment in lines
  const knownEquipment = [
    'BrahMos', 'F-35', 'F-16', 'F-22', 'S-400', 'S-300', 'Patriot', 'THAAD',
    'HIMARS', 'Javelin', 'Stinger', 'Tomahawk', 'Harpoon', 'Abrams', 'Leopard',
    'Challenger', 'T-90', 'T-72', 'Apache', 'Black Hawk', 'Rafale', 'Eurofighter',
    'Su-57', 'Su-35', 'MiG-29', 'J-20', 'Akash', 'Prithvi', 'Agni'
  ];

  lines.forEach(line => {
    knownEquipment.forEach(equipment => {
      if (line.toLowerCase().includes(equipment.toLowerCase())) {
        if (!equipmentNames.includes(equipment)) {
          equipmentNames.unshift(equipment);
        }
      }
    });
  });

  return equipmentNames;
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

app.get('/api/trending', async (req, res) => {
  try {
    const trending = [
      'BrahMos', 'F-35', 'S-400', 'HIMARS', 'Javelin',
      'Patriot', 'Leopard 2', 'Abrams', 'Rafale', 'Su-57'
    ];
    res.json({ trending });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
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