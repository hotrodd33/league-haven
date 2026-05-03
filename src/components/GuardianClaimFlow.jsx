import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchPlayersForClaim, submitGuardianClaim, fetchMyClaims } from '../api/index.js';
import { Button, Card, CardBody, Input } from './ui';

/**
 * 3-step wizard for guardians to claim a player:
 *   Step 1 — search by name
 *   Step 2 — confirm the selected player
 *   Step 3 — success / pending message
 */
export default function GuardianClaimFlow({ onDone }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1); // 1 | 2 | 3
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const searchRef = useRef(null);

  // ── Step 1: search ──────────────────────────────────────────────
  const {
    data: results = [],
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['player-search-claim', query],
    queryFn: () => searchPlayersForClaim(query),
    enabled: false,
  });

  async function handleSearch(e) {
    e.preventDefault();
    setSearchError('');
    if (query.trim().length < 2) {
      setSearchError('Enter at least 2 characters.');
      return;
    }
    setSearched(true);
    await refetch();
  }

  function handleSelectPlayer(player) {
    setSelectedPlayer(player);
    setStep(2);
  }

  // ── Step 2: confirm + submit ────────────────────────────────────
  const claimMutation = useMutation({
    mutationFn: () => submitGuardianClaim(selectedPlayer.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-guardian-claims'] });
      setStep(3);
    },
    onError: (err) => {
      setSubmitError(err.message || 'Failed to submit claim.');
    },
  });

  function handleBack() {
    setStep(1);
    setSubmitError('');
  }

  // ── Step 3: success ─────────────────────────────────────────────
  function handleDone() {
    if (onDone) onDone();
  }

  return (
    <Card variant="signal" className="max-w-lg mx-auto">
      <CardBody className="p-6 space-y-4">
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          {['Search', 'Confirm', 'Done'].map((label, i) => (
            <span key={label} className="flex items-center gap-1">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                ${step === i + 1 ? 'bg-chrome-500 text-white' : step > i + 1 ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                {step > i + 1 ? '✓' : i + 1}
              </span>
              <span className={step === i + 1 ? 'text-chrome-300 font-medium' : ''}>{label}</span>
              {i < 2 && <span className="text-gray-600 mx-1">→</span>}
            </span>
          ))}
        </div>

        {/* ── Step 1: Search ── */}
        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-chrome-200">Find Your Player</h2>
            <p className="text-sm text-gray-400">
              Search by your child's first or last name. You'll need to confirm the match before submitting a claim request.
            </p>
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                ref={searchRef}
                id="claim-search"
                placeholder="e.g. Smith or Alex"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSearched(false); }}
                className="flex-1"
                autoComplete="off"
              />
              <Button type="submit" size="sm" loading={isFetching}>
                Search
              </Button>
            </form>
            {searchError && <p className="text-sm text-red-400">{searchError}</p>}

            {searched && !isFetching && results.length === 0 && (
              <p className="text-sm text-gray-400 italic">No players found matching "{query}". Try a different name.</p>
            )}

            {results.length > 0 && (
              <ul className="divide-y divide-gray-700 rounded border border-gray-700 overflow-hidden">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectPlayer(p)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-700/60 transition-colors"
                    >
                      <span className="font-medium text-gray-100">{p.first_name} {p.last_name}</span>
                      {p.dob_year && (
                        <span className="ml-2 text-xs text-gray-400">born {p.dob_year}</span>
                      )}
                      {p.teams && (
                        <span className="ml-2 text-xs text-gray-500">{p.teams}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* ── Step 2: Confirm ── */}
        {step === 2 && selectedPlayer && (
          <>
            <h2 className="text-lg font-semibold text-chrome-200">Confirm Your Player</h2>
            <p className="text-sm text-gray-400">
              Is this the player you are the parent or legal guardian for?
            </p>
            <div className="rounded border border-chrome-600/40 bg-chrome-900/30 p-4 space-y-1">
              <p className="text-base font-semibold text-gray-100">
                {selectedPlayer.first_name} {selectedPlayer.last_name}
              </p>
              {selectedPlayer.dob_year && (
                <p className="text-sm text-gray-400">Born {selectedPlayer.dob_year}</p>
              )}
              {selectedPlayer.teams && (
                <p className="text-sm text-gray-400">Teams: {selectedPlayer.teams}</p>
              )}
            </div>
            <p className="text-xs text-gray-500">
              After you submit, a league admin will review and approve your request. You'll receive an email notification.
            </p>
            {submitError && <p className="text-sm text-red-400">{submitError}</p>}
            <div className="flex gap-3">
              <Button variant="secondary" size="sm" onClick={handleBack}>
                ← Back
              </Button>
              <Button
                size="sm"
                loading={claimMutation.isPending}
                onClick={() => claimMutation.mutate()}
                className="flex-1"
              >
                {claimMutation.isPending ? 'Submitting…' : 'Submit Claim Request'}
              </Button>
            </div>
          </>
        )}

        {/* ── Step 3: Success ── */}
        {step === 3 && (
          <>
            <div className="text-center py-4 space-y-3">
              <div className="text-4xl">✅</div>
              <h2 className="text-lg font-semibold text-chrome-200">Request Submitted!</h2>
              <p className="text-sm text-gray-400">
                Your claim for <strong className="text-gray-200">{selectedPlayer?.first_name} {selectedPlayer?.last_name}</strong> has
                been sent to a league admin for review. You'll receive an email once it's approved or denied.
              </p>
            </div>
            <Button className="w-full" size="sm" onClick={handleDone}>
              Continue
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
