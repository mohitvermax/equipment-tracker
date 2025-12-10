// odinScraper.js - Enhanced ODIN scraper with modal handling
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

/**
 * Initialize browser with stealth settings
 */
async function initBrowser() {
  return await puppeteer.launch({
    headless: false,
  defaultViewport: null,  // optional: opens full window
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled'
  ]
  });
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

    // Wait a bit for any popups to appear
    // await page.waitForTimeout(2000);
    await new Promise(res => setTimeout(res, 2000));


    // Handle cookie/alert popups
    try {
      // Try to find and click any popup accept buttons
      const popupSelectors = [
        'button.cookie-alert button',
        'button[class*="accept"]',
        'button[class*="ok"]',
        'button[class*="agree"]',
        '.modal button.btn',
        '[data-dismiss="modal"]'
      ];

      for (const selector of popupSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            console.log('Found popup button:', selector);
            await button.click();
            // await page.waitForTimeout(1000);
            await new Promise(res => setTimeout(res, 1000));

            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }
    } catch (error) {
      console.log('No popup found or already dismissed');
    }

    // Wait for search results to load
    await page.waitForSelector('.weg-search-results, .search-results', { timeout: 10000 });

    // Get all equipment cards
    const cards = await page.$$('.weg-card, .asset-card');
    console.log(`Found ${cards.length} equipment cards`);

    const results = [];

    // Extract data from each card
    for (let i = 0; i < Math.min(cards.length, 10); i++) {
      try {
        const card = cards[i];

        // Get card button/link
        const cardButton = await card.$('button, a, .card-link');
        if (!cardButton) continue;

        // Extract preview data from card
        const cardData = await page.evaluate((el) => {
          return {
            title: el.querySelector('.asset-title, h3, .title')?.textContent?.trim() || '',
            type: el.querySelector('.asset-type, .type')?.textContent?.trim() || '',
            preview: el.querySelector('.description, .preview, p')?.textContent?.trim() || '',
            imageUrl: el.querySelector('img')?.src || ''
          };
        }, card);

        console.log(`Processing card ${i + 1}: ${cardData.title}`);

        // Click the card to open modal
        await cardButton.click();
        // await page.waitForTimeout(2000);
        await new Promise(res => setTimeout(res, 2000));

        // Wait for modal to appear
        // await page.waitForSelector('.modal.asset-detail-modal, .modal-overlay', { timeout: 5000 });

        // Extract detailed data from modal
        const modalData = await page.evaluate(() => {
          const modal = document.querySelector('.modal.asset-detail-modal, .modal');
          if (!modal) return null;

          // Extract image from left div
          const leftDiv = modal.querySelector('.left, .modal-left, .image-section');
          const imageUrl = leftDiv?.querySelector('img')?.src || '';

          // Extract content from right div
          const rightDiv = modal.querySelector('.right, .modal-right, .content-section');
          
          // Get notes section
          const notesDiv = modal.querySelector('.notes, [class*="notes"]');
          const notes = notesDiv?.textContent?.trim() || '';

          // Get details from details element
          const detailsElement = modal.querySelector('.details.element, .details');
          const detailsContent = detailsElement?.querySelector('.content, p')?.textContent?.trim() || '';

          // Extract tabs content
          const tabs = {};
          const tabElements = modal.querySelectorAll('.asset-tabs .tab-pane, [role="tabpanel"]');
          tabElements.forEach((tab) => {
            const tabName = tab.getAttribute('id') || tab.className;
            const tabContent = tab.textContent?.trim() || '';
            if (tabContent) {
              tabs[tabName] = tabContent;
            }
          });

          // Extract system data
          const systemData = {};
          modal.querySelectorAll('.spec-row, .specification-row, tr').forEach((row) => {
            const label = row.querySelector('.spec-label, dt, th, .label')?.textContent?.trim();
            const value = row.querySelector('.spec-value, dd, td, .value')?.textContent?.trim();
            if (label && value) {
              systemData[label] = value;
            }
          });

          // Extract from table-like structures
          modal.querySelectorAll('table tr').forEach((row) => {
            const cells = row.querySelectorAll('td, th');
            if (cells.length >= 2) {
              const key = cells[0].textContent?.trim();
              const val = cells[1].textContent?.trim();
              if (key && val) {
                systemData[key] = val;
              }
            }
          });

          return {
            imageUrl,
            notes,
            detailsContent,
            tabs,
            systemData
          };
        });

        // Close modal
        try {
          const closeButton = await page.$('.modal button[data-dismiss="modal"], .modal .close, .modal-close');
          if (closeButton) {
            await closeButton.click();
            // await page.waitForTimeout(1000);
            await new Promise(res => setTimeout(res, 1000));

          }
        } catch (e) {
          // Try pressing Escape
          await page.keyboard.press('Escape');
        //   await page.waitForTimeout(1000);
        await new Promise(res => setTimeout(res, 1000));

        }

        // Combine card preview with modal details
        results.push({
          ...cardData,
          ...modalData,
          url: searchUrl
        });

      } catch (error) {
        console.error(`Error processing card ${i + 1}:`, error.message);
        // Try to close modal and continue
        try {
          await page.keyboard.press('Escape');
        //   await page.waitForTimeout(500);
          await new Promise(res => setTimeout(res, 5000));

        } catch (e) {}
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
 * Parse and structure equipment data
 */
function parseEquipmentData(rawData) {
  if (!rawData || rawData.length === 0) {
    return null;
  }

  const primary = rawData[0];

  return {
    name: primary.title,
    fullName: primary.title,
    type: primary.type || 'Military Equipment',
    description: primary.notes || primary.detailsContent || primary.preview || 'No description available',
    
    // Specifications from systemData
    specifications: primary.systemData || {},
    
    // Images
    images: [primary.imageUrl, ...rawData.slice(1, 4).map(r => r.imageUrl)].filter(Boolean),
    
    // Notes for report
    notes: primary.notes || primary.detailsContent || '',
    
    // Detailed content from tabs
    intelligence: {
      system: primary.tabs?.system || primary.tabs?.System || '',
      dimensions: primary.tabs?.dimensions || primary.tabs?.Dimensions || '',
      payload: primary.tabs?.payload || primary.tabs?.Payload || '',
      propulsion: primary.tabs?.propulsion || primary.tabs?.['Propulsion Characteristics'] || '',
      fireControl: primary.tabs?.['fire-control'] || primary.tabs?.['Fire Control'] || '',
    },
    
    // Variants (extracted from notes or description)
    variants: extractVariants(primary),
    
    // Operators (extracted from notes or description)
    operators: extractOperators(primary),
    
    // All raw data for reference
    rawModalData: rawData
  };
}

/**
 * Extract variants from text
 */
function extractVariants(data) {
  const variants = [];
  const text = `${data.notes} ${data.detailsContent}`.toLowerCase();
  
  // Look for variant mentions
  const variantPatterns = [
    /variant[s]?:?\s*([^.]+)/gi,
    /version[s]?:?\s*([^.]+)/gi,
    /model[s]?:?\s*([^.]+)/gi,
    /type[s]?:?\s*([^.]+)/gi
  ];

  variantPatterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const variant = match[1].trim();
      if (variant.length < 100 && !variants.includes(variant)) {
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
  const text = `${data.notes} ${data.detailsContent}`;
  
  // Common country/operator names
  const countries = [
    'United States', 'USA', 'US', 'India', 'Russia', 'China', 'UK', 'United Kingdom',
    'France', 'Germany', 'Israel', 'Japan', 'South Korea', 'Pakistan', 'Iran',
    'Saudi Arabia', 'UAE', 'Turkey', 'Australia', 'Canada'
  ];

  countries.forEach(country => {
    const regex = new RegExp(`\\b${country}\\b`, 'gi');
    if (regex.test(text)) {
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
    console.log(`Searching ODIN for: ${query}`);
    
    const rawResults = await searchODINWithModal(query);
    const structuredData = parseEquipmentData(rawResults);
    
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
  console.log('Notes:', result.equipment.notes);
});
*/