import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '../../lib/cn.js';
import { Button } from '../ui/index.js';
import {
  ChevronLeftIcon, ChevronRightIcon, XMarkIcon, ArrowUpTrayIcon,
} from '../ui/icons.jsx';

import ImportTypeSelector, { IMPORT_TYPES } from './ImportTypeSelector.jsx';
import FileUpload from './FileUpload.jsx';
import PreviewTable from './PreviewTable.jsx';
import ImportSettings from './ImportSettings.jsx';
import ImportProgress from './ImportProgress.jsx';
import SuccessScreen from './SuccessScreen.jsx';
import { parseCSV, detectImportType, detectFromFilename, matchPlayers } from './parseCSV.js';
import { importGameChanger, previewGameChanger, fetchPlayersByTeam, fetchTeams } from '../../api/index.js';

/* ═══════════════════════════════════════════════════════
   GameChanger Import Wizard
   ═══════════════════════════════════════════════════════
   A polished 6-step drawer wizard for importing data
   from GameChanger into the ZVBL system.

   Steps:
     1. Choose Import Type
     2. Upload File
     3. Preview & Match
     4. Import Settings
     5. Importing (progress)
     6. Success

   Backend expectations:
   - POST /api/import/gamechanger/preview
     → { headers: string[], rows: object[], detectedType: string }
   - POST /api/import/gamechanger
     → { success: true, players: number, games: number,
         stats: number, created: number, updated: number,
         skipped: number, message: string }
   ═══════════════════════════════════════════════════════ */

const STEPS = [
  { key: 'type',     label: 'Import Type' },
  { key: 'upload',   label: 'Upload File' },
  { key: 'preview',  label: 'Preview' },
  { key: 'settings', label: 'Settings' },
  { key: 'progress', label: 'Importing' },
  { key: 'success',  label: 'Done' },
];

export default function GameChangerImportWizard({ open, onClose, onNavigate }) {
  const overlayRef = useRef(null);

  /* ── State ── */
  const [step, setStep] = useState(0);
  const [importType, setImportType] = useState(null);
  const [file, setFile] = useState(null);

  // Preview data (client-parsed or from server)
  const [previewHeaders, setPreviewHeaders] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [matchedRows, setMatchedRows] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);

  // Settings
  const [settings, setSettings] = useState({
    teamId: null,
    seasonId: null,
    overwrite: false,
    onlyNew: true,
  });

  // Import progress
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('uploading');
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);

  /* ── Escape to close ── */
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape' && step < 4) onClose?.(); };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose, step]);

  /* ── Reset on open/close ── */
  useEffect(() => {
    if (open) {
      setStep(0);
      setImportType(null);
      setFile(null);
      setPreviewHeaders([]);
      setPreviewRows([]);
      setMatchedRows(null);
      setParsing(false);
      setParseError(null);
      setSettings({ teamId: null, seasonId: null, overwrite: false, onlyNew: true });
      setProgress(0);
      setProgressStatus('uploading');
      setImportResult(null);
      setImportError(null);
    }
  }, [open]);

  /* ── File parsing ── */
  const handleFileSelect = useCallback((f) => {
    setFile(f);

    // Auto-detect type from filename if not already chosen
    if (!importType) {
      const detected = detectFromFilename(f.name);
      if (detected) setImportType(detected);
    }
  }, [importType]);

  const parseFile = useCallback(async () => {
    if (!file) return;
    setParsing(true);
    setParseError(null);

    try {
      // Try server-side preview first
      try {
        const serverResult = await previewGameChanger(file, importType);
        if (serverResult?.headers?.length > 0) {
          setPreviewHeaders(serverResult.headers);
          setPreviewRows(serverResult.rows || []);
          if (serverResult.detectedType && !importType) {
            setImportType(serverResult.detectedType);
          }

          // Match players if applicable
          if ((importType === 'stats' || importType === 'roster') && serverResult.rows?.length > 0) {
            await matchPlayersFromPreview(serverResult.rows);
          }

          setParsing(false);
          return;
        }
      } catch {
        // Server preview unavailable, fall back to client-side parsing
      }

      // Client-side CSV parse
      const text = await file.text();
      const { headers, rows } = parseCSV(text);

      if (headers.length === 0) {
        setParseError('Could not parse the file. Please check that it\'s a valid CSV file.');
        setParsing(false);
        return;
      }

      // Auto-detect type from headers if not set
      if (!importType) {
        const detected = detectImportType(headers);
        if (detected) setImportType(detected);
      }

      setPreviewHeaders(headers);
      setPreviewRows(rows);

      // Match players for stats/roster imports
      if ((importType === 'stats' || importType === 'roster') && rows.length > 0) {
        await matchPlayersFromPreview(rows);
      }
    } catch (err) {
      setParseError(`Error parsing file: ${err.message}`);
    } finally {
      setParsing(false);
    }
  }, [file, importType]);

  const matchPlayersFromPreview = async (rows) => {
    try {
      // Get team players for matching
      let teamId = settings.teamId;
      if (!teamId) {
        const teams = await fetchTeams().catch(() => []);
        if (teams.length > 0) teamId = teams[0]?.id;
      }

      if (teamId) {
        const players = await fetchPlayersByTeam(teamId).catch(() => []);
        const matched = matchPlayers(rows, players);
        setMatchedRows(matched);
      } else {
        // No team to match against — all new
        setMatchedRows(rows.map(r => ({
          ...r,
          _importName: r['Player'] || r['Name'] || `${r['First'] || ''} ${r['Last'] || ''}`.trim(),
          _importJersey: r['#'] || r['Jersey'] || r['Number'] || '',
          _match: null,
          _confidence: 'new',
          _accepted: false,
        })));
      }
    } catch {
      setMatchedRows(null);
    }
  };

  /* ── Step advancement ── */
  const canAdvance = () => {
    switch (step) {
      case 0: return !!importType;
      case 1: return !!file;
      case 2: return previewRows.length > 0;
      case 3: return true;
      default: return false;
    }
  };

  const nextStep = useCallback(async () => {
    const next = step + 1;

    // Parse file when moving from Upload → Preview
    if (step === 1 && next === 2) {
      await parseFile();
    }

    // Execute import when moving from Settings → Progress
    if (step === 3 && next === 4) {
      executeImport();
    }

    setStep(next);
  }, [step, parseFile]);

  const prevStep = useCallback(() => {
    if (step > 0 && step < 4) setStep(step - 1);
  }, [step]);

  /* ── Accept all matches ── */
  const handleAcceptAll = () => {
    if (matchedRows) {
      setMatchedRows(matchedRows.map(r => ({ ...r, _accepted: true })));
    }
  };

  /* ── Execute import ── */
  const executeImport = async () => {
    setProgress(0);
    setProgressStatus('uploading');
    setImportError(null);

    // Simulate progress stages
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        const increment = Math.random() * 15;
        const next = Math.min(prev + increment, 90);

        // Update status messages
        if (next > 20 && next <= 40) setProgressStatus('parsing');
        else if (next > 40 && next <= 60) setProgressStatus('matching');
        else if (next > 60 && next <= 80) setProgressStatus('importing');
        else if (next > 80) setProgressStatus('finalizing');

        return next;
      });
    }, 500);

    try {
      const result = await importGameChanger(file, importType, {
        teamId: settings.teamId,
        seasonId: settings.seasonId,
        overwrite: settings.overwrite,
        onlyNew: settings.onlyNew,
      });

      clearInterval(progressInterval);
      setProgress(100);
      setProgressStatus('finalizing');

      // Short delay for UX satisfaction
      setTimeout(() => {
        setImportResult(result);
        setStep(5); // Success step
      }, 600);
    } catch (err) {
      clearInterval(progressInterval);
      setImportError(err.message || 'Import failed. Please try again.');
      setProgress(0);
    }
  };

  /* ── Import another file ── */
  const handleImportAnother = () => {
    setStep(0);
    setImportType(null);
    setFile(null);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setMatchedRows(null);
    setParsing(false);
    setParseError(null);
    setSettings({ teamId: null, seasonId: null, overwrite: false, onlyNew: true });
    setProgress(0);
    setProgressStatus('uploading');
    setImportResult(null);
    setImportError(null);
  };

  if (!open) return null;

  /* ── Render current step content ── */
  function renderStepContent() {
    switch (step) {
      case 0:
        return (
          <ImportTypeSelector
            selected={importType}
            onSelect={setImportType}
          />
        );

      case 1:
        return (
          <FileUpload
            importType={importType}
            file={file}
            onFileSelect={handleFileSelect}
            onFileClear={() => setFile(null)}
          />
        );

      case 2:
        if (parsing) {
          return (
            <div className="flex items-center justify-center py-16">
              <div className="text-center space-y-3 animate-pulse-soft">
                <div className="text-3xl">📄</div>
                <p className="text-sm text-gray-500 font-medium">Parsing your file…</p>
              </div>
            </div>
          );
        }
        if (parseError) {
          return (
            <div className="bg-baseball-50 rounded-xl border border-baseball-200 p-6 text-center">
              <p className="text-3xl mb-3 opacity-60">⚠️</p>
              <p className="text-sm font-semibold text-baseball-700">{parseError}</p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-4"
                onClick={() => { setFile(null); setStep(1); }}
              >
                Try Another File
              </Button>
            </div>
          );
        }
        return (
          <PreviewTable
            headers={previewHeaders}
            rows={previewRows}
            importType={importType}
            matchedRows={matchedRows}
            onAcceptAll={handleAcceptAll}
          />
        );

      case 3:
        return (
          <ImportSettings
            importType={importType}
            settings={settings}
            onChange={setSettings}
          />
        );

      case 4:
        return (
          <>
            <ImportProgress progress={progress} status={progressStatus} />
            {importError && (
              <div className="mt-4 bg-baseball-50 rounded-xl border border-baseball-200 p-4 text-center">
                <p className="text-sm font-semibold text-baseball-700">{importError}</p>
                <Button
                  size="sm"
                  variant="danger"
                  className="mt-3"
                  onClick={() => { setStep(3); setImportError(null); }}
                >
                  Go Back & Try Again
                </Button>
              </div>
            )}
          </>
        );

      case 5:
        return (
          <SuccessScreen
            result={importResult}
            onNavigate={onNavigate}
            onImportAnother={handleImportAnother}
            onClose={onClose}
          />
        );

      default:
        return null;
    }
  }

  const typeMeta = IMPORT_TYPES.find(t => t.key === importType);
  const isImporting = step === 4;
  const isDone = step === 5;
  const showFooter = !isImporting && !isDone;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === overlayRef.current && !isImporting) onClose?.(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Import from GameChanger"
    >
      <div className="ml-auto h-full bg-white shadow-2xl flex flex-col w-full max-w-xl animate-slide-right">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-field-100 flex items-center justify-center">
              <ArrowUpTrayIcon className="w-4 h-4 text-field-600" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-gray-900">
                Import from GameChanger
              </h2>
              {typeMeta && step > 0 && (
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                  {typeMeta.label}
                </p>
              )}
            </div>
          </div>
          {!isImporting && (
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* ── Step indicator ── */}
        {!isDone && (
          <div className="px-5 py-3 border-b border-gray-50 shrink-0">
            <StepIndicator steps={STEPS} current={step} />
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 scrollbar-thin">
          {renderStepContent()}
        </div>

        {/* ── Footer ── */}
        {showFooter && (
          <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-t border-gray-100 shrink-0">
            <div>
              {step > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<ChevronLeftIcon className="w-4 h-4" />}
                  onClick={prevStep}
                >
                  Back
                </Button>
              )}
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={!canAdvance()}
              onClick={nextStep}
              className={step === 3 ? 'bg-field-700 hover:bg-field-800' : ''}
            >
              {step === 3 ? (
                <>
                  <ArrowUpTrayIcon className="w-4 h-4" />
                  Start Import
                </>
              ) : (
                <>
                  Next
                  <ChevronRightIcon className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Step Indicator — shows wizard progress dots
   ═══════════════════════════════════════════════════════ */

function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-center gap-1" role="navigation" aria-label="Import steps">
      {steps.map((s, i) => {
        const isPast = i < current;
        const isCurrent = i === current;

        return (
          <div key={s.key} className="flex items-center gap-1 flex-1">
            {i > 0 && (
              <div className={cn(
                'flex-1 h-0.5 rounded-full transition-colors duration-300',
                isPast ? 'bg-field-500' : 'bg-gray-200',
              )} />
            )}
            <div
              className={cn(
                'flex items-center gap-1.5 shrink-0',
              )}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300',
                isCurrent && 'bg-field-600 text-white shadow-glow-green scale-110',
                isPast && 'bg-field-100 text-field-700',
                !isCurrent && !isPast && 'bg-gray-100 text-gray-400',
              )}>
                {isPast ? (
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={cn(
                'text-[10px] font-semibold hidden sm:inline whitespace-nowrap',
                isCurrent ? 'text-field-700' : isPast ? 'text-gray-500' : 'text-gray-400',
              )}>
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
