import { useState, useEffect } from 'react';
import { confirmEmail } from '../api/index.js';
import { Button, Card, CardBody } from './ui';

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

  const cardVariant = status === 'success' ? 'action' : status === 'error' ? 'signal' : 'chrome';

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
      <Card variant={cardVariant} className="w-full max-w-md text-center">
        <CardBody className="p-8">
          {status === 'confirming' && (
            <>
              <div className="text-4xl mb-4">⏳</div>
              <h2 className="font-display text-2xl font-bold text-chrome-300 mb-3">Confirming…</h2>
              <p className="text-gray-400 text-sm">Verifying your email address.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-4xl mb-4">✅</div>
              <h2 className="font-display text-2xl font-bold text-action-300 mb-3">Email Confirmed!</h2>
              <p className="text-gray-300 text-sm mb-6">
                {name ? `Welcome, ${name}! ` : ''}Your account is now active. You can sign in.
              </p>
              <Button size="sm" onClick={onDone} className="w-full">
                Go to Sign In
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-4xl mb-4">❌</div>
              <h2 className="font-display text-2xl font-bold text-signal-300 mb-3">Confirmation Failed</h2>
              <p className="text-gray-300 text-sm mb-6">{errorMsg}</p>
              <Button variant="secondary" size="sm" onClick={onDone} className="w-full">
                Go to Sign In
              </Button>
          </>
        )}
        </CardBody>
      </Card>
    </div>
  );
}
