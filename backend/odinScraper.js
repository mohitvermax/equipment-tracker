// odinScraper.js - Enhanced ODIN scraper with modal handling
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

/**
 * Initialize browser with stealth settings
 */
async function initBrowser() {
  return await puppeteer.launch({
    headless: false,
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
 * Extract content from all tabs in the modal
 */
async function extractTabsContent(page) {
  try {
    console.log('Extracting tabs content...');
    
    // Find all tab buttons/links
    const tabButtons = await page.$$('.nav-tabs a, .tabs a, [role="tab"]');
    console.log(`Found ${tabButtons.length} tabs`);
    
    const tabsData = {};
    
    for (let i = 0; i < tabButtons.length; i++) {
      try {
        // Get the tab name before clicking
        const tabName = await page.evaluate(el => {
          return el.textContent?.trim() || el.getAttribute('href') || `tab-${i}`;
        }, tabButtons[i]);
        
        console.log(`Clicking tab: ${tabName}`);
        
        // Click the tab
        await tabButtons[i].click();
        await new Promise(res => setTimeout(res, 1500)); // Wait for content to load
        
        // Extract content from the active tab
        const tabContent = await page.evaluate(() => {
          const activeTab = document.querySelector('.tab-pane.active, [role="tabpanel"].active, .tab-content > .active');
          if (!activeTab) return '';
          
          // Get all text content, preserving structure
          const sections = {};
          
          // Try to extract structured data
          activeTab.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
            const headingText = heading.textContent.trim();
            let content = '';
            let nextElement = heading.nextElementSibling;
            
            while (nextElement && !nextElement.matches('h1, h2, h3, h4, h5, h6')) {
              content += nextElement.textContent.trim() + '\n';
              nextElement = nextElement.nextElementSibling;
            }
            
            if (headingText && content) {
              sections[headingText] = content.trim();
            }
          });
          
          // If no structured data, get all text
          if (Object.keys(sections).length === 0) {
            return activeTab.textContent.trim();
          }
          
          return sections;
        });
        
        if (tabContent && (typeof tabContent === 'string' ? tabContent.length > 0 : Object.keys(tabContent).length > 0)) {
          tabsData[tabName] = tabContent;
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
    await page.waitForSelector('.modal-content, .modal-body', { timeout: 5000 });
    await new Promise(res => setTimeout(res, 1500));
    
    // Extract all tabs content by clicking through them
    const tabsData = await extractTabsContent(page);
    
    // Extract the main modal data
    const modalData = await page.evaluate(() => {
      const modal = document.querySelector('.modal');
      if (!modal) return null;
      
      // Extract title
      const title = modal.querySelector('.modal-title, h1, h2, h3')?.textContent?.trim() || '';
      
      // Extract image from asset-image or any image div
      const imageDiv = modal.querySelector('.asset-image, .modal-image, .image-section');
      const imageUrl = imageDiv?.querySelector('img')?.src || '';
      
      // Extract all text content sections
      const sections = {};
      
      // Get notes section
      const notesDiv = modal.querySelector('.notes');
      if (notesDiv) {
        sections.notes = notesDiv.textContent?.trim() || '';
      }
      
      // Get details element
      const detailsElements = modal.querySelectorAll('.details');
      detailsElements.forEach((detail, idx) => {
        const detailTitle = detail.querySelector('.title')?.textContent?.trim() || `detail-${idx}`;
        const detailContent = detail.querySelector('.content, p')?.textContent?.trim() || '';
        if (detailContent) {
          sections[detailTitle] = detailContent;
        }
      });
      
      // Extract description if present
      const description = modal.querySelector('.description, .modal-description')?.textContent?.trim() || '';
      if (description) {
        sections.description = description;
      }
      
      // Extract all tables
      const tables = {};
      modal.querySelectorAll('table').forEach((table, idx) => {
        const tableData = [];
        table.querySelectorAll('tr').forEach(row => {
          const cells = Array.from(row.querySelectorAll('td, th'));
          if (cells.length > 0) {
            tableData.push(cells.map(cell => cell.textContent.trim()));
          }
        });
        if (tableData.length > 0) {
          tables[`table-${idx}`] = tableData;
        }
      });
      
      // Extract specification rows
      const specifications = {};
      modal.querySelectorAll('.spec-row, .specification-row, .property-row').forEach(row => {
        const label = row.querySelector('.spec-label, .label, dt, th')?.textContent?.trim();
        const value = row.querySelector('.spec-value, .value, dd, td')?.textContent?.trim();
        if (label && value) {
          specifications[label] = value;
        }
      });
      
      // Extract all paragraphs
      const paragraphs = [];
      modal.querySelectorAll('p').forEach(p => {
        const text = p.textContent?.trim();
        if (text && text.length > 10) {
          paragraphs.push(text);
        }
      });
      
      return {
        title,
        imageUrl,
        sections,
        tables,
        specifications,
        paragraphs
      };
    });
    
    // Combine modal data with tabs data
    return {
      ...modalData,
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

        console.log(`\n=== Processing card ${i + 1}: ${cardData.title} ===`);

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

        // Extract detailed data from modal
        const modalData = await extractModalData(page);
        
        if (!modalData) {
          console.log('Failed to extract modal data');
        } else {
          console.log('Successfully extracted modal data');
          console.log('Tabs found:', Object.keys(modalData.tabs || {}));
        }

        // Close modal
        try {
          const closeButton = await page.$('.modal button[data-dismiss="modal"], .modal .close, .modal-close, button.close, [aria-label="Close"]');
          if (closeButton) {
            console.log('Closing modal with button');
            await closeButton.click();
            await new Promise(res => setTimeout(res, 1000));
          } else {
            console.log('No close button found, pressing Escape');
            await page.keyboard.press('Escape');
            await new Promise(res => setTimeout(res, 1000));
          }
        } catch (e) {
          console.log('Error closing modal:', e.message);
          await page.keyboard.press('Escape');
          await new Promise(res => setTimeout(res, 1000));
        }

        // Combine card preview with modal details
        results.push({
          ...cardData,
          ...modalData,
          url: searchUrl,
          cardIndex: i + 1
        });

      } catch (error) {
        console.error(`Error processing card ${i + 1}:`, error.message);
        // Try to close modal and continue
        try {
          await page.keyboard.press('Escape');
          await new Promise(res => setTimeout(res, 1000));
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
 * Parse and structure equipment data for report generation
 */
function parseEquipmentData(rawData) {
  if (!rawData || rawData.length === 0) {
    return null;
  }

  const primary = rawData[0];

  // Combine all text sections for description
  const descriptionParts = [];
  if (primary.sections?.notes) descriptionParts.push(primary.sections.notes);
  if (primary.sections?.description) descriptionParts.push(primary.sections.description);
  primary.paragraphs?.forEach(p => descriptionParts.push(p));
  
  const description = descriptionParts.join('\n\n') || primary.preview || 'No description available';

  return {
    name: primary.title,
    fullName: primary.title,
    type: primary.type || 'Military Equipment',
    description: description,
    
    // Specifications
    specifications: primary.specifications || {},
    
    // Tables data
    tables: primary.tables || {},
    
    // All sections extracted
    sections: primary.sections || {},
    
    // Images
    images: [
      primary.imageUrl,
      ...rawData.slice(1, 4).map(r => r.imageUrl)
    ].filter(Boolean),
    
    // Tabs content
    tabs: primary.tabs || {},
    
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
 * Extract intelligence from tabs and sections
 */
function extractIntelligence(data) {
  const intelligence = {};
  
  if (data.tabs) {
    Object.keys(data.tabs).forEach(tabName => {
      const normalizedName = tabName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      intelligence[normalizedName] = data.tabs[tabName];
    });
  }
  
  if (data.sections) {
    Object.keys(data.sections).forEach(sectionName => {
      const normalizedName = sectionName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      intelligence[normalizedName] = data.sections[sectionName];
    });
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
  console.log('Tabs:', result.equipment.tabs);
  console.log('Sections:', result.equipment.sections);
});
*/
