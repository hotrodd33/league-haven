import { useState, useRef, useCallback } from 'react';
import { cn } from '../../lib/cn.js';
import { Button, Badge } from '../ui/index.js';
import { ArrowUpTrayIcon, XMarkIcon } from '../ui/icons.jsx';

/* ═══════════════════════════════════════════════════════
   Step 2 — File Upload
   Drag-and-drop + file input with export instructions.
   ═══════════════════════════════════════════════════════ */

const ACCEPTED = '.csv,.ics,.txt,.tsv,.pdf';

const INSTRUCTIONS = {
  stats: {
    title: 'Export your season stats from GameChanger',
    steps: [
      'Open GameChanger and go to your team',
      'Navigate to the Stats tab',
      'Click "Export" or the download icon',
      'Select "All Stats" and download the CSV file',
      'Drop the file here or click to upload',
    ],
  },
  boxscore: {
    title: 'Export box score data from GameChanger',
    steps: [
      'Open any completed game in GameChanger',
      'Click "Box Score" to view the full box score',
      'Tap "Share" or "Print" and save as PDF',
      'Upload the PDF here — we\'ll parse it automatically',
    ],
  },
  schedule: {
    title: 'Export your team schedule from GameChanger',
    steps: [
      'Go to your team\'s Schedule in GameChanger',
      'Look for "Export" or "Calendar" button',
      'Download the iCal (.ics) or CSV file',
      'Drop the file here to import all games',
    ],
  },
  roster: {
    title: 'Export your roster from GameChanger',
    steps: [
      'Go to your team\'s Roster in GameChanger',
      'Click "Export" or "Download" roster',
      'Save the CSV file to your computer',
      'Upload it here to import all players',
    ],
  },
};

export default function FileUpload({ importType, file, onFileSelect, onFileClear }) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);
  const info = INSTRUCTIONS[importType] || INSTRUCTIONS.stats;

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) onFileSelect(f);
  }, [onFileSelect]);

  const handleChange = useCallback((e) => {
    const f = e.target.files?.[0];
    if (f) onFileSelect(f);
  }, [onFileSelect]);

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-6">
      {/* Export instructions */}
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">{info.title}</h4>
        <ol className="space-y-1.5">
          {info.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-blue-800">
              <span className="shrink-0 w-5 h-5 rounded-full bg-blue-200 text-blue-900 flex items-center justify-center text-[10px] font-bold mt-0.5">
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Drop zone or file preview */}
      {!file ? (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={cn(
            'relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer',
            dragActive
              ? 'border-field-500 bg-field-50 shadow-glow-green'
              : 'border-gray-300 bg-white hover:border-field-400 hover:bg-gray-50',
          )}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          aria-label="Upload file"
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            onChange={handleChange}
            className="hidden"
            aria-hidden="true"
          />

          <div className={cn(
            'w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center transition-colors',
            dragActive ? 'bg-field-100 text-field-600' : 'bg-gray-100 text-gray-400',
          )}>
            <ArrowUpTrayIcon className="w-7 h-7" />
          </div>

          <p className="text-sm font-semibold text-gray-700">
            {dragActive ? 'Drop your file here' : 'Drag & drop your file here'}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            or <span className="text-field-700 font-medium underline">browse files</span>
          </p>
          <p className="mt-3 text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
            CSV · ICS · TXT · TSV · PDF
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-field-50 flex items-center justify-center shrink-0">
              <ArrowUpTrayIcon className="w-5 h-5 text-field-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{file.name}</p>
              <p className="text-xs text-gray-400">{formatSize(file.size)}</p>
            </div>
            <Badge variant="success" dot>Ready</Badge>
            <button
              onClick={onFileClear}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Remove file"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
