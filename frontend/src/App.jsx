import React, { useState } from 'react';
import { Search, AlertCircle, ExternalLink, Calendar, MapPin, FileText, Image, Loader2, Download } from 'lucide-react';

const EquipmentTracker = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const searchEquipment = async (query) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`http://localhost:3001/api/search?query=${encodeURIComponent(query)}&region=IN`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Search failed');
      }
      
      setSearchResults(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch equipment data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      searchEquipment(searchQuery);
    }
  };

  const generateReport = async () => {
    if (!searchResults) return;
    
    try {
      const response = await fetch('http://localhost:3001/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchResults.query })
      });
      
      const data = await response.json();
      
      if (data.success && data.report) {
        const blob = new Blob([data.report], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${searchResults.query}_report_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Report generation failed:', err);
      alert('Failed to generate report');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="bg-slate-900/50 backdrop-blur-lg border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                <Search className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Military Equipment Intelligence</h1>
                <p className="text-xs text-slate-400">Defense Systems Analysis Platform</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-cyan-600/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 py-16">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold text-white mb-4">
              Equipment Intelligence Platform
            </h2>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              Search military equipment by name. Get comprehensive intelligence from ODIN database, technical specifications, and latest news.
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-slate-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch(e)}
                placeholder="Search equipment (e.g., BrahMos, F-35, S-400, Javelin)..."
                className="w-full pl-12 pr-32 py-4 bg-slate-800/50 backdrop-blur-lg border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Searching...' : 'Analyze'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 text-center">
            <span className="text-sm text-slate-400 mr-2">Examples:</span>
            {['BrahMos', 'Javelin', 'Patriot', 'S-400', 'HIMARS'].map((term) => (
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

      {loading && (
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-300">Analyzing equipment data from ODIN database...</p>
          <p className="text-slate-400 text-sm mt-2">This may take 10-20 seconds</p>
        </div>
      )}

      {error && (
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-200">{error}</p>
          </div>
        </div>
      )}

      {searchResults && !loading && (
        <div className="max-w-7xl mx-auto px-4 py-8 pb-16">
          <div className="bg-slate-800/50 backdrop-blur-lg border border-slate-700 rounded-xl p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h2 className="text-3xl font-bold text-white mb-2">
                  {searchResults.equipment.fullName}
                </h2>
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full">
                    {searchResults.equipment.type}
                  </span>
                  <span className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full">
                    {searchResults.equipment.status}
                  </span>
                  {searchResults.odinSuccess && (
                    <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full">
                      ODIN Verified
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={generateReport}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Generate Report
              </button>
            </div>
            <p className="text-slate-300 leading-relaxed">
              {searchResults.equipment.description}
            </p>
          </div>

          {searchResults.equipment.notes && (
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-semibold text-blue-300 mb-2">Intelligence Notes</h3>
              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">
                {searchResults.equipment.notes}
              </p>
            </div>
          )}

          <div className="bg-slate-800/30 backdrop-blur-lg border border-slate-700 rounded-xl overflow-hidden mb-6">
            <div className="flex border-b border-slate-700 overflow-x-auto">
              {['overview', 'specifications', 'intelligence', 'news'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-shrink-0 px-6 py-4 text-sm font-medium transition-colors ${
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
              {activeTab === 'overview' && (
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    {searchResults.equipment.images && searchResults.equipment.images.length > 0 && (
                      <>
                        <h3 className="text-lg font-semibold text-white mb-4">Gallery</h3>
                        <div className="grid grid-cols-2 gap-3 mb-6">
                          {searchResults.equipment.images.map((img, idx) => (
                            <div key={idx} className="aspect-video bg-slate-900 rounded-lg overflow-hidden">
                              <img src={img} alt={`Equipment ${idx + 1}`} className="w-full h-full object-cover" onError={(e) => e.target.style.display = 'none'} />
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    
                    {searchResults.operators && searchResults.operators.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-3">Operators</h3>
                        <div className="flex flex-wrap gap-2">
                          {searchResults.operators.map((op, idx) => (
                            <span key={idx} className="px-3 py-1 bg-slate-700 text-slate-300 rounded-lg text-sm">
                              {op}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    {searchResults.variants && searchResults.variants.length > 0 && (
                      <>
                        <h3 className="text-lg font-semibold text-white mb-4">Variants</h3>
                        <div className="space-y-2">
                          {searchResults.variants.map((variant, idx) => (
                            <div key={idx} className="bg-slate-900/50 rounded-lg p-3 text-slate-300">
                              {variant}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'specifications' && (
                <div>
                  {searchResults.equipment.specifications && Object.keys(searchResults.equipment.specifications).length > 0 ? (
                    <div className="grid md:grid-cols-2 gap-4">
                      {Object.entries(searchResults.equipment.specifications).map(([key, value]) => (
                        <div key={key} className="bg-slate-900/50 rounded-lg p-4">
                          <div className="text-sm text-slate-400 mb-1">
                            {key}
                          </div>
                          <div className="text-lg font-semibold text-white">{value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-400">
                      No detailed specifications available
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'intelligence' && (
                <div className="space-y-6">
                  {searchResults.equipment.intelligence && Object.entries(searchResults.equipment.intelligence).map(([key, value]) => (
                    value && (
                      <div key={key} className="bg-slate-900/50 rounded-lg p-5">
                        <h3 className="text-lg font-semibold text-white mb-3 capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </h3>
                        <p className="text-slate-300 whitespace-pre-line">{value}</p>
                      </div>
                    )
                  ))}
                  {(!searchResults.equipment.intelligence || Object.values(searchResults.equipment.intelligence).every(v => !v)) && (
                    <div className="text-center py-12 text-slate-400">
                      No detailed intelligence data available
                    </div>
                  )}
                </div>
              )}

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
                            <h4 className="text-lg font-semibold text-white flex-1 pr-4">{item.title}</h4>
                            <ExternalLink className="w-5 h-5 text-slate-400 flex-shrink-0" />
                          </div>
                          {item.excerpt && (
                            <p className="text-slate-300 mb-3">{item.excerpt}</p>
                          )}
                          <div className="flex items-center gap-4 text-sm text-slate-400">
                            <span>{item.source}</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {item.date}
                            </span>
                            {item.region && (
                              <span className="px-2 py-0.5 bg-slate-800 rounded text-xs">
                                {item.region}
                              </span>
                            )}
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-400">
                      No recent news available
                    </div>
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