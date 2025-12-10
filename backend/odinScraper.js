// odinScraper.js - Enhanced ODIN scraper with proper modal handling and summarization
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Initialize browser with stealth settings and PDF download handling
 */
async function initBrowser() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });
  
  return browser;
}

/**
 * Setup page with PDF download handling
 */
async function setupPage(browser, downloadPath) {
  const page = await browser.newPage();
  
  // Create download directory if it doesn't exist
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }
  
  // Set download behavior to save files without opening
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadPath
  });
  
  // Set viewport and user agent
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // Prevent new tabs/windows from opening
  page.on('popup', async popup => {
    console.log('Popup detected, closing it...');
    await popup.close();
  });
  
  return page;
}

/**
 * Close the initial disclaimer modal
 */
async function closeDisclaimerModal(page) {
  try {
    console.log('Checking for disclaimer modal...');
    
    await page.waitForSelector('.disclaimer-modal', { timeout: 5000 });
    console.log('Found disclaimer modal');
    
    await new Promise(res => setTimeout(res, 1000));
    
    // Try multiple strategies to close the modal
    try {
      const buttonInArea = await page.$('.disclaimer-modal .button-area button');
      if (buttonInArea) {
        console.log('Clicking button in button-area...');
        await buttonInArea.click();
        await new Promise(res => setTimeout(res, 1500));
        return true;
      }
    } catch (e) {
      console.log('Strategy 1 failed:', e.message);
    }
    
    try {
      const buttonById = await page.$('button[id*="1765538738334"]');
      if (buttonById) {
        console.log('Clicking button by ID...');
        await buttonById.click();
        await new Promise(res => setTimeout(res, 1500));
        return true;
      }
    } catch (e) {
      console.log('Strategy 2 failed:', e.message);
    }
    
    try {
      const disclaimerButton = await page.$('.disclaimer-modal button.btn.disclaimer-button');
      if (disclaimerButton) {
        console.log('Clicking disclaimer button...');
        await disclaimerButton.click();
        await new Promise(res => setTimeout(res, 1500));
        return true;
      }
    } catch (e) {
      console.log('Strategy 3 failed:', e.message);
    }
    
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('.disclaimer-modal button'));
        const confirmButton = buttons.find(btn => btn.textContent.trim() === 'CONFIRM');
        if (confirmButton) confirmButton.click();
      });
      console.log('Clicked CONFIRM button via text search');
      await new Promise(res => setTimeout(res, 1500));
      return true;
    } catch (e) {
      console.log('Strategy 4 failed:', e.message);
    }
    
  } catch (error) {
    console.log('No disclaimer modal found or already dismissed:', error.message);
  }
  
  return false;
}

/**
 * Close the asset detail modal with better verification
 */
async function closeAssetModal(page) {
  try {
    console.log('Attempting to close asset modal...');
    
    // Wait a bit before closing to ensure any downloads are initiated
    await new Promise(res => setTimeout(res, 500));
    
    // Strategy 1: Click button in section-header of asset-detail-modal
    try {
      const modalExists = await page.$('.asset-detail-modal');
      if (!modalExists) {
        console.log('No modal found - already closed');
        return true;
      }
      
      const closeButton = await page.$('.asset-detail-modal .section-header button');
      if (closeButton) {
        console.log('Clicking section-header button...');
        await closeButton.click();
        await new Promise(res => setTimeout(res, 1500));
        
        // Verify modal is closed
        const stillOpen = await page.$('.asset-detail-modal');
        if (!stillOpen) {
          console.log('✓ Modal successfully closed');
          return true;
        } else {
          console.log('Modal still open, trying next strategy...');
        }
      }
    } catch (e) {
      console.log('Strategy 1 failed:', e.message);
    }
    
    // Strategy 2: Press Escape multiple times
    try {
      console.log('Pressing Escape key...');
      await page.keyboard.press('Escape');
      await new Promise(res => setTimeout(res, 500));
      await page.keyboard.press('Escape');
      await new Promise(res => setTimeout(res, 1000));
      
      // Verify modal is closed
      const stillOpen = await page.$('.asset-detail-modal');
      if (!stillOpen) {
        console.log('✓ Modal closed via Escape');
        return true;
      } else {
        console.log('Modal still open after Escape...');
      }
    } catch (e) {
      console.log('Strategy 2 failed:', e.message);
    }
    
    // Strategy 3: Click outside the modal (on backdrop)
    try {
      console.log('Clicking modal backdrop...');
      await page.evaluate(() => {
        const backdrop = document.querySelector('.modal-overlay, .modal-backdrop');
        if (backdrop) {
          backdrop.click();
        }
      });
      await new Promise(res => setTimeout(res, 1000));
      
      // Verify modal is closed
      const stillOpen = await page.$('.asset-detail-modal');
      if (!stillOpen) {
        console.log('✓ Modal closed via backdrop');
        return true;
      }
    } catch (e) {
      console.log('Strategy 3 failed:', e.message);
    }
    
    // Strategy 4: Force close via JavaScript
    try {
      console.log('Force closing modal via JavaScript...');
      await page.evaluate(() => {
        const modal = document.querySelector('.asset-detail-modal');
        if (modal) {
          modal.style.display = 'none';
          modal.remove();
        }
        const overlay = document.querySelector('.modal-overlay');
        if (overlay) {
          overlay.style.display = 'none';
          overlay.remove();
        }
      });
      await new Promise(res => setTimeout(res, 1000));
      console.log('✓ Modal force removed');
      return true;
    } catch (e) {
      console.log('Strategy 4 failed:', e.message);
    }
    
  } catch (error) {
    console.error('Error closing modal:', error.message);
  }
  
  return false;
}

/**
 * Extract content from all tabs in the modal
 */
async function extractTabsContent(page) {
  try {
    console.log('Extracting tabs content...');
    
    const assetTabsExists = await page.$('.asset-detail .right .asset-tabs');
    if (!assetTabsExists) {
      console.log('No asset-tabs found');
      return {};
    }
    
    const tabButtons = await page.$$('.asset-detail .right .asset-tabs .container > div button');
    console.log(`Found ${tabButtons.length} tab buttons`);
    
    const tabsData = {};
    
    for (let i = 0; i < tabButtons.length; i++) {
      try {
        const tabName = await page.evaluate(el => {
          return el.textContent?.trim() || el.getAttribute('aria-label') || `tab-${i}`;
        }, tabButtons[i]);
        
        console.log(`  Clicking tab ${i + 1}: ${tabName}`);
        
        await tabButtons[i].click();
        await new Promise(res => setTimeout(res, 2000));
        
        const tabContent = await page.evaluate(() => {
          const rightDiv = document.querySelector('.asset-detail .right');
          if (!rightDiv) return null;
          
          const detailsElement = rightDiv.querySelector('.details.element');
          if (!detailsElement) return null;
          
          const contentDiv = detailsElement.querySelector('.content');
          if (!contentDiv) return null;
          
          const allText = [];
          
          const contentDivs = contentDiv.querySelectorAll('div');
          contentDivs.forEach((div, idx) => {
            const text = div.textContent?.trim();
            if (text && text.length > 0) {
              allText.push(text);
            }
          });
          
          const tables = [];
          contentDiv.querySelectorAll('table').forEach(table => {
            const tableData = [];
            table.querySelectorAll('tr').forEach(row => {
              const cells = Array.from(row.querySelectorAll('td, th'));
              if (cells.length > 0) {
                tableData.push(cells.map(cell => cell.textContent.trim()));
              }
            });
            if (tableData.length > 0) {
              tables.push(tableData);
            }
          });
          
          const gridRows = [];
          contentDiv.querySelectorAll('.flex-grid-row, [class*="grid-row"]').forEach(row => {
            const label = row.querySelector('.label, dt')?.textContent?.trim();
            const value = row.querySelector('.value, dd')?.textContent?.trim();
            if (label && value) {
              gridRows.push({ label, value });
            }
          });
          
          return {
            text: allText.join('\n\n'),
            rawText: contentDiv.textContent?.trim() || '',
            tables: tables,
            gridRows: gridRows
          };
        });
        
        if (tabContent && (tabContent.text || tabContent.rawText)) {
          tabsData[tabName] = tabContent;
          console.log(`    ✓ Extracted ${tabContent.text?.length || tabContent.rawText?.length} chars`);
        }
        
      } catch (error) {
        console.error(`Error processing tab ${i}:`, error.message);
      }
    }
    
    return tabsData;
  } catch (error) {
    console.error('Error extracting tabs:', error.message);
    return {};
  }
}

/**
 * Extract detailed data from the modal
 */
async function extractModalData(page) {
  try {
    await page.waitForSelector('.asset-detail-modal', { timeout: 5000 });
    await new Promise(res => setTimeout(res, 1500));
    
    console.log('  Extracting basic modal data...');
    
    const basicData = await page.evaluate(() => {
      const modal = document.querySelector('.asset-detail-modal');
      if (!modal) return null;
      
      const title = modal.querySelector('.section-header h1, .section-header h2, h1, h2')?.textContent?.trim() || '';
      const leftDiv = modal.querySelector('.left');
      const imageUrl = leftDiv?.querySelector('img')?.src || '';
      const notesDiv = modal.querySelector('.notes');
      const notes = notesDiv?.textContent?.trim() || '';
      
      return {
        title,
        imageUrl,
        notes
      };
    });
    
    console.log('  Starting tabs extraction...');
    const tabsData = await extractTabsContent(page);
    console.log(`  ✓ Extracted ${Object.keys(tabsData).length} tabs`);
    
    return {
      ...basicData,
      tabs: tabsData
    };
    
  } catch (error) {
    console.error('Error extracting modal data:', error.message);
    return null;
  }
}

/**
 * Search ODIN and extract all equipment cards
 */
async function searchODINWithModal(query, downloadPath = './downloads') {
  let browser;
  try {
    browser = await initBrowser();
    const page = await setupPage(browser, downloadPath);

    const searchUrl = `https://odin.tradoc.army.mil/Search/WEG/${encodeURIComponent(query)}`;
    console.log('Navigating to:', searchUrl);

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(res => setTimeout(res, 2000));

    await closeDisclaimerModal(page);

    await page.waitForSelector('.weg-search-results, .search-results, .asset-card, .weg-card', { timeout: 10000 });
    
    // Wait a bit more to ensure cards are loaded
    await new Promise(res => setTimeout(res, 1000));

    // Get all equipment cards - refresh the selector each time
    let cards = await page.$$('.weg-card, .asset-card, [class*="card"]');
    console.log(`Found ${cards.length} equipment cards\n`);

    const results = [];

    for (let i = 0; i < Math.min(cards.length, 10); i++) {
      try {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`PROCESSING CARD ${i + 1} of ${Math.min(cards.length, 10)}`);
        console.log(`${'='.repeat(50)}`);
        
        // Re-fetch cards to avoid stale element references
        cards = await page.$$('.weg-card, .asset-card, [class*="card"]');
        const card = cards[i];

        const cardData = await page.evaluate((el) => {
          return {
            title: el.querySelector('.asset-title, h3, .title, .card-title')?.textContent?.trim() || '',
            type: el.querySelector('.asset-type, .type, .category')?.textContent?.trim() || '',
            preview: el.querySelector('.description, .preview, p')?.textContent?.trim() || '',
            imageUrl: el.querySelector('img')?.src || ''
          };
        }, card);

        console.log(`Title: ${cardData.title}`);
        console.log(`Type: ${cardData.type}`);

        const clickableElement = await card.$('button, a, .card-link, [class*="clickable"]');
        if (!clickableElement) {
          console.log('Clicking card itself...');
          await card.click();
        } else {
          console.log('Clicking card button...');
          await clickableElement.click();
        }
        
        console.log('Waiting for modal to open...');
        await new Promise(res => setTimeout(res, 2500));

        const modalData = await extractModalData(page);
        
        if (!modalData) {
          console.log('❌ Failed to extract modal data');
        } else {
          console.log(`✓ Modal data extracted successfully`);
          console.log(`  - Tabs: ${Object.keys(modalData.tabs || {}).join(', ')}`);
        }

        console.log('\nClosing modal...');
        const closed = await closeAssetModal(page);
        
        if (closed) {
          console.log('✓ Modal closed successfully');
        } else {
          console.log('⚠ Modal closure uncertain, forcing wait...');
        }
        
        // Extra wait to ensure modal is fully closed
        await new Promise(res => setTimeout(res, 2000));
        
        // Verify we're back at the search results page
        const backAtResults = await page.$('.weg-search-results, .search-results');
        if (backAtResults) {
          console.log('✓ Confirmed: Back at search results');
        } else {
          console.log('⚠ Warning: May not be at search results, waiting longer...');
          await new Promise(res => setTimeout(res, 2000));
        }

        // Parse the data
        const parsed = parseEquipmentData([{...cardData, ...modalData}]);
        results.push(parsed);
        
        console.log(`✓ Card ${i + 1} processing complete\n`);

      } catch (error) {
        console.error(`❌ Error processing card ${i + 1}:`, error.message);
        console.log('Attempting recovery...');
        
        try {
          await closeAssetModal(page);
          await new Promise(res => setTimeout(res, 2000));
        } catch (e) {
          console.log('Recovery failed, pressing Escape multiple times');
          await page.keyboard.press('Escape');
          await new Promise(res => setTimeout(res, 500));
          await page.keyboard.press('Escape');
          await new Promise(res => setTimeout(res, 2000));
        }
      }
    }

    return results;

  } catch (error) {
    console.error('ODIN search error:', error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Parse individual equipment data
 */
function parseEquipmentData(rawData) {
  if (!rawData || rawData.length === 0) {
    return null;
  }

  const primary = rawData[0];

  return {
    title: primary.title,
    type: primary.type || 'Military Equipment',
    preview: primary.preview || '',
    notes: primary.notes || '',
    imageUrl: primary.imageUrl || '',
    tabs: primary.tabs || {},
    specifications: extractSpecifications(primary),
    variants: extractVariants(primary),
    operators: extractOperators(primary)
  };
}

/**
 * Extract specifications from tabs data
 */
function extractSpecifications(data) {
  const specs = {};
  
  if (data.tabs) {
    Object.keys(data.tabs).forEach(tabName => {
      const tabContent = data.tabs[tabName];
      
      if (tabContent.gridRows && Array.isArray(tabContent.gridRows)) {
        tabContent.gridRows.forEach(row => {
          specs[row.label] = row.value;
        });
      }
      
      if (tabContent.tables && Array.isArray(tabContent.tables)) {
        tabContent.tables.forEach(table => {
          table.forEach(row => {
            if (row.length >= 2) {
              specs[row[0]] = row[1];
            }
          });
        });
      }
    });
  }
  
  return specs;
}

/**
 * Extract variants from text
 */
function extractVariants(data) {
  const variants = [];
  const allText = JSON.stringify(data).toLowerCase();
  
  const variantPatterns = [
    /variant[s]?:?\s*([^.\n]+)/gi,
    /version[s]?:?\s*([^.\n]+)/gi,
    /model[s]?:?\s*([^.\n]+)/gi,
  ];

  variantPatterns.forEach(pattern => {
    const matches = allText.matchAll(pattern);
    for (const match of matches) {
      const variant = match[1].trim();
      if (variant.length < 100 && variant.length > 3 && !variants.includes(variant)) {
        variants.push(variant);
      }
    }
  });

  return variants.length > 0 ? variants : ['Standard variant'];
}

/**
 * Extract operators from text
 */
function extractOperators(data) {
  const operators = new Set();
  const allText = JSON.stringify(data);
  
  const countries = [
    'United States', 'USA', 'US', 'India', 'Russia', 'China', 'UK', 'United Kingdom',
    'France', 'Germany', 'Israel', 'Japan', 'South Korea', 'Pakistan', 'Iran',
    'Saudi Arabia', 'UAE', 'Turkey', 'Australia', 'Canada', 'Brazil', 'Egypt',
    'Italy', 'Spain', 'Poland', 'Ukraine', 'North Korea', 'Syria', 'Iraq'
  ];

  countries.forEach(country => {
    const regex = new RegExp(`\\b${country}\\b`, 'gi');
    if (regex.test(allText)) {
      operators.add(country);
    }
  });

  return operators.size > 0 ? Array.from(operators) : ['Unknown'];
}

/**
 * Generate military-focused intelligence report
 */
function generateMilitaryReport(equipmentData) {
  if (!equipmentData) return null;

  const report = {
    // Executive Summary
    executiveSummary: {
      name: equipmentData.name,
      classification: equipmentData.type,
      operationalStatus: 'Active',
      threatLevel: determineThreatLevel(equipmentData)
    },

    // Technical Specifications (Military-focused)
    technicalSpecifications: {
      dimensions: {},
      performance: {},
      armament: {},
      sensors: {}
    },

    // Operational Intelligence
    operationalIntelligence: {
      operators: equipmentData.operators || [],
      variants: equipmentData.variants || [],
      deploymentRegions: extractDeploymentRegions(equipmentData),
      operationalRange: equipmentData.specifications['Effective Range'] || 'Unknown'
    },

    // Combat Capabilities
    combatCapabilities: {
      primaryRole: determinePrimaryRole(equipmentData),
      targetTypes: extractTargetTypes(equipmentData),
      guidanceSystem: extractGuidanceSystem(equipmentData),
      warheadType: extractWarheadType(equipmentData)
    },

    // Strategic Assessment
    strategicAssessment: {
      strengths: extractStrengths(equipmentData),
      limitations: extractLimitations(equipmentData),
      counterMeasures: extractCounterMeasures(equipmentData)
    },

    // Intelligence Notes
    intelligenceNotes: equipmentData.notes || '',

    // Source Data
    specifications: equipmentData.specifications,
    images: equipmentData.images || [],
    lastUpdated: new Date().toISOString()
  };

  // Categorize specifications into military-relevant categories
  Object.keys(equipmentData.specifications || {}).forEach(key => {
    const value = equipmentData.specifications[key];
    const lowerKey = key.toLowerCase();

    if (lowerKey.includes('length') || lowerKey.includes('diameter') || lowerKey.includes('weight') || lowerKey.includes('span')) {
      report.technicalSpecifications.dimensions[key] = value;
    } else if (lowerKey.includes('range') || lowerKey.includes('speed') || lowerKey.includes('altitude') || lowerKey.includes('mach')) {
      report.technicalSpecifications.performance[key] = value;
    } else if (lowerKey.includes('warhead') || lowerKey.includes('payload') || lowerKey.includes('explosive')) {
      report.technicalSpecifications.armament[key] = value;
    } else if (lowerKey.includes('guidance') || lowerKey.includes('radar') || lowerKey.includes('seeker')) {
      report.technicalSpecifications.sensors[key] = value;
    }
  });

  return report;
}

/**
 * Helper functions for military report generation
 */
function determineThreatLevel(data) {
  const allText = JSON.stringify(data).toLowerCase();
  if (allText.includes('hypersonic') || allText.includes('nuclear')) return 'Critical';
  if (allText.includes('supersonic') || allText.includes('cruise missile')) return 'High';
  if (allText.includes('missile') || allText.includes('weapon')) return 'Moderate';
  return 'Low';
}

function determinePrimaryRole(data) {
  const allText = JSON.stringify(data).toLowerCase();
  if (allText.includes('anti-ship') || allText.includes('naval')) return 'Anti-Ship Warfare';
  if (allText.includes('air defense') || allText.includes('surface-to-air')) return 'Air Defense';
  if (allText.includes('cruise missile')) return 'Land Attack / Precision Strike';
  if (allText.includes('ballistic')) return 'Strategic Strike';
  return 'Multi-Role';
}

function extractDeploymentRegions(data) {
  const regions = new Set();
  const allText = JSON.stringify(data).toLowerCase();
  
  if (allText.includes('asia') || allText.includes('india') || allText.includes('china')) regions.add('Asia-Pacific');
  if (allText.includes('europe') || allText.includes('russia')) regions.add('Europe');
  if (allText.includes('middle east')) regions.add('Middle East');
  if (allText.includes('africa')) regions.add('Africa');
  
  return Array.from(regions);
}

function extractTargetTypes(data) {
  const targets = [];
  const allText = JSON.stringify(data).toLowerCase();
  
  if (allText.includes('ship') || allText.includes('naval')) targets.push('Surface vessels');
  if (allText.includes('aircraft') || allText.includes('air')) targets.push('Aircraft');
  if (allText.includes('ground') || allText.includes('land')) targets.push('Ground targets');
  if (allText.includes('submarine')) targets.push('Submarines');
  
  return targets.length > 0 ? targets : ['Multiple target types'];
}

function extractGuidanceSystem(data) {
  const allText = JSON.stringify(data).toLowerCase();
  const guidance = [];
  
  if (allText.includes('radar')) guidance.push('Active Radar');
  if (allText.includes('gps') || allText.includes('glonass') || allText.includes('inertial')) guidance.push('GPS/INS');
  if (allText.includes('infrared') || allText.includes('ir')) guidance.push('Infrared');
  if (allText.includes('laser')) guidance.push('Laser');
  
  return guidance.length > 0 ? guidance.join(', ') : 'Unknown';
}

function extractWarheadType(data) {
  const specs = data.specifications || {};
  const allText = JSON.stringify(data).toLowerCase();
  
  if (allText.includes('nuclear')) return 'Nuclear capable';
  if (allText.includes('conventional')) return 'Conventional HE';
  
  return 'Conventional';
}

function extractStrengths(data) {
  const strengths = [];
  const allText = JSON.stringify(data).toLowerCase();
  
  if (allText.includes('supersonic') || allText.includes('hypersonic')) {
    strengths.push('High speed reduces interception time');
  }
  if (allText.includes('low altitude') || allText.includes('sea-skimming')) {
    strengths.push('Low-altitude flight profile complicates detection');
  }
  if (allText.includes('long range') || allText.includes('extended range')) {
    strengths.push('Extended operational range');
  }
  if (allText.includes('maneuverable') || allText.includes('agile')) {
    strengths.push('High maneuverability');
  }
  
  return strengths.length > 0 ? strengths : ['Advanced military technology'];
}

function extractLimitations(data) {
  const limitations = [];
  const allText = JSON.stringify(data).toLowerCase();
  
  if (allText.includes('limited production')) limitations.push('Limited production numbers');
  if (allText.includes('high cost') || allText.includes('expensive')) limitations.push('High unit cost');
  if (allText.includes('weather dependent')) limitations.push('Weather dependent operation');
  
  return limitations.length > 0 ? limitations : ['Standard limitations apply'];
}

function extractCounterMeasures(data) {
  const countermeasures = [];
  const allText = JSON.stringify(data).toLowerCase();
  
  if (allText.includes('supersonic')) {
    countermeasures.push('Advanced air defense systems (S-400, THAAD)');
  }
  if (allText.includes('radar')) {
    countermeasures.push('Electronic warfare and jamming');
  }
  if (allText.includes('cruise')) {
    countermeasures.push('Point defense systems (CIWS, SeaRAM)');
  }
  
  return countermeasures.length > 0 ? countermeasures : ['Integrated air defense systems'];
}

/**
 * Format report for frontend display
 */
function formatReportForFrontend(militaryReport) {
  return {
    // For Home Page Display
    overview: {
      name: militaryReport.executiveSummary.name,
      type: militaryReport.executiveSummary.classification,
      threatLevel: militaryReport.executiveSummary.threatLevel,
      primaryRole: militaryReport.combatCapabilities.primaryRole,
      operators: militaryReport.operationalIntelligence.operators.join(', '),
      image: militaryReport.images[0] || ''
    },

    // For Specifications Tab
    specificationsTab: {
      ...militaryReport.technicalSpecifications.dimensions,
      ...militaryReport.technicalSpecifications.performance,
      ...militaryReport.technicalSpecifications.armament,
      ...militaryReport.technicalSpecifications.sensors
    },

    // For Intelligence Tab
    intelligenceTab: {
      operationalStatus: militaryReport.executiveSummary.operationalStatus,
      operators: militaryReport.operationalIntelligence.operators,
      variants: militaryReport.operationalIntelligence.variants,
      deploymentRegions: militaryReport.operationalIntelligence.deploymentRegions,
      operationalRange: militaryReport.operationalIntelligence.operationalRange
    },

    // For Combat Capabilities Tab
    capabilitiesTab: {
      primaryRole: militaryReport.combatCapabilities.primaryRole,
      targetTypes: militaryReport.combatCapabilities.targetTypes,
      guidanceSystem: militaryReport.combatCapabilities.guidanceSystem,
      warheadType: militaryReport.combatCapabilities.warheadType
    },

    // For Assessment Tab
    assessmentTab: {
      strengths: militaryReport.strategicAssessment.strengths,
      limitations: militaryReport.strategicAssessment.limitations,
      counterMeasures: militaryReport.strategicAssessment.counterMeasures
    },

    // For Notes Tab
    notesTab: {
      intelligenceNotes: militaryReport.intelligenceNotes,
      lastUpdated: militaryReport.lastUpdated
    },

    // Raw data for reference
    rawSpecifications: militaryReport.specifications,
    images: militaryReport.images
  };
}

/**
 * Main search function with military report generation
 */
async function searchODIN(query, options = {}) {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`ODIN MILITARY INTELLIGENCE SCRAPER`);
    console.log(`Searching for: ${query}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const downloadPath = options.downloadPath || './downloads';
    const results = await searchODINWithModal(query, downloadPath);
    
    if (!results || results.length === 0) {
      return {
        success: false,
        query,
        error: 'No results found'
      };
    }

    // Use the first result as primary equipment data
    const primaryEquipment = results[0];
    
    // Merge data from multiple sources if available
    const mergedEquipment = {
      name: primaryEquipment.title,
      type: primaryEquipment.type,
      notes: primaryEquipment.notes,
      images: results.map(r => r.imageUrl).filter(Boolean),
      specifications: {},
      operators: new Set(),
      variants: new Set()
    };

    // Merge specifications and operators from all results
    results.forEach(result => {
      Object.assign(mergedEquipment.specifications, result.specifications);
      result.operators?.forEach(op => mergedEquipment.operators.add(op));
      result.variants?.forEach(v => mergedEquipment.variants.add(v));
    });

    mergedEquipment.operators = Array.from(mergedEquipment.operators);
    mergedEquipment.variants = Array.from(mergedEquipment.variants);

    // Generate military-focused report
    const militaryReport = generateMilitaryReport(mergedEquipment);
    
    // Format for frontend
    const formattedReport = formatReportForFrontend(militaryReport);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`SCRAPING COMPLETED SUCCESSFULLY`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Equipment: ${mergedEquipment.name}`);
    console.log(`Results processed: ${results.length}`);
    console.log(`Specifications extracted: ${Object.keys(mergedEquipment.specifications).length}`);
    console.log(`Operators identified: ${mergedEquipment.operators.join(', ')}`);
    console.log(`Threat Level: ${militaryReport.executiveSummary.threatLevel}`);
    console.log(`${'='.repeat(60)}\n`);
    
    return {
      success: true,
      query,
      
      // Military intelligence report
      militaryReport: militaryReport,
      
      // Frontend-formatted data
      frontendData: formattedReport,
      
      // Raw scraped data
      _rawResults: results
    };
    
  } catch (error) {
    console.error('Search failed:', error);
    return {
      success: false,
      query,
      error: error.message
    };
  }
}

module.exports = {
  searchODIN,
  generateMilitaryReport,
  formatReportForFrontend
};
