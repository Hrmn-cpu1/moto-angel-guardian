/** Static, self-contained markup for the position overlay. Front wheel points north (up). */
export const MOTORCYCLE_MARKER_HTML = `
<span class="moto-user-location-marker__halo" aria-hidden="true"></span>
<span class="moto-user-location-marker__bike" aria-hidden="true">
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 64 64" fill="none" focusable="false">
    <ellipse cx="32" cy="36" rx="16" ry="23" fill="#080b10" opacity=".22"/>
    <rect x="27" y="2" width="10" height="19" rx="4.5" fill="#131920" stroke="#f8e5aa" stroke-width="1.2"/>
    <path d="M30 5v10" stroke="#53606c" stroke-width="2" stroke-linecap="round"/>
    <rect x="26" y="45" width="12" height="17" rx="5" fill="#131920" stroke="#f8e5aa" stroke-width="1.2"/>
    <path d="M29 51v7" stroke="#53606c" stroke-width="2" stroke-linecap="round"/>
    <path d="M24 22 21 33l4 16c3 5 11 5 14 0l4-16-3-11Z" fill="#171e27" stroke="#f8e5aa" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="m22 38-5 3m25-3 5 3" stroke="#171e27" stroke-width="5" stroke-linecap="round"/>
    <path d="m22 38-5 3m25-3 5 3" stroke="#929b9e" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M28 9q4-3 8 0l2 13H26Z" fill="#e8b944" stroke="#171e27" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M30 10v9" stroke="#fff0b5" stroke-width="2" stroke-linecap="round"/>
    <path d="m17 17 8 5h14l8-5" stroke="#131920" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m18 16 7 4h14l7-4" stroke="#d6dce0" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m17 17-2-4m32 4 2-4" stroke="#cad1d5" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="9" y="9" width="10" height="6" rx="3" fill="#202c38" stroke="#e9ce7e" stroke-width="1.2" transform="rotate(-20 14 12)"/>
    <rect x="45" y="9" width="10" height="6" rx="3" fill="#202c38" stroke="#e9ce7e" stroke-width="1.2" transform="rotate(20 50 12)"/>
    <path d="M26 23q6-5 12 0l2 9q-1 8-8 8t-8-8Z" fill="#d99c2d" stroke="#111820" stroke-width="1.5"/>
    <path d="M26 23q5-4 10-1l1 11q-1 4-5 4t-6-4Z" fill="#f3ce60"/>
    <path d="M28 24q2-2 5-2" stroke="#fff3c6" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="32" cy="29" r="2.2" fill="#34424c" stroke="#f8e5aa" stroke-width=".8"/>
    <path d="M26 38q6-3 12 0l-1 12q-5 4-10 0Z" fill="#17222d" stroke="#f2d779" stroke-width="1.2"/>
    <path d="M28 39q4-2 8 0l-.5 7h-7Z" fill="#334553"/>
    <path d="M27 50q5 3 10 0l1 4q-6 4-12 0Z" fill="#e9b946" stroke="#131920" stroke-width="1.3"/>
    <path d="M29 54h6" stroke="#ff7865" stroke-width="2" stroke-linecap="round"/>
  </svg>
</span>`;
