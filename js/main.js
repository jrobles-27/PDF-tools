/* Boot: assemble the registered pages into the sidebar and start the shell. */
(function () {
  'use strict';
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const pages = App.pages.slice().sort((a, b) => a.order - b.order);

  UI.start({
    pages: pages.map(p => ({ id: p.id, label: p.label, icon: p.icon, group: p.group, sub: p.sub })),
    render: id => App.page(id).render(),
    logo: 'file',
    footIcon: 'shield',
    theme: mq && mq.matches ? 'dark' : 'light',    // starts in the computer's theme (see also theme-init.js)
    initial: 'open',
    primary: { label: 'Open PDF', icon: 'upload', act: 'open.pick' }
  });
  UI.setState(false, 'No PDF open');

  // Keep following the computer's setting while the page is open, unless the person picked a theme with the
  // button. Nothing is remembered: a new visit starts from the computer's setting again.
  let chosen = false;
  document.getElementById('theme').addEventListener('click', () => { chosen = true; });
  if (mq && mq.addEventListener) mq.addEventListener('change', e => { if (!chosen) UI.setTheme(e.matches ? 'dark' : 'light'); });
})();
