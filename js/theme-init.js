/* Runs before the page is first drawn, so it opens in the same light or dark theme as the computer, with no flash of
 * the wrong one. It only asks the browser for the system setting; nothing is stored. */
(function () {
  'use strict';
  var dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
