import React, { useState } from 'react';
import { Search, AlertCircle, ExternalLink, Calendar, MapPin, FileText, Loader2, Image } from 'lucide-react';

const EquipmentTracker = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // API call to Node.js backend
  const searchEquipment = async (query) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`http://localhost:3001/api/search?query=${encodeURIComponent(query)}&region=IN`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('API Response:', data);
      setSearchResults(data);
    } catch (err) {
      console.error('Search error:', err);
      setError(`Failed to fetch equipment data: ${err.message}. Make sure the backend is running on port 3001.`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    if (searchQuery.trim()) {
      searchEquipment(searchQuery);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleImageSearch = () => {
    alert('Image search functionality would integrate with computer vision API to identify equipment from images');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/50 backdrop-blur-lg border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                <Search className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Military Equipment Tracker</h1>
                <p className="text-xs text-slate-400">Global Defense Systems Database</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-cyan-600/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 py-16">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold text-white mb-4">
              Equipment Intelligence Platform
            </h2>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              Search military equipment by name or image. Get comprehensive data from ODIN, news sources, and technical documentation.
            </p>
          </div>

          {/* Search Bar - Fixed */}
          <div className="max-w-3xl mx-auto">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-slate-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Search equipment (e.g., BrahMos, F-35, Patriot)..."
                className="w-full pl-12 pr-32 py-4 bg-slate-800/50 backdrop-blur-lg border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-2">
                <button
                  onClick={handleImageSearch}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                  title="Search by image"
                >
                  <Image className="w-5 h-5" />
                </button>
                <button
                  onClick={handleSearch}
                  className="px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-cyan-700 transition-all"
                >
                  Search
                </button>
              </div>
            </div>
          </div>

          {/* Quick Search Examples */}
          <div className="mt-4 text-center">
            <span className="text-sm text-slate-400 mr-2">Try:</span>
            {['BrahMos', 'F-35', 'S-400', 'HIMARS'].map((term) => (
              <button
                key={term}
                onClick={() => {
                  setSearchQuery(term);
                  searchEquipment(term);
                }}
                className="inline-block mx-1 px-3 py-1 bg-slate-800 text-slate-300 rounded-full text-sm hover:bg-slate-700 transition-colors"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-300">Searching global databases...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-200">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {searchResults && !loading && (
        <div className="max-w-7xl mx-auto px-4 py-8 pb-16">
          {/* Equipment Header */}
          <div className="bg-slate-800/50 backdrop-blur-lg border border-slate-700 rounded-xl p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h2 className="text-3xl font-bold text-white mb-2">
                  {searchResults.equipment?.fullName || searchResults.equipment?.name || 'Equipment'}
                </h2>
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  {searchResults.equipment?.type && (
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full">
                      {searchResults.equipment.type}
                    </span>
                  )}
                  {searchResults.equipment?.origin && (
                    <span className="text-slate-400 flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {searchResults.equipment.origin}
                    </span>
                  )}
                  {searchResults.equipment?.status && (
                    <span className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full">
                      {searchResults.equipment.status}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-slate-300 leading-relaxed">
              {searchResults.equipment?.description || 'No description available'}
            </p>
          </div>

          {/* Tabs */}
          <div className="bg-slate-800/30 backdrop-blur-lg border border-slate-700 rounded-xl overflow-hidden mb-6">
            <div className="flex border-b border-slate-700 overflow-x-auto">
              {['overview', 'specifications', 'news', 'articles'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab
                      ? 'bg-slate-700 text-white border-b-2 border-blue-500'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Gallery</h3>
                    {searchResults.equipment?.images?.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3">
                        {searchResults.equipment.images.map((img, idx) => (
                          <div key={idx} className="aspect-video bg-slate-900 rounded-lg overflow-hidden">
                            <img src={img} alt={`Equipment ${idx + 1}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-400">No images available</p>
                    )}
                    
                    <div className="mt-6">
                      <h3 className="text-lg font-semibold text-white mb-3">Operators</h3>
                      {searchResults.equipment?.operators?.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {searchResults.equipment.operators.map((op, idx) => (
                            <span key={idx} className="px-3 py-1 bg-slate-700 text-slate-300 rounded-lg text-sm">
                              {op}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400">No operator information available</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Variants</h3>
                    {searchResults.equipment?.variants?.length > 0 ? (
                      <div className="space-y-2">
                        {searchResults.equipment.variants.map((variant, idx) => (
                          <div key={idx} className="bg-slate-900/50 rounded-lg p-3 text-slate-300">
                            {variant}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-400">No variant information available</p>
                    )}
                  </div>
                </div>
              )}

              {/* Specifications Tab */}
              {activeTab === 'specifications' && (
                <div>
                  {searchResults.equipment?.specifications && Object.keys(searchResults.equipment.specifications).length > 0 ? (
                    <div className="grid md:grid-cols-2 gap-4">
                      {Object.entries(searchResults.equipment.specifications).map(([key, value]) => (
                        <div key={key} className="bg-slate-900/50 rounded-lg p-4">
                          <div className="text-sm text-slate-400 mb-1">
                            {key.charAt(0).toUpperCase() + key.slice(1)}
                          </div>
                          <div className="text-lg font-semibold text-white">{value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400">No specifications available</p>
                  )}
                </div>
              )}

              {/* News Tab */}
              {activeTab === 'news' && (
                <div>
                  {searchResults.news && searchResults.news.length > 0 ? (
                    <div className="space-y-4">
                      {searchResults.news.map((item, idx) => (
                        <a
                          key={idx}
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block bg-slate-900/50 rounded-lg p-5 hover:bg-slate-900/70 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="text-lg font-semibold text-white flex-1">{item.title}</h4>
                            <ExternalLink className="w-5 h-5 text-slate-400 ml-3 flex-shrink-0" />
                          </div>
                          <p className="text-slate-300 mb-3">{item.excerpt}</p>
                          <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
                            <span>{item.source}</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {item.date}
                            </span>
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400">No news articles available</p>
                  )}
                </div>
              )}

              {/* Articles Tab */}
              {activeTab === 'articles' && (
                <div>
                  {searchResults.articles && searchResults.articles.length > 0 ? (
                    <div className="space-y-4">
                      {searchResults.articles.map((item, idx) => (
                        <a
                          key={idx}
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block bg-slate-900/50 rounded-lg p-5 hover:bg-slate-900/70 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="text-lg font-semibold text-white flex-1">{item.title}</h4>
                            <FileText className="w-5 h-5 text-slate-400 ml-3 flex-shrink-0" />
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
                            {item.type && <span className="px-2 py-1 bg-slate-800 rounded">{item.type}</span>}
                            <span>{item.source}</span>
                            {item.date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {item.date}
                              </span>
                            )}
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400">No research articles available</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EquipmentTracker;