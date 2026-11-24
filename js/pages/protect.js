/* Password: add a password to the open PDF, or take the password off a protected PDF you already know the password to.
 * Passwords live only in this tab's memory while you use them. There is no password guessing or cracking. */
(function () {
  'use strict';
  const { I, esc, card, note } = UI;
  const { Doc, E } = App;
  const S = () => App.S.protect;
  const fail = text => { throw new PdfOps.UserError(text); };

  App.on('doc', function () { const s = S(); s.pw = ''; s.pw2 = ''; s.owner = ''; s.added = false; });

  const A = App.acts;

  A['protect.add'] = () => App.work('Locking your PDF…', async function () {
    const s = S(), d = Doc.cur;
    s.added = false;
    if (!s.pw) fail('Enter a password to protect the PDF with.');
    if (s.pw !== s.pw2) fail('The two passwords do not match. Type them again.');
    const q = E.qpdf();
    const bytes = await q.encrypt(d.bytes, { userPassword: s.pw, ownerPassword: s.useOwner ? s.owner : '', allowPrint: !s.noPrint, allowCopy: !s.noCopy, allowEdit: !s.noEdit });
    await q.decrypt(bytes, s.pw);                       // prove it opens with exactly this password before handing it over
    App.save(Doc.outName('protected'), bytes, 'application/pdf');
    s.pw = ''; s.pw2 = ''; s.owner = ''; s.added = true;
    UI.refresh();
  });

  A['protect.rmPick'] = async function () {
    const files = await E.chooseFiles('application/pdf,.pdf', false);
    if (files.length) await setTarget(files[0]);
  };
  A['protect.rmClear'] = function () { const s = S(); s.rm = null; s.rmPw = ''; s.rmMsg = ''; UI.refresh(); };

  async function setTarget(file) {
    const s = S();
    await App.work('Reading ' + file.name + '…', async function () {
      const bytes = await E.readBytes(file);
      s.rmPw = ''; s.rmMsg = '';
      s.rm = null;
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { s.rmMsg = 'That is not a PDF file.'; return; }
      const kind = Qpdf.looksEncrypted(bytes) ? await E.qpdf().protection(bytes) : 'none';
      if (kind === 'none') s.rmMsg = file.name + ' does not have a password, so there is nothing to remove.';
      else s.rm = { name: file.name, bytes: bytes, kind: kind };
    });
    UI.refresh();
  }

  A['protect.rmRun'] = () => App.work('Removing the password…', async function () {
    const s = S(), t = s.rm;
    const out = await E.qpdf().decrypt(t.bytes, t.kind === 'owner' ? '' : s.rmPw);
    App.save(E.safeName(E.stem(t.name) + ' - unlocked') + '.pdf', out, 'application/pdf');
    s.rmPw = '';
  });

  function pwField(id, path, label, value, hint) {
    return '<div class="field grow" style="min-width:220px"><label for="' + id + '">' + label + '</label><input id="' + id + '" class="txt" type="' + (S().show ? 'text' : 'password') +
      '" autocomplete="off" spellcheck="false" data-model="' + path + '" value="' + esc(value) + '">' + (hint ? '<span class="hint" style="margin:4px 0 0">' + hint + '</span>' : '') + '</div>';
  }
  const check = (path, on, text) => '<label class="check"><input type="checkbox" data-bind="' + path + '"' + (on ? ' checked' : '') + '> ' + text + '</label>';

  function addCard() {
    const d = Doc.cur, s = S();
    if (!d) return card('Add a password', 'Lock the PDF so it needs a password to open.', '<p class="hint" style="margin:0 0 12px">Open the PDF you want to protect first.</p><button class="btn primary" data-act="open.pick">' + I('file') + ' Choose a PDF</button>');
    const body =
      '<div class="row wrap" style="gap:12px;align-items:flex-start">' + pwField('pw1', 'protect.pw', 'Password', s.pw) + pwField('pw2', 'protect.pw2', 'Type it again', s.pw2) + '</div>' +
      '<div style="margin-top:10px">' + check('protect.show', s.show, 'Show the password as I type') + '</div>' +
      '<div style="margin:14px 0 6px;font-weight:600;font-size:13px">Also ask readers not to</div>' +
      '<div class="row wrap" style="gap:18px">' + check('protect.noPrint', s.noPrint, 'print') + check('protect.noCopy', s.noCopy, 'copy text') + check('protect.noEdit', s.noEdit, 'edit') + '</div>' +
      '<p class="hint">These limits are a courtesy: most PDF programs respect them, but they are not strong protection. The password to open the file is the real lock (AES-256).</p>' +
      ((s.noPrint || s.noCopy || s.noEdit) ? '<div style="margin-top:10px">' + check('protect.useOwner', s.useOwner, 'Set my own owner password for these limits') + '</div>' +
        (s.useOwner ? '<div class="row wrap" style="gap:12px;margin-top:10px">' + pwField('pw3', 'protect.owner', 'Owner password', s.owner, 'Lets you change or lift the limits later.') + '</div>'
          : '<p class="hint">Without one, a random owner password is made and thrown away, so only the open password is needed to unlock the file.</p>') : '') +
      '<div class="row wrap" style="gap:8px;margin-top:16px"><button class="btn primary" data-act="protect.add">' + I('lock') + ' Protect and download</button></div>' +
      '<p class="hint">Your original file is not changed. <b>If you forget the password, nobody can recover it</b>, including this site, because it never sees it.</p>' +
      (s.added ? '<div style="margin-top:12px">' + note('Saved. Open the new file and check it asks for the password. A protected PDF cannot be edited here until you remove the password again.', 'check') + '</div>' : '');
    return card('Add a password', 'Lock ' + d.name + ' so it needs a password to open.', body);
  }

  function removeCard() {
    const s = S(), t = s.rm;
    let body;
    if (!t) {
      body = '<p class="hint" style="margin:0 0 12px">Choose a PDF that has a password, and enter the password you were given. Opening a locked PDF from “Open a PDF” also asks for it.</p>' +
        '<button class="btn primary" data-act="protect.rmPick">' + I('file') + ' Choose a protected PDF</button>' +
        (s.rmMsg ? '<p class="hint bad">' + esc(s.rmMsg) + '</p>' : '');
    } else if (t.kind === 'owner') {
      body = '<p class="hint" style="margin:0 0 12px"><b>' + esc(t.name) + '</b> opens without a password but has limits on printing, copying or editing. A copy without the limits can be saved.</p>' +
        '<div class="row wrap" style="gap:8px"><button class="btn primary" data-act="protect.rmRun">' + I('unlock') + ' Remove the limits and download</button><button class="btn ghost" data-act="protect.rmClear">Choose another</button></div>';
    } else {
      body = '<p class="hint" style="margin:0 0 12px"><b>' + esc(t.name) + '</b> is locked.</p>' +
        '<div class="row wrap" style="gap:12px;align-items:flex-end">' + pwField('pw4', 'protect.rmPw', 'Its password', s.rmPw) +
        '<button class="btn primary" data-act="protect.rmRun">' + I('unlock') + ' Remove password and download</button><button class="btn ghost" data-act="protect.rmClear">Choose another</button></div>';
    }
    return card('Remove a password', 'Save an unlocked copy of a PDF. You need to know its password: this tool cannot guess or break one.', body);
  }

  function render() {
    return addCard() + removeCard() +
      note('<b>Private by design.</b> The passwords you type and your PDFs stay in this tab. The locking is done by qpdf running inside your browser, and nothing is sent to any server.', 'shield');
  }

  App.register({
    id: 'protect', label: 'Password', icon: 'lock', group: 'Share', order: 67, tone: 'violet',
    sub: 'Add a password to a PDF, or remove one you know.',
    blurb: 'Lock a PDF with a password (AES-256), or save an unlocked copy of one you know the password to.',
    state: () => ({ pw: '', pw2: '', owner: '', show: false, noPrint: false, noCopy: false, noEdit: false, useOwner: false, added: false, rm: null, rmPw: '', rmMsg: '' }),
    // A PDF dropped here that has a password is set up for unlocking; any other PDF is opened as usual.
    onFiles: async function (files) {
      const f = files.filter(x => /\.pdf$/i.test(x.name) || x.type === 'application/pdf')[0];
      if (f && Qpdf.looksEncrypted(await E.readBytes(f))) return setTarget(f);
      return App.openFiles(files);
    },
    render: render
  });
})();
