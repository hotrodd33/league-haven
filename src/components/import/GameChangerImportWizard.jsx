import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '../../lib/cn.js';
import { Button } from '../ui/index.js';
import {
  ChevronLeftIcon, ChevronRightIcon, XMarkIcon, ArrowUpTrayIcon,
} from '../ui/icons.jsx';

import ImportTypeSelector, { IMPORT_TYPES } from './ImportTypeSelector.jsx';
import FileUpload from './FileUpload.jsx';
import PreviewTable from './PreviewTable.jsx';
import TeamMapper from './TeamMapper.jsx';
import PlayerMapper from './PlayerMapper.jsx';
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
     4. Map Teams (shown when unmatched teams detected)
     5. Import Settings
     6. Importing (progress)
     7. Success

   Backend expectations:
   - POST /api/import/gamechanger/preview
     → { headers: string[], rows: object[], detectedType: string,
         unmatchedTeams: string[], matchedTeams: object, teamsList: object[] }
   - POST /api/import/gamechanger
     → { success: true, players: number, games: number,
         stats: number, created: number, updated: number,
         skipped: number, message: string }
   ═══════════════════════════════════════════════════════ */

const STEPS = [
  { key: 'type',     label: 'Import Type' },
  { key: 'upload',   label: 'Upload File' },
  { key: 'preview',  label: 'Preview' },
  { key: 'teams',    label: 'Map Teams' },
  { key: 'players',  label: 'Map Players' },
  { key: 'settings', label: 'Settings' },
  { key: 'progress', label: 'Importing' },
  { key: 'success',  label: 'Done' },
];

export default function GameChangerImportWizard({ open, onClose, onNavigate, gameId }) {
  const overlayRef = useRef(null);

  /* ── State ── */
  const [step, setStep] = useState(0);
  const [importType, setImportType] = useState(null);
  const [file, setFile] = useState(null);
  const [pastedText, setPastedText] = useState('');

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

  // Team mapping (for unmatched GameChanger team names)
  const [unmatchedTeams, setUnmatchedTeams] = useState([]);
  const [matchedTeams, setMatchedTeams] = useState({});
  const [teamMappings, setTeamMappings] = useState({});
  const [teamsList, setTeamsList] = useState([]);

  // Player mapping (for pitcher → player resolution)
  const [pitcherMappings, setPitcherMappings] = useState([]);
  const [playersByTeam, setPlayersByTeam] = useState({});
  const [playerMappings, setPlayerMappings] = useState({});

  // Import progress
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('uploading');
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);

  /* ── Escape to close ── */
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape' && step < 6) onClose?.(); };
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
      setStep(gameId ? 1 : 0);
      setImportType(gameId ? 'boxscore' : null);
      setFile(null);
      setPastedText('');
      setPreviewHeaders([]);
      setPreviewRows([]);
      setMatchedRows(null);
      setParsing(false);
      setParseError(null);
      setSettings({ teamId: null, seasonId: null, overwrite: false, onlyNew: true });
      setUnmatchedTeams([]);
      setMatchedTeams({});
      setTeamMappings({});
      setTeamsList([]);
      setPitcherMappings([]);
      setPlayersByTeam({});
      setPlayerMappings({});
      setProgress(0);
      setProgressStatus('uploading');
      setImportResult(null);
      setImportError(null);
    }
  }, [open, gameId]);

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
    const input = pastedText?.trim() ? pastedText.trim() : file;
    if (!input) return;
    setParsing(true);
    setParseError(null);

    try {
      // Try server-side preview first
      try {
        const serverResult = await previewGameChanger(input, importType);
        // DEBUG: temporary — inspect raw PDF text extraction in browser console
        if (serverResult?._debug || serverResult?._rawText) {
          console.log('=== BOX SCORE DEBUG ===');
          console.log('Raw text:', serverResult._rawText);
          console.log('Debug:', JSON.stringify(serverResult._debug, null, 2));
        }
        if (serverResult?.headers?.length > 0) {
          setPreviewHeaders(serverResult.headers);
          setPreviewRows(serverResult.rows || []);
          if (serverResult.detectedType && !importType) {
            setImportType(serverResult.detectedType);
          }

          // Capture team matching info from the preview
          if (serverResult.unmatchedTeams) setUnmatchedTeams(serverResult.unmatchedTeams);
          if (serverResult.matchedTeams) setMatchedTeams(serverResult.matchedTeams);
          if (serverResult.teamsList) setTeamsList(serverResult.teamsList);

          // Capture pitcher mapping info from the preview
          if (serverResult.pitcherMappings) setPitcherMappings(serverResult.pitcherMappings);
          if (serverResult.playersByTeam) setPlayersByTeam(serverResult.playersByTeam);

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
  }, [file, pastedText, importType]);

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
      case 1: return !!file || (pastedText && pastedText.trim().length > 20);
      case 2: return previewRows.length > 0;
      case 3: // Map Teams — all unmatched teams must have a mapping
        return unmatchedTeams.length === 0 ||
          unmatchedTeams.every(t => teamMappings[t]);
      case 4: return true; // Map Players — always allow (auto-create is fine)
      case 5: return true; // Settings
      default: return false;
    }
  };

  const nextStep = useCallback(async () => {
    let next = step + 1;

    // Parse file when moving from Upload → Preview
    if (step === 1 && next === 2) {
      await parseFile();
    }

    // Auto-skip "Map Teams" step if no unmatched teams
    if (next === 3 && unmatchedTeams.length === 0) {
      next = 4;
    }

    // Auto-skip "Map Players" step if no pitchers detected
    if (next === 4 && pitcherMappings.length === 0) {
      next = 5;
    }

    // When entering "Map Players", resolve team IDs from mappings and fetch player lists
    if (next === 4 && pitcherMappings.length > 0) {
      // Build resolved team IDs: merge auto-matched teams + user-mapped teams
      const resolvedTeamIds = new Set();
      for (const pm of pitcherMappings) {
        // If already matched during preview, use that
        if (pm.teamId) {
          resolvedTeamIds.add(pm.teamId);
        } else if (pm.teamName && teamMappings[pm.teamName]) {
          // User mapped this team in step 3
          resolvedTeamIds.add(parseInt(teamMappings[pm.teamName]));
        }
      }

      // Fetch player lists for any team IDs we don't already have
      const updatedPlayersByTeam = { ...playersByTeam };
      const updatedPitcherMappings = [...pitcherMappings];

      for (const tid of resolvedTeamIds) {
        if (!updatedPlayersByTeam[tid]) {
          try {
            const players = await fetchPlayersByTeam(tid);
            updatedPlayersByTeam[tid] = players.map(p => ({
              id: p.id,
              first_name: p.first_name,
              last_name: p.last_name,
              jersey_number: p.jersey_number,
            }));
          } catch { /* ignore */ }
        }
      }

      // Update pitcher mappings with resolved team IDs from team mappings
      for (let i = 0; i < updatedPitcherMappings.length; i++) {
        const pm = updatedPitcherMappings[i];
        if (!pm.teamId && pm.teamName && teamMappings[pm.teamName]) {
          updatedPitcherMappings[i] = {
            ...pm,
            teamId: parseInt(teamMappings[pm.teamName]),
          };
        }
      }

      setPlayersByTeam(updatedPlayersByTeam);
      setPitcherMappings(updatedPitcherMappings);
    }

    // Execute import when moving from Settings → Progress
    if (step === 5 && next === 6) {
      executeImport();
    }

    setStep(next);
  }, [step, parseFile, unmatchedTeams, pitcherMappings]);

  const prevStep = useCallback(() => {
    if (step > 0 && step < 6) {
      let prev = step - 1;
      // Skip back over "Map Players" if it was skipped going forward
      if (prev === 4 && pitcherMappings.length === 0) {
        prev = 3;
      }
      // Skip back over "Map Teams" if it was skipped going forward
      if (prev === 3 && unmatchedTeams.length === 0) {
        prev = 2;
      }
      setStep(prev);
    }
  }, [step, unmatchedTeams, pitcherMappings]);

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
      // Build resolved player mappings: gcName → playerId or "__new__"
      const resolvedPlayerMappings = {};
      for (const pm of pitcherMappings) {
        const userChoice = playerMappings[pm.gcName];
        if (userChoice !== undefined && userChoice !== '') {
          resolvedPlayerMappings[pm.gcName] = userChoice;
        } else if (pm.suggestedPlayerId) {
          resolvedPlayerMappings[pm.gcName] = String(pm.suggestedPlayerId);
        }
      }

      const input = pastedText?.trim() ? pastedText.trim() : file;
      const result = await importGameChanger(input, importType, {
        gameId: gameId || undefined,
        teamId: settings.teamId,
        seasonId: settings.seasonId,
        overwrite: settings.overwrite,
        onlyNew: settings.onlyNew,
        teamMappings: Object.keys(teamMappings).length > 0 ? teamMappings : undefined,
        playerMappings: Object.keys(resolvedPlayerMappings).length > 0 ? resolvedPlayerMappings : undefined,
      });

      clearInterval(progressInterval);
      setProgress(100);
      setProgressStatus('finalizing');

      // Short delay for UX satisfaction
      setTimeout(() => {
        setImportResult(result);
        setStep(7); // Success step
      }, 600);
    } catch (err) {
      clearInterval(progressInterval);
      setImportError(err.message || 'Import failed. Please try again.');
      setProgress(0);
    }
  };

  /* ── Import another file ── */
  const handleImportAnother = () => {
    setStep(gameId ? 1 : 0);
    setImportType(gameId ? 'boxscore' : null);
    setFile(null);
    setPastedText('');
    setPreviewHeaders([]);
    setPreviewRows([]);
    setMatchedRows(null);
    setParsing(false);
    setParseError(null);
    setSettings({ teamId: null, seasonId: null, overwrite: false, onlyNew: true });
    setUnmatchedTeams([]);
    setMatchedTeams({});
    setTeamMappings({});
    setTeamsList([]);
    setPitcherMappings([]);
    setPlayersByTeam({});
    setPlayerMappings({});
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
            pastedText={pastedText}
            onPastedTextChange={setPastedText}
          />
        );

      case 2:
        if (parsing) {
          return (
            <div className="flex items-center justify-center py-16">
              <div className="text-center space-y-3 animate-pulse-soft">
                <div className="text-3xl">📄</div>
                <p className="text-sm text-gray-400 font-medium">Parsing your file…</p>
              </div>
            </div>
          );
        }
        if (parseError) {
          return (
            <div className="bg-baseball-900/30 rounded-xl border border-baseball-700 p-6 text-center">
              <p className="text-3xl mb-3 opacity-60">⚠️</p>
              <p className="text-sm font-semibold text-baseball-300">{parseError}</p>
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
          <TeamMapper
            unmatchedTeams={unmatchedTeams}
            matchedTeams={matchedTeams}
            teamsList={teamsList}
            mappings={teamMappings}
            onChange={setTeamMappings}
          />
        );

      case 4:
        return (
          <PlayerMapper
            pitcherMappings={pitcherMappings}
            playersByTeam={playersByTeam}
            mappings={playerMappings}
            onChange={setPlayerMappings}
          />
        );

      case 5:
        return (
          <ImportSettings
            importType={importType}
            settings={settings}
            onChange={setSettings}
          />
        );

      case 6:
        return (
          <>
            <ImportProgress progress={progress} status={progressStatus} />
            {importError && (
              <div className="mt-4 bg-baseball-900/30 rounded-xl border border-baseball-700 p-4 text-center">
                <p className="text-sm font-semibold text-baseball-300">{importError}</p>
                <Button
                  size="sm"
                  variant="danger"
                  className="mt-3"
                  onClick={() => { setStep(5); setImportError(null); }}
                >
                  Go Back & Try Again
                </Button>
              </div>
            )}
          </>
        );

      case 7:
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
  const isImporting = step === 6;
  const isDone = step === 7;
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
      <div className="ml-auto h-full bg-gray-800 shadow-2xl flex flex-col w-full max-w-xl animate-slide-right">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0 bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-field-900/30 flex items-center justify-center">
              <ArrowUpTrayIcon className="w-4 h-4 text-field-600" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold text-white">
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
              className="p-1.5 text-gray-400 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
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
          <div className="flex items-center justify-between px-5 py-3 bg-gray-900 border-t border-gray-700 shrink-0">
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
                isPast ? 'bg-field-900/200' : 'bg-gray-700',
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
                isPast && 'bg-field-900/30 text-field-300',
                !isCurrent && !isPast && 'bg-gray-800 text-gray-400',
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
                isCurrent ? 'text-field-300' : isPast ? 'text-gray-400' : 'text-gray-400',
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
