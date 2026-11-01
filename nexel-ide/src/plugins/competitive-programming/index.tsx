import React from 'react';
import { registerPlugin } from '../registry';

/**
 * Competitive Programming: judge with sample tests, stress testing, Codeforces contests
 * and Competitive Companion import. Opt-in: Nexel is a general-purpose IDE by default;
 * enabling this adds the CP dock sections, palette commands and the companion listener.
 * No data is deleted when disabled - test cases and settings are kept for re-enabling.
 */
registerPlugin({
  id: 'competitive-programming',
  name: 'Competitive Programming',
  blurb: 'Judge with sample tests, stress testing, Codeforces contests and Competitive Companion import',
  sections: ['judge', 'contests'],
  commandIds: ['judge', 'contests'],
  defaultEnabled: false,
  navItems: [
    {
      id: 'judge',
      label: 'Judge',
      icon: (
        <svg className="nd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22V13m0 0l-4 2m4-2l4 2" />
          <path d="M12 7V2m0 5a3 3 0 1 0 0 6 3 3 0 1 0 0-6z" />
          <path d="M5 17h14M3 22h18" />
        </svg>
      ),
    },
    {
      id: 'contests',
      label: 'Codeforces Contests',
      icon: (
        <svg className="nd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22h9M3 22h9M12 2v20M17 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
        </svg>
      ),
    },
  ],
});
export {};
