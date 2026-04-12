import { useState } from 'react';
import { marked } from 'marked';
import readmeRaw from '../../README.md?raw';
import guideRaw from '../../USER_GUIDE.md?raw';

// Configure marked for safe rendering
marked.setOptions({ breaks: true, gfm: true });

const TABS = [
  { key: 'about', label: 'About' },
  { key: 'guide', label: 'User Guide' },
];

const DOCS = {
  about: readmeRaw,
  guide: guideRaw,
};

export default function HelpPage({ onBack, initialTab = 'about' }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  const rendered = marked.parse(DOCS[activeTab] || '');

  return (
    <div>
      <style>{`
        .md-content { color: #d1d5db; line-height: 1.75; font-size: 0.9rem; }
        .md-content h1 { font-size: 1.6rem; font-weight: 700; color: #fff; border-bottom: 1px solid #374151; padding-bottom: 0.75rem; margin: 2rem 0 1.25rem; }
        .md-content h1:first-child { margin-top: 0; }
        .md-content h2 { font-size: 1.3rem; font-weight: 700; color: #e5e7eb; border-bottom: 1px solid #374151; padding-bottom: 0.5rem; margin: 2rem 0 1rem; }
        .md-content h3 { font-size: 1.05rem; font-weight: 600; color: #e5e7eb; margin: 1.5rem 0 0.75rem; }
        .md-content h4 { font-size: 0.95rem; font-weight: 600; color: #d1d5db; margin: 1.25rem 0 0.5rem; }
        .md-content p { margin: 0.75rem 0; }
        .md-content a { color: #60a5fa; text-decoration: none; }
        .md-content a:hover { text-decoration: underline; }
        .md-content strong { color: #f3f4f6; font-weight: 600; }
        .md-content em { color: #d1d5db; }
        .md-content code { background: #1f2937; color: #fbbf24; padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.8rem; }
        .md-content pre { background: #1f2937; border: 1px solid #374151; border-radius: 0.5rem; padding: 1rem; overflow-x: auto; margin: 1rem 0; }
        .md-content pre code { background: none; padding: 0; color: #d1d5db; font-size: 0.8rem; }
        .md-content ul, .md-content ol { padding-left: 1.5rem; margin: 0.75rem 0; }
        .md-content li { margin: 0.35rem 0; color: #d1d5db; }
        .md-content li::marker { color: #6b7280; }
        .md-content ul { list-style-type: disc; }
        .md-content ol { list-style-type: decimal; }
        .md-content ul ul { list-style-type: circle; }
        .md-content blockquote { border-left: 3px solid #3b82f6; padding: 0.5rem 1rem; margin: 1rem 0; background: #1e293b; border-radius: 0 0.375rem 0.375rem 0; color: #93c5fd; }
        .md-content hr { border: none; border-top: 1px solid #374151; margin: 2rem 0; }
        .md-content table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.85rem; }
        .md-content th { background: #1f2937; color: #e5e7eb; font-weight: 600; text-align: left; padding: 0.6rem 0.75rem; border: 1px solid #374151; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
        .md-content td { padding: 0.5rem 0.75rem; border: 1px solid #374151; color: #d1d5db; }
        .md-content tr:nth-child(even) td { background: #111827; }
        .md-content img { max-width: 100%; border-radius: 0.5rem; }
      `}</style>

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
            <div
              className="md-content"
              dangerouslySetInnerHTML={{ __html: rendered }}
            />
        </div>
      </div>
    </div>
  );
}
