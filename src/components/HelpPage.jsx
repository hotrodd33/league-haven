import { useState, useEffect } from 'react';
import { marked } from 'marked';

const API = import.meta.env.VITE_API_URL || '';

// Configure marked for safe rendering
marked.setOptions({ breaks: true, gfm: true });

const TABS = [
  { key: 'about', label: 'About', endpoint: 'readme' },
  { key: 'guide', label: 'User Guide', endpoint: 'guide' },
];

export default function HelpPage({ onBack, initialTab = 'about' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [content, setContent] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const tab = TABS.find(t => t.key === activeTab);
    if (!tab || content[activeTab]) return;

    setLoading(true);
    const token = (() => {
      try {
        const stored = localStorage.getItem('zvbl_auth');
        return stored ? JSON.parse(stored).token : null;
      } catch { return null; }
    })();

    fetch(`${API}/api/docs/${tab.endpoint}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.text() : Promise.reject(new Error('Failed to load')))
      .then(md => {
        setContent(prev => ({ ...prev, [activeTab]: md }));
      })
      .catch(() => {
        setContent(prev => ({ ...prev, [activeTab]: '# Unable to load content\n\nPlease try again later.' }));
      })
      .finally(() => setLoading(false));
  }, [activeTab, content]);

  const rendered = content[activeTab] ? marked.parse(content[activeTab]) : '';

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600 transition-colors">
          ← Back
        </button>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-gray-700">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-sm font-heading font-bold uppercase tracking-wide transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-blue-500 text-blue-400 bg-gray-800'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-750'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 sm:p-8">
          {loading ? (
            <div className="py-12 text-center text-gray-400 animate-pulse">Loading…</div>
          ) : (
            <article
              className="prose prose-invert prose-sm max-w-none
                prose-headings:font-heading prose-headings:tracking-wide
                prose-h1:text-2xl prose-h1:text-white prose-h1:border-b prose-h1:border-gray-700 prose-h1:pb-3 prose-h1:mb-6
                prose-h2:text-xl prose-h2:text-gray-100 prose-h2:mt-10 prose-h2:mb-4 prose-h2:border-b prose-h2:border-gray-700/50 prose-h2:pb-2
                prose-h3:text-base prose-h3:text-gray-200 prose-h3:mt-6 prose-h3:mb-3
                prose-p:text-gray-300 prose-p:leading-relaxed
                prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
                prose-strong:text-gray-100
                prose-code:text-amber-300 prose-code:bg-gray-900 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700 prose-pre:rounded-lg
                prose-table:border-collapse
                prose-th:bg-gray-900 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-gray-200 prose-th:text-xs prose-th:uppercase prose-th:tracking-wide prose-th:border prose-th:border-gray-700
                prose-td:px-3 prose-td:py-2 prose-td:text-gray-300 prose-td:border prose-td:border-gray-700
                prose-li:text-gray-300
                prose-hr:border-gray-700"
              dangerouslySetInnerHTML={{ __html: rendered }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
