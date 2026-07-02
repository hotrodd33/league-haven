import React, { useState } from 'react';
import TournamentBracket from '../src/components/TournamentBracket';
import { fetchTestBracketData } from '../src/api/test/tourneyTestApi';

export default {
  title: 'Components/TournamentBracket',
  component: TournamentBracket,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    mockScenario: {
      control: 'select',
      options: ['MOCK_SINGLE_ELIM', 'MOCK_IN_PROGRESS', 'MOCK_DOUBLE_ELIM'],
      description: 'Select which mock dataset the test API should return'
    }
  }
};

const getEmptyBracketData = () => {
  return [
    {
      title: 'Quarterfinals',
      matches: [
        { id: 1, nextMatchId: 5, teams: [null, null] },
        { id: 2, nextMatchId: 5, teams: [null, null] },
        { id: 3, nextMatchId: 6, teams: [null, null] },
        { id: 4, nextMatchId: 6, teams: [null, null] },
      ]
    },
    {
      title: 'Semifinals',
      matches: [
        { id: 5, nextMatchId: 7, teams: [null, null] },
        { id: 6, nextMatchId: 7, teams: [null, null] },
      ]
    },
    {
      title: 'Championship',
      matches: [
        { id: 7, nextMatchId: null, teams: [null, null] },
      ]
    }
  ];
};

const BackendTestContainer = ({ mockScenario }) => {
  const [data, setData] = useState(getEmptyBracketData());
  const [loading, setLoading] = useState(false);

  const handleFetchData = async () => {
    setLoading(true);
    try {
      const result = await fetchTestBracketData(mockScenario);
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-screen bg-slate-900 p-8 flex justify-center items-center relative">
      <div className="absolute top-4 right-4 z-50 bg-slate-800/90 backdrop-blur-sm p-4 rounded-xl border border-slate-700 shadow-elevated w-72">
        <h3 className="text-white font-display text-lg mb-1">Backend Tester</h3>
        <p className="text-slate-400 text-xs mb-4">
          Click below to fetch tournament data from the test API endpoint.
        </p>
        
        <button 
          onClick={handleFetchData}
          disabled={loading}
          className={`w-full py-2 rounded-lg font-semibold transition-colors flex justify-center items-center gap-2 ${
            loading 
              ? 'bg-slate-600 text-slate-400 cursor-not-allowed' 
              : 'bg-sport hover:bg-sport-600 text-white'
          }`}
        >
          {loading ? 'Fetching...' : 'Fetch Test Data'}
        </button>
        
        <button 
          onClick={() => setData(getEmptyBracketData())}
          className="w-full mt-2 py-2 rounded-lg font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
        >
          Reset Bracket
        </button>
      </div>

      <div className="w-full max-w-7xl h-[800px]">
        <TournamentBracket 
          bracketName="Backend Test Bracket"
          bracketData={data} 
        />
      </div>
    </div>
  );
};

export const BackendTest = {
  render: (args) => <BackendTestContainer {...args} />,
  args: {
    mockScenario: 'MOCK_SINGLE_ELIM'
  }
};
