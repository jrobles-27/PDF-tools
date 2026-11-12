/* Boot: assemble the registered pages into the sidebar and start the shell. */
(function () {
  'use strict';
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const pages = App.pages.slice().sort((a, b) => a.order - b.order);

  UI.start({
    pages: pages.map(p => ({ id: p.id, label: p.label, icon: p.icon, group: p.group, sub: p.sub })),
    render: id => App.page(id).render(),
    logo: 'file',
    footIcon: 'shield',
    theme: prefersDark ? 'dark' : 'light',     // follows the computer's setting; deliberately not remembered
    initial: 'open',
    primary: { label: 'Open PDF', icon: 'upload', act: 'open.pick' }
  });
  UI.setState(false, 'No PDF open');
})();
