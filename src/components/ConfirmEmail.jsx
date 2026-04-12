import { useState, useEffect } from 'react';
import { confirmEmail } from '../api/index.js';

export default function ConfirmEmail({ token, onDone }) {
  const [status, setStatus] = useState('confirming'); // 'confirming' | 'success' | 'error'
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    confirmEmail(token)
      .then((result) => {
        setName(result.name || '');
        setStatus('success');
      })
      .catch((err) => {
        setErrorMsg(err.message || 'Confirmation failed');
        setStatus('error');
      });
  }, [token]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
      <div className={`bg-gray-800 rounded-lg shadow-card p-8 w-full max-w-md text-center border-t-4 ${
        status === 'success' ? 'border-green-600' : status === 'error' ? 'border-red-600' : 'border-blue-600'
      }`}>
        {status === 'confirming' && (
          <>
            <div className="text-4xl mb-4">⏳</div>
            <h2 className="font-heading text-2xl font-bold text-blue-300 mb-3">Confirming…</h2>
            <p className="text-gray-400 text-sm">Verifying your email address.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="text-4xl mb-4">✅</div>
            <h2 className="font-heading text-2xl font-bold text-green-300 mb-3">Email Confirmed!</h2>
            <p className="text-gray-300 text-sm mb-6">
              {name ? `Welcome, ${name}! ` : ''}Your account is now active. You can sign in.
            </p>
            <button
              onClick={onDone}
              className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              Go to Sign In
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-4xl mb-4">❌</div>
            <h2 className="font-heading text-2xl font-bold text-red-300 mb-3">Confirmation Failed</h2>
            <p className="text-gray-300 text-sm mb-6">{errorMsg}</p>
            <button
              onClick={onDone}
              className="w-full py-2.5 bg-gray-700 text-gray-200 font-semibold rounded-lg hover:bg-gray-600 transition-colors text-sm"
            >
              Go to Sign In
            </button>
          </>
        )}
      </div>
    </div>
  );
}
