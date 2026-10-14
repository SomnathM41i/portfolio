/* terminal.js — the hero's "press /" command terminal.

   Opens from the hero hint chip or the "/" key, closes on Escape or a backdrop
   click. Commands are declared in one table so the help output and the
   dispatcher can never drift apart.

   The "matrix" command does not touch the canvas itself; it dispatches a
   document event that easter.js listens for, so the two modules stay
   independent of load order. */
(function () {
  'use strict';

  const overlay = document.getElementById('terminalOverlay');
  const body = document.getElementById('terminalBody');
  const input = document.getElementById('terminalInput');
  const hint = document.getElementById('terminalHint');
  if (!overlay || !body || !input) return;

  const PROMPT = '<span class="term-prompt">somnath@portfolio</span><span class="term-prompt">:~$</span>';
  const HISTORY_LIMIT = 50;

  const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const write = (html, className) => {
    const line = document.createElement('div');
    line.className = 'term-line' + (className ? ' ' + className : '');
    line.innerHTML = html;
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
  };

  const out = (html) => write(html, 'term-output');
  const dim = (text) => '<span class="dim">' + text + '</span>';
  const hl = (text) => '<span class="hl">' + text + '</span>';

  const openLink = (url) => {
    window.open(url, '_blank', 'noopener');
  };

  /* ------------------------------------------------------------- commands */

  const COMMANDS = {
    help: {
      about: 'list every command',
      run() {
        const names = Object.keys(COMMANDS).sort();
        out('Available commands:');
        names.forEach((name) => {
          out('  ' + hl(name.padEnd(11)) + dim(COMMANDS[name].about));
        });
        out(dim('  Tip: Tab completes, ↑/↓ walks history.'));
      },
    },

    whoami: {
      about: 'who is behind this page',
      run() {
        out('Somnath Mali — Full-Stack Developer');
        out('PHP · Laravel · CodeIgniter · Python · FastAPI · React');
        out('CodeX Technologies, Mumbai · June 2023 – present');
      },
    },

    about: {
      about: 'short background',
      run() {
        out('Started coding in a small village in Sangli with a 4G connection and a lot of free time.');
        out('No bootcamp, no mentor — Stack Overflow and broken code that somehow worked.');
        out('Now building fintech systems and AI/LLM-powered platforms.');
      },
    },

    skills: {
      about: 'technical stack',
      run() {
        out(hl('Backend   ') + 'PHP (OOP), Laravel, CodeIgniter 3 & 4, Python, FastAPI');
        out(hl('Frontend  ') + 'JavaScript, jQuery, React, Bootstrap, Material CSS');
        out(hl('Database  ') + 'MySQL — schema design, indexing, query optimisation');
        out(hl('Integrations') + ' REST APIs, PhonePe, Razorpay');
        out(hl('Tooling   ') + 'Git, Docker, Postman, PHPUnit');
      },
    },

    experience: {
      about: 'where I have worked',
      run() {
        out(hl('CodeX Technologies') + ' — Full-Stack Developer, Mumbai');
        out(dim('  June 2023 – present'));
        out('  · REST APIs for auth, wallet and reward points');
        out('  · Role-based admin/super-admin systems');
        out('  · PhonePe and Razorpay payment integrations');
        out('  · CRM and banking applications');
        out('');
        out(hl('Freelance') + ' — Gold Loan Management System, Sangli');
        out(dim('  CodeIgniter 4 · Marathi/English i18n · PDF reporting'));
      },
    },

    projects: {
      about: 'what I have shipped',
      run() {
        const cards = document.querySelectorAll('.project-card .project-name');
        if (!cards.length) {
          out('Project list is on the projects section of this page.');
          return;
        }
        out('Shipped:');
        cards.forEach((card) => out('  · ' + card.textContent.trim()));
        out(dim('  Scroll to #projects for detail, or click any Case Study button.'));
      },
    },

    contact: {
      about: 'how to reach me',
      run() {
        out(hl('Email  ') + 'somnath.malim46@gmail.com');
        out(hl('Phone  ') + '+91 9022357293');
        out(hl('Based  ') + 'Mumbai / Remote');
      },
    },

    resume: {
      about: 'open the resume PDF',
      run() {
        out('Opening resume.pdf …');
        openLink('resume.pdf');
      },
    },

    github: {
      about: 'open my GitHub profile',
      run() {
        out('Opening github.com/SomnathM41i …');
        openLink('https://github.com/SomnathM41i');
      },
    },

    blog: {
      about: 'open the blog',
      run() {
        out('Opening emperorofbattle.blogspot.com …');
        openLink('https://emperorofbattle.blogspot.com');
      },
    },

    matrix: {
      about: 'there is no spoon',
      run() {
        out('Wake up, Neo…');
        document.dispatchEvent(new CustomEvent('portfolio:matrix'));
      },
    },

    ls: {
      about: 'list page sections',
      run() {
        out('about/  skills/  experience/  projects/  certifications/  contact/');
      },
    },

    date: {
      about: 'current date and time',
      run() {
        out(new Date().toString());
      },
    },

    clear: {
      about: 'clear the screen',
      run() {
        body.innerHTML = '';
      },
    },

    exit: {
      about: 'close the terminal',
      run() {
        close();
      },
    },

    sudo: {
      about: 'nice try',
      run() {
        out('somnath is not in the sudoers file. This incident has been reported. 🙂');
      },
    },
  };

  COMMANDS.quit = { about: 'alias for exit', run: COMMANDS.exit.run };
  COMMANDS.close = { about: 'alias for exit', run: COMMANDS.exit.run };

  /* ------------------------------------------------------------ behaviour */

  const history = [];
  let historyIndex = 0;

  const runCommand = (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    write(PROMPT + ' <span class="term-command">' + escapeHtml(trimmed) + '</span>');

    const [name, ...args] = trimmed.split(/\s+/);
    const command = COMMANDS[name.toLowerCase()];

    if (!command) {
      out('command not found: ' + escapeHtml(name) + ' — try ' + hl('help'));
      return;
    }

    if (name.toLowerCase() === 'sudo' && args.length) {
      out('somnath is not in the sudoers file. This incident has been reported. 🙂');
      return;
    }

    command.run();
  };

  const isOpen = () => overlay.classList.contains('open');

  const open = () => {
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    setTimeout(() => input.focus(), 60);
  };

  function close() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    if (hint) hint.focus();
  }

  const boot = () => {
    write(hl('Somnath Mali') + ' — portfolio shell');
    out(dim("Type 'help' for available commands."));
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const value = input.value;
      input.value = '';
      if (value.trim()) {
        history.push(value.trim());
        if (history.length > HISTORY_LIMIT) history.shift();
      }
      historyIndex = history.length;
      runCommand(value);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!history.length) return;
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex];
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!history.length) return;
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = historyIndex === history.length ? '' : history[historyIndex];
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const partial = input.value.trim().toLowerCase();
      if (!partial) return;
      const matches = Object.keys(COMMANDS).filter((name) => name.startsWith(partial));
      if (matches.length === 1) {
        input.value = matches[0];
      } else if (matches.length > 1) {
        out(matches.map(hl).join('  '));
      }
    }
  });

  if (hint) hint.addEventListener('click', open);

  // Backdrop click closes; clicks inside the terminal box do not.
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      close();
      return;
    }

    if (event.key !== '/') return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isOpen()) return;

    // Never hijack the key while the visitor is typing into a form field.
    const tag = (event.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target.isContentEditable) return;

    event.preventDefault();
    open();
  });

  boot();
})();
