// server.js - Fixed to work with new odinScraper
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
  searchODIN
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

    console.log(`\n${'='.repeat(60)}`);
    console.log(`NEW SEARCH REQUEST: ${query}`);
    console.log(`${'='.repeat(60)}\n`);

    // Search ODIN with new scraper
    const odinResult = await searchODIN(query, { downloadPath: './downloads' });
    
    // Fetch news in parallel
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

    // Prepare response using new data structure
    let result;
    
    if (odinResult.success && odinResult.frontendData) {
      const frontendData = odinResult.frontendData;
      const militaryReport = odinResult.militaryReport;
      
      result = {
        query,
        
        // Equipment overview for home page
        equipment: {
          name: frontendData.overview.name,
          fullName: frontendData.overview.name,
          type: frontendData.overview.type,
          description: militaryReport.intelligenceNotes || 'Military equipment system',
          status: militaryReport.executiveSummary.operationalStatus,
          threatLevel: militaryReport.executiveSummary.threatLevel,
          primaryRole: frontendData.overview.primaryRole,
          image: frontendData.overview.image,
          
          // Specifications for Specifications tab
          specifications: frontendData.specificationsTab,
          
          // Intelligence data for Intelligence tab
          intelligence: {
            operationalStatus: frontendData.intelligenceTab.operationalStatus,
            operators: frontendData.intelligenceTab.operators,
            variants: frontendData.intelligenceTab.variants,
            deploymentRegions: frontendData.intelligenceTab.deploymentRegions,
            operationalRange: frontendData.intelligenceTab.operationalRange
          },
          
          // Combat capabilities for Capabilities tab
          capabilities: {
            primaryRole: frontendData.capabilitiesTab.primaryRole,
            targetTypes: frontendData.capabilitiesTab.targetTypes,
            guidanceSystem: frontendData.capabilitiesTab.guidanceSystem,
            warheadType: frontendData.capabilitiesTab.warheadType
          },
          
          // Strategic assessment for Assessment tab
          assessment: {
            strengths: frontendData.assessmentTab.strengths,
            limitations: frontendData.assessmentTab.limitations,
            counterMeasures: frontendData.assessmentTab.counterMeasures
          },
          
          // Notes for Notes tab
          notes: frontendData.notesTab.intelligenceNotes,
          lastUpdated: frontendData.notesTab.lastUpdated
        },
        
        // Images
        images: frontendData.images || [],
        
        // Variants and operators
        variants: frontendData.intelligenceTab.variants || [],
        operators: frontendData.intelligenceTab.operators || [],
        
        // News formatted for frontend
        news: uniqueNews.slice(0, 20).map(article => ({
          title: article.title,
          source: article.source,
          date: article.date,
          url: article.link || article.url,
          excerpt: article.excerpt || article.description,
          region: article.region || region
        })),
        
        // Articles placeholder
        articles: [],
        
        // Metadata
        timestamp: new Date().toISOString(),
        dataSource: 'ODIN Military Intelligence',
        odinSuccess: true,
        
        // Full military report for report generation
        _militaryReport: militaryReport,
        _frontendData: frontendData
      };
      
    } else {
      // Fallback if ODIN fails
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

    // Cache the result
    cache.set(cacheKey, result);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`RESPONSE SENT TO FRONTEND`);
    console.log(`Equipment: ${result.equipment.name}`);
    console.log(`Specifications: ${Object.keys(result.equipment.specifications || {}).length}`);
    console.log(`News articles: ${result.news.length}`);
    console.log(`${'='.repeat(60)}\n`);

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

    console.log(`Generating report for: ${query}`);

    // Get cached data first
    const cacheKey = `search_${query}_IN`;
    let data = cache.get(cacheKey);

    if (!data) {
      console.log('No cached data, fetching fresh...');
      // Fetch fresh data
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

    // Generate report document
    const report = generateMilitaryReportDocument(data);

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
 * Generate formatted military intelligence report document
 */
function generateMilitaryReportDocument(data) {
  const equipment = data.equipment;
  const militaryReport = data._militaryReport;
  
  let report = `# MILITARY INTELLIGENCE REPORT\n`;
  report += `# ${equipment.name}\n\n`;
  report += `**Classification:** UNCLASSIFIED\n`;
  report += `**Generated:** ${new Date().toLocaleString()}\n`;
  report += `**Source:** ODIN Database\n\n`;
  
  report += `---\n\n`;
  
  // Executive Summary
  if (militaryReport) {
    report += `## EXECUTIVE SUMMARY\n\n`;
    report += `**Equipment Name:** ${militaryReport.executiveSummary.name}\n`;
    report += `**Classification:** ${militaryReport.executiveSummary.classification}\n`;
    report += `**Operational Status:** ${militaryReport.executiveSummary.operationalStatus}\n`;
    report += `**Threat Level:** ${militaryReport.executiveSummary.threatLevel}\n\n`;
  }
  
  // Operational Intelligence
  if (data.operators && data.operators.length > 0) {
    report += `## OPERATIONAL INTELLIGENCE\n\n`;
    report += `**Operators:**\n`;
    data.operators.forEach(op => {
      report += `- ${op}\n`;
    });
    report += `\n`;
  }
  
  if (data.variants && data.variants.length > 0) {
    report += `**Known Variants:**\n`;
    data.variants.forEach(variant => {
      report += `- ${variant}\n`;
    });
    report += `\n`;
  }
  
  if (equipment.intelligence) {
    const intel = equipment.intelligence;
    
    if (intel.deploymentRegions && intel.deploymentRegions.length > 0) {
      report += `**Deployment Regions:** ${intel.deploymentRegions.join(', ')}\n`;
    }
    
    if (intel.operationalRange) {
      report += `**Operational Range:** ${intel.operationalRange}\n`;
    }
    
    report += `\n`;
  }
  
  // Technical Specifications
  if (equipment.specifications && Object.keys(equipment.specifications).length > 0) {
    report += `## TECHNICAL SPECIFICATIONS\n\n`;
    
    // Group specifications by category
    const dimensions = {};
    const performance = {};
    const armament = {};
    const other = {};
    
    Object.entries(equipment.specifications).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('length') || lowerKey.includes('diameter') || lowerKey.includes('weight') || lowerKey.includes('span')) {
        dimensions[key] = value;
      } else if (lowerKey.includes('range') || lowerKey.includes('speed') || lowerKey.includes('altitude') || lowerKey.includes('mach')) {
        performance[key] = value;
      } else if (lowerKey.includes('warhead') || lowerKey.includes('payload') || lowerKey.includes('explosive')) {
        armament[key] = value;
      } else {
        other[key] = value;
      }
    });
    
    if (Object.keys(dimensions).length > 0) {
      report += `### Dimensions\n\n`;
      Object.entries(dimensions).forEach(([key, value]) => {
        report += `- **${key}:** ${value}\n`;
      });
      report += `\n`;
    }
    
    if (Object.keys(performance).length > 0) {
      report += `### Performance\n\n`;
      Object.entries(performance).forEach(([key, value]) => {
        report += `- **${key}:** ${value}\n`;
      });
      report += `\n`;
    }
    
    if (Object.keys(armament).length > 0) {
      report += `### Armament\n\n`;
      Object.entries(armament).forEach(([key, value]) => {
        report += `- **${key}:** ${value}\n`;
      });
      report += `\n`;
    }
    
    if (Object.keys(other).length > 0) {
      report += `### Other Specifications\n\n`;
      Object.entries(other).forEach(([key, value]) => {
        report += `- **${key}:** ${value}\n`;
      });
      report += `\n`;
    }
  }
  
  // Combat Capabilities
  if (equipment.capabilities) {
    report += `## COMBAT CAPABILITIES\n\n`;
    report += `**Primary Role:** ${equipment.capabilities.primaryRole || 'Unknown'}\n\n`;
    
    if (equipment.capabilities.targetTypes && equipment.capabilities.targetTypes.length > 0) {
      report += `**Target Types:**\n`;
      equipment.capabilities.targetTypes.forEach(target => {
        report += `- ${target}\n`;
      });
      report += `\n`;
    }
    
    if (equipment.capabilities.guidanceSystem) {
      report += `**Guidance System:** ${equipment.capabilities.guidanceSystem}\n\n`;
    }
    
    if (equipment.capabilities.warheadType) {
      report += `**Warhead Type:** ${equipment.capabilities.warheadType}\n\n`;
    }
  }
  
  // Strategic Assessment
  if (equipment.assessment) {
    report += `## STRATEGIC ASSESSMENT\n\n`;
    
    if (equipment.assessment.strengths && equipment.assessment.strengths.length > 0) {
      report += `### Strengths\n\n`;
      equipment.assessment.strengths.forEach(strength => {
        report += `- ${strength}\n`;
      });
      report += `\n`;
    }
    
    if (equipment.assessment.limitations && equipment.assessment.limitations.length > 0) {
      report += `### Limitations\n\n`;
      equipment.assessment.limitations.forEach(limitation => {
        report += `- ${limitation}\n`;
      });
      report += `\n`;
    }
    
    if (equipment.assessment.counterMeasures && equipment.assessment.counterMeasures.length > 0) {
      report += `### Recommended Countermeasures\n\n`;
      equipment.assessment.counterMeasures.forEach(countermeasure => {
        report += `- ${countermeasure}\n`;
      });
      report += `\n`;
    }
  }
  
  // Intelligence Notes
  if (equipment.notes) {
    report += `## INTELLIGENCE NOTES\n\n`;
    report += `${equipment.notes}\n\n`;
  }
  
  report += `---\n\n`;
  report += `## REPORT METADATA\n\n`;
  report += `**Generated:** ${new Date().toLocaleString()}\n`;
  report += `**Data Source:** ODIN Military Equipment Database\n`;
  report += `**Classification:** UNCLASSIFIED\n\n`;
  report += `*This report was automatically generated from multiple intelligence sources including ODIN database, technical specifications, and operational assessments.*\n`;
  
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
  console.log(`\n${'='.repeat(60)}`);
  console.log(`EQUIPMENT TRACKER API - MILITARY INTELLIGENCE MODE`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Enhanced ODIN scraping: ENABLED`);
  console.log(`Military report generation: ENABLED`);
  console.log(`${'='.repeat(60)}\n`);
});

module.exports = app;
