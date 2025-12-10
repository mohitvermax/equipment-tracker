// odinScraper.js - Enhanced ODIN scraper with modal handling
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

/**
 * Initialize browser with stealth settings
 */
async function initBrowser() {
  return await puppeteer.launch({
    // headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });
}

/**
 * Close the initial disclaimer modal
 */
async function closeDisclaimerModal(page) {
  try {
    console.log('Checking for disclaimer modal...');
    
    // Wait for the disclaimer modal to appear
    await page.waitForSelector('.disclaimer-modal', { timeout: 5000 });
    console.log('Found disclaimer modal');
    
    // Wait a bit for the modal to fully render
    await new Promise(res => setTimeout(res, 1000));
    
    // Try multiple strategies to close the modal
    
    // Strategy 1: Click the button-area > button
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
    
    // Strategy 2: Click button with specific ID (from your screenshot)
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
    
    // Strategy 3: Click any button with class containing 'disclaimer-button'
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
    
    // Strategy 4: Click CONFIRM button (visible text)
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
 * Close the asset detail modal
 */
async function closeAssetModal(page) {
  try {
    console.log('Attempting to close asset modal...');
    
    // Strategy 1: Click button in section-header of asset-detail-modal
    try {
      const closeButton = await page.$('.asset-detail-modal .section-header button');
      if (closeButton) {
        console.log('Closing modal via section-header button');
        await closeButton.click();
        await new Promise(res => setTimeout(res, 1000));
        return true;
      }
    } catch (e) {
      console.log('Strategy 1 failed:', e.message);
    }
    
    // Strategy 2: Try other close buttons
    try {
      const closeButton = await page.$('.modal button[data-dismiss="modal"], .modal .close, .modal-close, button.close, [aria-label="Close"]');
      if (closeButton) {
        console.log('Closing modal with generic close button');
        await closeButton.click();
        await new Promise(res => setTimeout(res, 1000));
        return true;
      }
    } catch (e) {
      console.log('Strategy 2 failed:', e.message);
    }
    
    // Strategy 3: Press Escape
    console.log('No close button found, pressing Escape');
    await page.keyboard.press('Escape');
    await new Promise(res => setTimeout(res, 1000));
    return true;
    
  } catch (error) {
    console.error('Error closing modal:', error.message);
    // Fallback: press Escape
    await page.keyboard.press('Escape');
    await new Promise(res => setTimeout(res, 1000));
    return false;
  }
}

/**
 * Extract content from all tabs in the modal
 */
async function extractTabsContent(page) {
  try {
    console.log('Extracting tabs content...');
    
    // Find the asset-tabs container inside the right div
    const assetTabsExists = await page.$('.asset-detail .right .asset-tabs');
    if (!assetTabsExists) {
      console.log('No asset-tabs found');
      return {};
    }
    
    // Find all tab buttons inside asset-tabs > container > div > button
    const tabButtons = await page.$$('.asset-detail .right .asset-tabs .container > div button');
    console.log(`Found ${tabButtons.length} tab buttons`);
    
    const tabsData = {};
    
    for (let i = 0; i < tabButtons.length; i++) {
      try {
        // Get the tab name before clicking
        const tabName = await page.evaluate(el => {
          return el.textContent?.trim() || el.getAttribute('aria-label') || `tab-${i}`;
        }, tabButtons[i]);
        
        console.log(`Clicking tab ${i + 1}: ${tabName}`);
        
        // Click the tab button
        await tabButtons[i].click();
        await new Promise(res => setTimeout(res, 2000)); // Wait for content to load
        
        // Extract content from the details.element > content div
        const tabContent = await page.evaluate(() => {
          // Find the right div
          const rightDiv = document.querySelector('.asset-detail .right');
          if (!rightDiv) return null;
          
          // Find the details.element div
          const detailsElement = rightDiv.querySelector('.details.element');
          if (!detailsElement) return null;
          
          // Find the content div inside details.element
          const contentDiv = detailsElement.querySelector('.content');
          if (!contentDiv) return null;
          
          // Extract all content - try structured first
          const sections = {};
          const allText = [];
          
          // Get all divs inside content
          const contentDivs = contentDiv.querySelectorAll('div');
          contentDivs.forEach((div, idx) => {
            const text = div.textContent?.trim();
            if (text && text.length > 0) {
              allText.push(text);
            }
          });
          
          // Also try to find any tables
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
          
          // Get any grid-row content (like in your Dimensions tab)
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
          console.log(`  ✓ Extracted content for ${tabName} (${tabContent.text?.length || tabContent.rawText?.length} chars)`);
        } else {
          console.log(`  ✗ No content found for ${tabName}`);
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
    // Wait for modal to be visible and loaded
    await page.waitForSelector('.asset-detail-modal', { timeout: 5000 });
    await new Promise(res => setTimeout(res, 1500));
    
    console.log('Extracting basic modal data...');
    
    // Extract basic modal data first
    const basicData = await page.evaluate(() => {
      const modal = document.querySelector('.asset-detail-modal');
      if (!modal) return null;
      
      // Extract title from header
      const title = modal.querySelector('.section-header h1, .section-header h2, h1, h2')?.textContent?.trim() || '';
      
      // Extract image from left div
      const leftDiv = modal.querySelector('.left');
      const imageUrl = leftDiv?.querySelector('img')?.src || '';
      
      // Extract notes if present
      const notesDiv = modal.querySelector('.notes');
      const notes = notesDiv?.textContent?.trim() || '';
      
      return {
        title,
        imageUrl,
        notes
      };
    });
    
    // Extract all tabs content by clicking through them
    console.log('Starting tabs extraction...');
    const tabsData = await extractTabsContent(page);
    console.log(`Extracted ${Object.keys(tabsData).length} tabs`);
    
    // Combine basic data with tabs data
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
async function searchODINWithModal(query) {
  let browser;
  try {
    browser = await initBrowser();
    const page = await browser.newPage();

    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const searchUrl = `https://odin.tradoc.army.mil/Search/WEG/${encodeURIComponent(query)}`;
    console.log('Navigating to:', searchUrl);

    // Navigate to search page
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait a bit for page to settle
    await new Promise(res => setTimeout(res, 2000));

    // Close the disclaimer modal
    await closeDisclaimerModal(page);

    // Wait for search results to load
    await page.waitForSelector('.weg-search-results, .search-results, .asset-card, .weg-card', { timeout: 10000 });

    // Get all equipment cards
    const cards = await page.$$('.weg-card, .asset-card, [class*="card"]');
    console.log(`Found ${cards.length} equipment cards`);

    const results = [];

    // Extract data from each card
    for (let i = 0; i < Math.min(cards.length, 10); i++) {
      try {
        const card = cards[i];

        // Extract preview data from card
        const cardData = await page.evaluate((el) => {
          return {
            title: el.querySelector('.asset-title, h3, .title, .card-title')?.textContent?.trim() || '',
            type: el.querySelector('.asset-type, .type, .category')?.textContent?.trim() || '',
            preview: el.querySelector('.description, .preview, p')?.textContent?.trim() || '',
            imageUrl: el.querySelector('img')?.src || ''
          };
        }, card);

        console.log(`\n========================================`);
        console.log(`Processing card ${i + 1}: ${cardData.title}`);
        console.log(`========================================`);

        // Find clickable element in card
        const clickableElement = await card.$('button, a, .card-link, [class*="clickable"]');
        if (!clickableElement) {
          console.log('No clickable element found, trying to click card itself');
          await card.click();
        } else {
          await clickableElement.click();
        }
        
        // Wait for modal to open
        await new Promise(res => setTimeout(res, 2500));

        // Extract detailed data from modal (including all tabs)
        const modalData = await extractModalData(page);
        
        if (!modalData) {
          console.log('❌ Failed to extract modal data');
        } else {
          console.log('✓ Successfully extracted modal data');
          console.log(`  - Title: ${modalData.title}`);
          console.log(`  - Image: ${modalData.imageUrl ? 'Yes' : 'No'}`);
          console.log(`  - Tabs extracted: ${Object.keys(modalData.tabs || {}).length}`);
          console.log(`  - Tab names: ${Object.keys(modalData.tabs || {}).join(', ')}`);
        }

        // Close modal using the correct method
        await closeAssetModal(page);
        console.log('Modal closed, continuing to next card...\n');

        // Combine card preview with modal details
        results.push({
          ...cardData,
          ...modalData,
          url: searchUrl,
          cardIndex: i + 1
        });

      } catch (error) {
        console.error(`❌ Error processing card ${i + 1}:`, error.message);
        // Try to close modal and continue
        try {
          await closeAssetModal(page);
        } catch (e) {
          console.log('Could not close modal, pressing Escape');
          await page.keyboard.press('Escape');
          await new Promise(res => setTimeout(res, 1000));
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
 * Parse and structure equipment data for report generation
 */
function parseEquipmentData(rawData) {
  if (!rawData || rawData.length === 0) {
    return null;
  }

  const primary = rawData[0];

  // Combine all text from tabs for description
  const descriptionParts = [];
  if (primary.notes) descriptionParts.push(primary.notes);
  
  // Add text from each tab
  if (primary.tabs) {
    Object.keys(primary.tabs).forEach(tabName => {
      const tabContent = primary.tabs[tabName];
      if (tabContent.text) {
        descriptionParts.push(`\n=== ${tabName} ===\n${tabContent.text}`);
      } else if (tabContent.rawText) {
        descriptionParts.push(`\n=== ${tabName} ===\n${tabContent.rawText}`);
      }
    });
  }
  
  const description = descriptionParts.join('\n\n') || primary.preview || 'No description available';

  return {
    name: primary.title,
    fullName: primary.title,
    type: primary.type || 'Military Equipment',
    description: description,
    
    // Notes
    notes: primary.notes || '',
    
    // Images
    images: [
      primary.imageUrl,
      ...rawData.slice(1, 4).map(r => r.imageUrl)
    ].filter(Boolean),
    
    // Tabs content - this contains all the detailed information
    tabs: primary.tabs || {},
    
    // Extract specifications from tabs
    specifications: extractSpecifications(primary),
    
    // Intelligence data
    intelligence: extractIntelligence(primary),
    
    // Variants
    variants: extractVariants(primary),
    
    // Operators
    operators: extractOperators(primary),
    
    // All raw data for reference
    rawModalData: rawData
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
      
      // Extract from gridRows if present
      if (tabContent.gridRows && Array.isArray(tabContent.gridRows)) {
        tabContent.gridRows.forEach(row => {
          specs[row.label] = row.value;
        });
      }
      
      // Extract from tables if present
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
 * Extract intelligence from tabs and sections
 */
function extractIntelligence(data) {
  const intelligence = {};
  
  if (data.tabs) {
    Object.keys(data.tabs).forEach(tabName => {
      const normalizedName = tabName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const tabContent = data.tabs[tabName];
      
      intelligence[normalizedName] = {
        text: tabContent.text || tabContent.rawText || '',
        gridRows: tabContent.gridRows || [],
        tables: tabContent.tables || []
      };
    });
  }
  
  if (data.notes) {
    intelligence.notes = data.notes;
  }
  
  return intelligence;
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
    /type[s]?:?\s*([^.\n]+)/gi
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
 * Main search function
 */
async function searchODIN(query) {
  try {
    console.log(`\n========================================`);
    console.log(`Searching ODIN for: ${query}`);
    console.log(`========================================\n`);
    
    const rawResults = await searchODINWithModal(query);
    const structuredData = parseEquipmentData(rawResults);
    
    console.log(`\n========================================`);
    console.log(`Search completed successfully`);
    console.log(`Found ${rawResults.length} results`);
    if (structuredData) {
      console.log(`Tabs in primary result: ${Object.keys(structuredData.tabs).length}`);
      console.log(`Tab names: ${Object.keys(structuredData.tabs).join(', ')}`);
    }
    console.log(`========================================\n`);
    
    return {
      success: true,
      query,
      equipment: structuredData,
      rawResults
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
  searchODINWithModal,
  parseEquipmentData
};

// Example usage:
/*
const { searchODIN } = require('./odinScraper');

searchODIN('BrahMos').then(result => {
  console.log('Equipment:', result.equipment);
  console.log('Specifications:', result.equipment.specifications);
  console.log('Intelligence:', result.equipment.intelligence);
  console.log('Tabs:', Object.keys(result.equipment.tabs));
  
  // Print each tab's content
  Object.keys(result.equipment.tabs).forEach(tabName => {
    console.log(`\n=== ${tabName} ===`);
    console.log(result.equipment.tabs[tabName].text);
  });
});
*/
