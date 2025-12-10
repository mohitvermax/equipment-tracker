// googleNewsHelper.js
// Helper functions for fetching news from Google News RSS feeds
// Similar to map-view repository implementation

const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Fetch news from Google News RSS feed
 * @param {string} query - Search query
 * @param {string} language - Language code (e.g., 'en', 'hi')
 * @param {string} country - Country code (e.g., 'US', 'IN', 'GB')
 * @param {number} maxResults - Maximum number of results
 * @returns {Promise<Array>} Array of news articles
 */
async function fetchGoogleNewsRSS(query, language = 'en', country = 'US', maxResults = 10) {
  try {
    // Construct Google News RSS URL
    const ceid = `${country}:${language}`;
    const encodedQuery = encodeURIComponent(query);
    const rssUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=${language}-${country}&gl=${country}&ceid=${ceid}`;

    console.log('Fetching from:', rssUrl);

    // Fetch RSS feed
    const response = await axios.get(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });

    // Parse XML with Cheerio
    const $ = cheerio.load(response.data, { xmlMode: true });

    const articles = [];

    // Extract news items
    $('item').each((index, element) => {
      if (index >= maxResults) return false; // Stop after maxResults

      const $item = $(element);
      
      // Extract data
      const title = $item.find('title').text();
      const link = $item.find('link').text();
      const pubDate = $item.find('pubDate').text();
      const description = $item.find('description').text();
      const source = $item.find('source').text();

      // Parse date
      let parsedDate = new Date(pubDate);
      if (isNaN(parsedDate.getTime())) {
        parsedDate = new Date();
      }

      // Clean description (remove HTML tags)
      const cleanDescription = description
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();

      articles.push({
        title: title,
        link: link,
        source: source || 'Google News',
        publishedAt: parsedDate.toISOString(),
        date: parsedDate.toISOString().split('T')[0],
        description: cleanDescription.substring(0, 300),
        excerpt: cleanDescription.substring(0, 200),
        timestamp: parsedDate.getTime()
      });
    });

    return articles;
  } catch (error) {
    console.error('Error fetching Google News RSS:', error.message);
    throw error;
  }
}

/**
 * Fetch equipment-specific news with military/defense context
 */
async function fetchEquipmentNews(equipmentName, country = 'US', maxResults = 15) {
  try {
    // Add defense/military context to search
    const searchQueries = [
      `${equipmentName} military`,
      `${equipmentName} defense`,
      `${equipmentName} weapon system`
    ];

    const allArticles = [];

    // Fetch from multiple queries in parallel
    const promises = searchQueries.map(query => 
      fetchGoogleNewsRSS(query, 'en', country, 5)
        .catch(err => {
          console.error(`Failed to fetch for query "${query}":`, err.message);
          return [];
        })
    );

    const results = await Promise.all(promises);
    
    // Flatten and combine results
    results.forEach(articles => allArticles.push(...articles));

    // Remove duplicates based on title
    const uniqueArticles = Array.from(
      new Map(allArticles.map(article => [article.title, article])).values()
    );

    // Sort by date (newest first)
    uniqueArticles.sort((a, b) => b.timestamp - a.timestamp);

    // Return limited results
    return uniqueArticles.slice(0, maxResults);
  } catch (error) {
    console.error('Error fetching equipment news:', error.message);
    return [];
  }
}

/**
 * Fetch news by topic with regional filtering
 */
async function fetchNewsByTopic(topic, regions = ['US', 'IN', 'GB']) {
  try {
    const allNews = [];

    for (const region of regions) {
      const articles = await fetchGoogleNewsRSS(topic, 'en', region, 5);
      
      // Add region info to each article
      articles.forEach(article => {
        article.region = region;
      });

      allNews.push(...articles);
    }

    // Remove duplicates
    const uniqueNews = Array.from(
      new Map(allNews.map(article => [article.link, article])).values()
    );

    // Sort by date
    uniqueNews.sort((a, b) => b.timestamp - a.timestamp);

    return uniqueNews;
  } catch (error) {
    console.error('Error fetching news by topic:', error.message);
    return [];
  }
}

/**
 * Get trending defense news (general military news)
 */
async function getTrendingDefenseNews(country = 'US', maxResults = 20) {
  try {
    const topics = [
      'military defense news',
      'defense technology',
      'military equipment',
      'defense systems'
    ];

    const allNews = [];

    for (const topic of topics) {
      const articles = await fetchGoogleNewsRSS(topic, 'en', country, 5);
      allNews.push(...articles);
    }

    // Remove duplicates
    const uniqueNews = Array.from(
      new Map(allNews.map(article => [article.link, article])).values()
    );

    // Sort by date
    uniqueNews.sort((a, b) => b.timestamp - a.timestamp);

    return uniqueNews.slice(0, maxResults);
  } catch (error) {
    console.error('Error fetching trending defense news:', error.message);
    return [];
  }
}

/**
 * Search news with date range filter
 */
async function fetchNewsWithDateRange(query, country, daysBack = 30) {
  try {
    const articles = await fetchGoogleNewsRSS(query, 'en', country, 50);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    const cutoffTimestamp = cutoffDate.getTime();

    // Filter articles by date
    const recentArticles = articles.filter(
      article => article.timestamp >= cutoffTimestamp
    );

    return recentArticles;
  } catch (error) {
    console.error('Error fetching news with date range:', error.message);
    return [];
  }
}

/**
 * Enhanced search with parallel regional queries
 */
async function multiRegionSearch(equipmentName) {
  try {
    const regions = [
      { code: 'US', name: 'United States' },
      { code: 'IN', name: 'India' },
      { code: 'GB', name: 'United Kingdom' },
      { code: 'AU', name: 'Australia' },
      { code: 'FR', name: 'France' }
    ];

    const promises = regions.map(async (region) => {
      const articles = await fetchGoogleNewsRSS(
        `${equipmentName} military`,
        'en',
        region.code,
        3
      );

      return {
        region: region.name,
        regionCode: region.code,
        articles: articles
      };
    });

    const results = await Promise.all(promises);
    return results;
  } catch (error) {
    console.error('Error in multi-region search:', error.message);
    return [];
  }
}

/**
 * Get news summary statistics
 */
function getNewsSummary(articles) {
  const summary = {
    total: articles.length,
    sources: [...new Set(articles.map(a => a.source))],
    dateRange: {
      oldest: null,
      newest: null
    },
    bySource: {}
  };

  if (articles.length > 0) {
    const timestamps = articles.map(a => a.timestamp).sort((a, b) => a - b);
    summary.dateRange.oldest = new Date(timestamps[0]).toISOString();
    summary.dateRange.newest = new Date(timestamps[timestamps.length - 1]).toISOString();

    // Count by source
    articles.forEach(article => {
      const source = article.source;
      summary.bySource[source] = (summary.bySource[source] || 0) + 1;
    });
  }

  return summary;
}

module.exports = {
  fetchGoogleNewsRSS,
  fetchEquipmentNews,
  fetchNewsByTopic,
  getTrendingDefenseNews,
  fetchNewsWithDateRange,
  multiRegionSearch,
  getNewsSummary
};

// ===== USAGE EXAMPLES =====

/*
// Example 1: Basic search
const articles = await fetchGoogleNewsRSS('BrahMos missile', 'en', 'IN', 10);
console.log('Found', articles.length, 'articles');

// Example 2: Equipment-specific news
const brahMosNews = await fetchEquipmentNews('BrahMos', 'IN', 15);
console.log('BrahMos news:', brahMosNews);

// Example 3: Multi-region search
const multiRegionResults = await multiRegionSearch('F-35');
console.log('Results from multiple regions:', multiRegionResults);

// Example 4: Trending defense news
const trending = await getTrendingDefenseNews('US', 20);
console.log('Trending:', trending);

// Example 5: Recent news (last 7 days)
const recent = await fetchNewsWithDateRange('HIMARS', 'US', 7);
console.log('Recent HIMARS news:', recent);

// Example 6: News summary
const summary = getNewsSummary(articles);
console.log('Summary:', summary);
*/