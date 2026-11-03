(() => {
  'use strict';

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Adapted from Dynamo's TerminalDemo component for this vanilla site.
  // SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  // SPDX-License-Identifier: Apache-2.0
  // The cast and pinned player bundle stay same-origin and load only near the demo.
  const ASCIINEMA_PLAYER_VERSION = '3.17.0';
  const ASCIINEMA_PLAYER_JS = `assets/vendor/asciinema-player/${ASCIINEMA_PLAYER_VERSION}/asciinema-player.min.js`;
  const ASCIINEMA_PLAYER_CSS = `assets/vendor/asciinema-player/${ASCIINEMA_PLAYER_VERSION}/asciinema-player.css`;
  const ASCIINEMA_PLAYER_JS_SRI = 'sha384-s55nTYAdrPwGWmKKQ1lCnoB8H9LbqmsXsqqqPAHK2+T5h9IfI2dTXTDXJcZnySJD';
  const ASCIINEMA_PLAYER_CSS_SRI = 'sha384-05cmIVRzN7mR7nmqajPpGPUPqJ5VyTAGHL1xJuiGWfhpWDp5hEfBk50kr21f3ILM';
  let asciinemaScriptPromise = null;
  let terminalDemoController = null;

  const ensureAsciinemaStyles = () => {
    if (document.getElementById('asciinema-player-css')) return;
    const link = document.createElement('link');
    link.id = 'asciinema-player-css';
    link.rel = 'stylesheet';
    link.href = ASCIINEMA_PLAYER_CSS;
    link.integrity = ASCIINEMA_PLAYER_CSS_SRI;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  };

  const ensureAsciinemaScript = () => {
    if (window.AsciinemaPlayer) return Promise.resolve();
    if (asciinemaScriptPromise) return asciinemaScriptPromise;

    asciinemaScriptPromise = new Promise((resolve, reject) => {
      const existing = document.getElementById('asciinema-player-js');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error('asciinema-player failed to load')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.id = 'asciinema-player-js';
      script.src = ASCIINEMA_PLAYER_JS;
      script.integrity = ASCIINEMA_PLAYER_JS_SRI;
      script.crossOrigin = 'anonymous';
      script.async = true;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error('asciinema-player failed to load')), { once: true });
      document.head.appendChild(script);
    });

    return asciinemaScriptPromise;
  };

  const setupTerminalDemo = () => {
    const demo = document.querySelector('[data-terminal-demo]');
    if (!demo) return null;

    const playerHost = demo.querySelector('[data-terminal-player]');
    const statusLabel = demo.querySelector('[data-terminal-status]');
    const controlsToggle = demo.querySelector('[data-terminal-controls]');
    const controlsTooltip = demo.querySelector('.terminal-demo-tooltip');
    const source = demo.dataset.terminalSrc;
    const cols = Number.parseInt(demo.dataset.terminalCols || '104', 10);
    const rows = Number.parseInt(demo.dataset.terminalRows || '25', 10);
    const compactDemo = window.matchMedia('(max-width: 599px)').matches;
    const playbackCols = compactDemo ? 78 : cols;
    const playbackEndAt = compactDemo ? 18 : null;

    if (!playerHost || !source) return null;

    let player = null;
    let initialized = false;
    let loaded = false;
    let inViewport = false;
    let experienceActive = true;
    let controlsVisible = reducedMotionQuery.matches;
    let loadReleaseTimer = 0;
    let trimTimer = 0;

    const setStatus = (state, label) => {
      demo.dataset.terminalState = state;
      if (statusLabel) statusLabel.textContent = label;
    };

    const setControlsVisible = (visible) => {
      controlsVisible = visible;
      demo.classList.toggle('terminal-demo-controls-visible', visible);
      controlsToggle?.setAttribute('aria-pressed', String(visible));
      controlsToggle?.setAttribute('aria-label', visible ? 'Hide terminal playback controls' : 'Show terminal playback controls');
      if (controlsTooltip) controlsTooltip.textContent = visible ? 'Hide playback controls' : 'Show playback controls';
    };

    const pause = () => {
      try {
        player?.pause?.();
      } catch {
        // The player may still be mounting or already paused.
      }
    };

    const play = () => {
      try {
        const result = player?.play?.();
        result?.catch?.(() => setStatus('ready', 'Demo ready'));
      } catch {
        setStatus('ready', 'Demo ready');
      }
    };

    const syncPlayback = () => {
      if (!player || !loaded) return;

      const canBeVisible = inViewport && experienceActive && !document.hidden;
      if (!canBeVisible) {
        pause();
        setStatus('paused', 'Demo paused');
        return;
      }

      if (reducedMotionQuery.matches) {
        setStatus('ready', 'Demo ready');
        return;
      }

      play();
    };

    const markLoaded = () => {
      if (loaded) return;
      if (loadReleaseTimer) window.clearTimeout(loadReleaseTimer);
      loaded = true;
      demo.classList.add('terminal-demo-loaded');
      setStatus('ready', reducedMotionQuery.matches ? 'Demo ready' : 'Starting demo');
      syncPlayback();
    };

    const initialize = async () => {
      if (initialized) return;
      initialized = true;
      setStatus('loading', 'Loading demo');
      ensureAsciinemaStyles();

      try {
        await ensureAsciinemaScript();
        if (!window.AsciinemaPlayer) throw new Error('asciinema-player global unavailable');

        player = window.AsciinemaPlayer.create(source, playerHost, {
          autoPlay: false,
          loop: playbackEndAt == null,
          idleTimeLimit: 1.25,
          speed: 1.08,
          controls: true,
          fit: 'width',
          cols: playbackCols,
          rows,
          poster: 'npt:0:01'
        });

        const handlePlaying = () => {
          markLoaded();
          setStatus('running', 'Demo running');
        };
        const handlePaused = () => {
          if (loaded && inViewport && experienceActive && !document.hidden) setStatus('paused', 'Demo paused');
        };

        player?.addEventListener?.('play', handlePlaying);
        player?.addEventListener?.('playing', handlePlaying);
        player?.addEventListener?.('pause', handlePaused);

        if (playbackEndAt != null && typeof player?.getCurrentTime === 'function') {
          trimTimer = window.setInterval(() => {
            try {
              const currentTime = player?.getCurrentTime?.();
              if (typeof currentTime !== 'number' || currentTime < playbackEndAt) return;
              player?.seek?.(0);
              if (inViewport && experienceActive && !document.hidden) play();
            } catch {
              // Ignore transient state while the compact loop seeks.
            }
          }, 250);
        }

        window.requestAnimationFrame(() => window.requestAnimationFrame(markLoaded));
        loadReleaseTimer = window.setTimeout(markLoaded, reducedMotionQuery.matches ? 450 : 1100);
      } catch {
        demo.classList.add('terminal-demo-load-failed');
        setStatus('fallback', 'Demo preview');
      }
    };

    setControlsVisible(controlsVisible);

    controlsToggle?.addEventListener('click', () => {
      setControlsVisible(!controlsVisible);
    });

    const onReducedMotionChange = (event) => {
      if (event.matches) {
        pause();
        setControlsVisible(true);
        if (loaded) setStatus('ready', 'Demo ready');
      } else {
        syncPlayback();
      }
    };
    reducedMotionQuery.addEventListener('change', onReducedMotionChange);

    document.addEventListener('visibilitychange', syncPlayback);

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        const entry = entries[0];
        inViewport = Boolean(entry?.isIntersecting);
        if (inViewport) initialize();
        syncPlayback();
      }, {
        rootMargin: '480px 0px',
        threshold: 0.01
      });
      observer.observe(demo);
    } else {
      inViewport = true;
      initialize();
    }

    window.addEventListener('pagehide', (event) => {
      if (event.persisted) {
        pause();
        return;
      }
      if (loadReleaseTimer) window.clearTimeout(loadReleaseTimer);
      if (trimTimer) window.clearInterval(trimTimer);
      try {
        player?.dispose?.();
      } catch {
        // The page is already being torn down.
      }
    }, { once: true });

    window.addEventListener('pageshow', (event) => {
      if (event.persisted) syncPlayback();
    });

    return {
      setExperienceActive(active) {
        experienceActive = active;
        syncPlayback();
      }
    };
  };

  const setupNavigation = () => {
    const header = document.querySelector('[data-site-header]');
    const exploreMenu = document.querySelector('[data-explore-menu]');
    const exploreTrigger = exploreMenu?.querySelector('summary');
    const sectionLinks = [...document.querySelectorAll('[data-section-link]')];
    const progressFill = document.querySelector('[data-page-progress]');
    const experienceSteps = [...document.querySelectorAll('[data-experience-step]')];
    const experiencePanels = [...document.querySelectorAll('[data-visual-for]')];
    const experienceProgress = [...document.querySelectorAll('[data-progress-for]')];
    const careerTimelineTrack = document.querySelector('[data-career-timeline-track]');
    const careerTimelineProgress = document.querySelector('[data-career-timeline-progress]');
    const timelineEntries = [...document.querySelectorAll('[data-timeline-entry]')];

    const sectionTargets = sectionLinks
      .map((link) => document.querySelector(link.getAttribute('href')))
      .filter(Boolean);

    let activeSectionId = '';
    let activeExperience = experienceSteps[0] || null;
    let frame = 0;

    const setCurrentSection = (id) => {
      if (!id || id === activeSectionId) return;
      activeSectionId = id;

      sectionLinks.forEach((link) => {
        const isCurrent = link.getAttribute('href') === `#${id}`;
        if (isCurrent) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };

    const syncExperience = () => {
      const activeIndex = Math.max(0, experienceSteps.indexOf(activeExperience));
      const activeId = activeExperience?.id || '';

      experienceSteps.forEach((step, index) => {
        step.dataset.active = String(index === activeIndex);
      });

      experiencePanels.forEach((panel) => {
        const panelIndex = experienceSteps.findIndex((step) => step.id === panel.dataset.visualFor);
        const isActive = panel.dataset.visualFor === activeId;
        panel.dataset.state = isActive ? 'active' : panelIndex < activeIndex ? 'before' : 'after';
        panel.classList.toggle('is-active', isActive);
      });

      experienceProgress.forEach((segment) => {
        const isActive = segment.dataset.progressFor === activeId;
        segment.dataset.active = String(isActive);
        if (isActive) segment.setAttribute('aria-current', 'step');
        else segment.removeAttribute('aria-current');
      });

      terminalDemoController?.setExperienceActive(activeId === 'microsoft-ai');
    };

    const syncPageChrome = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, scrollTop / scrollable));

      header?.classList.toggle('is-scrolled', scrollTop > 24);
      if (progressFill) progressFill.style.transform = `scaleX(${progress})`;

      const activationLine = Math.min(window.innerHeight * 0.34, 300) + (header?.offsetHeight || 0);

      if (sectionTargets.length > 0) {
        let current = sectionTargets[0];

        sectionTargets.forEach((target) => {
          if (target.getBoundingClientRect().top <= activationLine) current = target;
        });

        setCurrentSection(current.id);
      }

      if (careerTimelineTrack && careerTimelineProgress) {
        const timelineRect = careerTimelineTrack.getBoundingClientRect();
        const timelineProgress = Math.min(1, Math.max(0, (activationLine - timelineRect.top) / Math.max(1, timelineRect.height)));
        careerTimelineProgress.style.transform = `scaleY(${timelineProgress})`;
      }

      if (timelineEntries.length > 0) {
        let currentTimelineEntry = null;

        timelineEntries.forEach((entry) => {
          if (entry.getBoundingClientRect().top <= activationLine) currentTimelineEntry = entry;
        });

        timelineEntries.forEach((entry) => {
          entry.dataset.timelineActive = String(entry === currentTimelineEntry);
        });
      }

      frame = 0;
    };

    const requestChromeSync = () => {
      if (!frame) frame = window.requestAnimationFrame(syncPageChrome);
    };

    syncExperience();
    syncPageChrome();

    window.addEventListener('scroll', requestChromeSync, { passive: true });
    window.addEventListener('resize', requestChromeSync, { passive: true });

    if (exploreMenu) {
      exploreMenu.addEventListener('toggle', () => {
        header?.classList.toggle('is-menu-open', exploreMenu.open);
      });

      sectionLinks.forEach((link) => {
        link.addEventListener('click', () => {
          exploreMenu.open = false;
        });
      });

      document.addEventListener('pointerdown', (event) => {
        if (exploreMenu.open && !exploreMenu.contains(event.target)) exploreMenu.open = false;
      });

      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !exploreMenu.open) return;
        exploreMenu.open = false;
        exploreTrigger?.focus();
      });
    }

    if (!('IntersectionObserver' in window) || experienceSteps.length === 0) return;

    const visibleSteps = new Map();
    const experienceObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visibleSteps.set(entry.target, entry.intersectionRatio);
        else visibleSteps.delete(entry.target);
      });

      const current = [...visibleSteps.entries()]
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      if (!current || current === activeExperience) return;
      activeExperience = current;
      syncExperience();
    }, {
      rootMargin: '-34% 0px -54% 0px',
      threshold: [0, 0.001, 0.01, 0.05]
    });

    experienceSteps.forEach((step) => experienceObserver.observe(step));
  };

  const setupReveals = () => {
    const elements = [...document.querySelectorAll('[data-reveal]')];
    if (elements.length === 0 || reducedMotionQuery.matches || !('IntersectionObserver' in window)) return;

    document.documentElement.classList.add('reveal-ready');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, {
      rootMargin: '0px 0px -8% 0px',
      threshold: 0.12
    });

    elements.forEach((element) => observer.observe(element));

    reducedMotionQuery.addEventListener('change', (event) => {
      if (!event.matches) return;
      elements.forEach((element) => element.classList.add('is-revealed'));
      document.documentElement.classList.remove('reveal-ready');
      observer.disconnect();
    }, { once: true });
  };

  const setupExperienceVisuals = () => {
    const visuals = [...document.querySelectorAll('[data-experience-visual]')];
    if (visuals.length === 0 || reducedMotionQuery.matches) return;

    visuals.forEach((visual) => {
      if (visual.dataset.state === 'active') visual.classList.add('is-active');
    });
  };

  const updateYear = () => {
    const year = String(new Date().getFullYear());
    document.querySelectorAll('[data-current-year]').forEach((element) => {
      element.textContent = year;
    });
  };

  terminalDemoController = setupTerminalDemo();
  setupNavigation();
  setupReveals();
  setupExperienceVisuals();
  updateYear();
})();
