import { useState } from 'react';
import { ShareIcon } from './icons.jsx';

const DEFAULT_CLASS = 'inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white shadow transition-colors';

export default function ShareButton({
  title,
  text,
  url,
  label = 'Share',
  copiedLabel = 'Link copied',
  className,
  showIcon = true,
}) {
  const [copied, setCopied] = useState(false);

  async function handleClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const targetUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
    const data = { title, text, url: targetUrl };

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(data);
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy link:', targetUrl);
    }
  }

  return (
    <button type="button" onClick={handleClick} className={className || DEFAULT_CLASS}>
      {showIcon && <ShareIcon className="w-4 h-4" />}
      {copied ? copiedLabel : label}
    </button>
  );
}
