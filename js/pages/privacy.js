/* Privacy: say exactly what the page does and does not do, and how anyone can check it. */
(function () {
  'use strict';
  const { I, card, note } = UI;

  function render() {
    const promise = note('<b>This site never receives your files, or anything about them.</b> Your PDFs and pictures are read by your own browser, worked on in its memory, and handed back to you as downloads. The page has no way to send them anywhere: its security policy only allows it to load its own files.');

    const does = card('What happens to your file', '',
      '<ol class="how-list">' +
      '<li><b>You choose a file.</b> The browser lets this page read it. It is not copied to any server.</li>' +
      '<li><b>It is processed on your computer</b>, using two open-source libraries (<i>pdf-lib</i> and <i>pdf.js</i>) that are bundled with the page, not fetched from elsewhere.</li>' +
      '<li><b>The result is a download.</b> It goes to your own Downloads folder like any other file.</li>' +
      '<li><b>It is forgotten.</b> Everything is held in this tab’s memory. Closing or refreshing the tab erases it. Nothing is written to cookies, local storage, or a database.</li></ol>');

    const never = card('What this site does not do', '',
      '<ul class="how-list">' +
      '<li>No uploading, and no server of ours: there isn’t one.</li>' +
      '<li>No accounts, no sign-in, no cookies, no browser storage, no service workers.</li>' +
      '<li>No analytics, advertising, tracking pixels, fingerprinting, or third-party scripts and fonts.</li>' +
      '<li>No record of file names, sizes, page counts or anything you type. The theme toggle is not even remembered.</li></ul>');

    const verify = card('Check it yourself', 'You do not have to take our word for it.',
      '<ol class="how-list">' +
      '<li><b>Watch the network.</b> Press <kbd>F12</kbd> in your browser, open the <b>Network</b> tab, then use any tool. After the page has loaded you will see no requests being sent. (Fonts and viewer files for the page itself may load from this same site the first time.)</li>' +
      '<li><b>Go offline.</b> Once the page has loaded, turn off your Wi-Fi and open a PDF. It should keep working. (A few PDFs that rely on built-in fonts may ask this site for a small font file, which needs a connection to this site only.)</li>' +
      '<li><b>Read the policy.</b> Open the page source (<kbd>Ctrl</kbd>+<kbd>U</kbd>) and look at the first lines: the <i>Content-Security-Policy</i> only allows scripts, styles and requests from this site itself.</li>' +
      '<li><b>Read the code.</b> It is plain, readable JavaScript with no build step, and the repository’s automatic tests fail if any storage, tracking or outside-address code is ever added.</li></ol>');

    const fine = card('The honest small print', '',
      '<ul class="how-list">' +
      '<li><b>The page itself is delivered by GitHub Pages.</b> Like any website, GitHub’s servers can see that your browser asked for the page (your IP address and the time) in their ordinary logs. That is about visiting the page, never about your files, and it is outside this tool’s control.</li>' +
      '<li><b>Your own computer keeps normal traces.</b> Downloaded files appear in your Downloads folder and browser history, and your browser may keep the page’s files in its cache, as with any site.</li>' +
      '<li><b>Large files need memory.</b> Everything is held in RAM, so very large PDFs can be slow or fail on small computers.</li>' +
      '<li><b>Hiding is not deleting.</b> Cropping, white-out boxes and watermarks cover content but do not remove it from the file. To remove sensitive text for good, delete the pages or convert them to pictures first.</li></ul>');

    return promise + '<div class="grid g2">' + does + never + '</div>' + verify + fine;
  }

  App.register({ id: 'privacy', label: 'Privacy', icon: 'shield', group: 'About', order: 100, sub: 'What this site does with your files: nothing, by design.', render: render });
})();
