// ==UserScript==
// @name           Blended Addressbar
// @description    Adaptive header color for Zen URL bar
// @version        0.8.0
// ==/UserScript==

(() => {
  'use strict';

  const DEBUG = false;
  const DEBUG_VERBOSE = false;
  const DEBUG_SHOW_SAMPLER = false;
  const DEBUG_THEME = false;
  const samplingEnabled = false;
  const samplingIntervalMs = 120;
  const postLoadSamplingIntervalMs = 200;
  const postLoadSamplingEnabled = true;
  const themeMessageName = 'blended-addressbar:theme-response';
  const loadbarPrefBranch = 'uc.loadbar.';
  const loadbarHeightPref = `${loadbarPrefBranch}height`;
  const loadbarColorPref = `${loadbarPrefBranch}color`;
  const loadbarColorSourcePref = `${loadbarPrefBranch}color-source`;
  const chromeDoc = document;
  let themeRequestSeq = 0;
  let servicesModule = null;

  const setVar = (value, foreground) => {
    chromeDoc.documentElement.style.setProperty('--zen-tab-header-background', value || 'transparent');
    if (foreground) {
      chromeDoc.documentElement.style.setProperty('--zen-tab-header-foreground', foreground);
    } else {
      chromeDoc.documentElement.style.removeProperty('--zen-tab-header-foreground');
    }
  };

  function applyTheme(theme, reason) {
    if (!theme) return;

    setVar(theme.bg, theme.fg);
    setPageLoadbarColors(theme);

    if (!DEBUG_THEME) return;

    const root = chromeDoc.documentElement;
    root.setAttribute('data-blended-addressbar-theme-reason', reason || '');
    root.setAttribute('data-blended-addressbar-theme-bridge', theme.bridge || '');
    root.setAttribute('data-blended-addressbar-theme-source', theme.source || '');
    root.setAttribute('data-blended-addressbar-theme-bg', theme.bg || '');
    root.setAttribute('data-blended-addressbar-theme-fg', theme.fg || '');
    root.setAttribute('data-blended-addressbar-theme-href', theme.href || '');

    console.info('[blended-addressbar:urlbar] Theme resolved', {
      reason,
      href: theme.href,
      bridge: theme.bridge,
      source: theme.source,
      bg: theme.bg,
      fg: theme.fg,
      candidates: theme.candidates || null
    });
  }

  function getPrefs() {
    try {
      if (typeof Services !== 'undefined') return Services.prefs;
    } catch {}

    try {
      if (!servicesModule && typeof ChromeUtils !== 'undefined') {
        servicesModule = ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;
      }
      return servicesModule?.prefs || null;
    } catch {}

    return null;
  }

  function readStringPref(name, fallback) {
    const prefs = getPrefs();
    if (!prefs) return fallback;

    try {
      return prefs.getStringPref(name, fallback);
    } catch {}

    try {
      return prefs.getCharPref(name, fallback);
    } catch {}

    return fallback;
  }

  function cssSupports(property, value) {
    try {
      return !!window.CSS?.supports?.(property, value);
    } catch {
      return false;
    }
  }

  function normalizeCssLength(value, fallback) {
    const raw = String(value || '').trim();
    if (!raw) return fallback;

    const normalized = /^\d+(?:\.\d+)?$/.test(raw) ? `${raw}px` : raw;
    return cssSupports('height', normalized) ? normalized : fallback;
  }

  function normalizeCssColor(value, fallback) {
    const raw = String(value || '').trim();
    if (!raw) return fallback;

    return cssSupports('color', raw) ? raw : fallback;
  }

  function setPageLoadbarColors(theme) {
    const root = chromeDoc.documentElement;
    if (hasVisibleColor(theme?.bg)) {
      root.style.setProperty('--blended-addressbar-page-loadbar-background', theme.bg);
    } else {
      root.style.removeProperty('--blended-addressbar-page-loadbar-background');
    }

    if (hasVisibleColor(theme?.fg)) {
      root.style.setProperty('--blended-addressbar-page-loadbar-foreground', theme.fg);
      return;
    }

    const bgRgb = parseCssRgb(theme?.bg);
    if (bgRgb) {
      root.style.setProperty('--blended-addressbar-page-loadbar-foreground', chooseForeground(bgRgb));
    } else {
      root.style.removeProperty('--blended-addressbar-page-loadbar-foreground');
    }
  }

  function applyLoadbarPrefs() {
    const root = chromeDoc.documentElement;
    const height = normalizeCssLength(readStringPref(loadbarHeightPref, '2px'), '2px');
    const customColor = normalizeCssColor(readStringPref(loadbarColorPref, '#3b82f6'), '#3b82f6');
    const colorSource = readStringPref(loadbarColorSourcePref, 'zen');

    const colorValue = {
      custom: 'var(--blended-addressbar-loadbar-custom-color)',
      'page-background': 'var(--blended-addressbar-page-loadbar-background, var(--zen-primary-color))',
      'page-foreground': 'var(--blended-addressbar-page-loadbar-foreground, var(--zen-primary-color))',
      zen: 'var(--zen-primary-color)'
    }[colorSource] || 'var(--zen-primary-color)';

    root.style.setProperty('--blended-addressbar-loadbar-height', height);
    root.style.setProperty('--blended-addressbar-loadbar-custom-color', customColor);
    root.style.setProperty('--blended-addressbar-loadbar-color', colorValue);

    if (DEBUG_THEME) {
      root.setAttribute('data-blended-addressbar-loadbar-height', height);
      root.setAttribute('data-blended-addressbar-loadbar-color-source', colorSource);
      root.setAttribute('data-blended-addressbar-loadbar-custom-color', customColor);
    }
  }

  function observeLoadbarPrefs() {
    const prefs = getPrefs();
    if (!prefs?.addObserver) return;

    const observer = {
      observe(_subject, topic, prefName) {
        if (topic === 'nsPref:changed' && String(prefName || '').startsWith(loadbarPrefBranch)) {
          applyLoadbarPrefs();
        }
      }
    };

    try {
      prefs.addObserver(loadbarPrefBranch, observer);
      if (typeof addUnloadListener === 'function') {
        addUnloadListener(() => {
          try {
            prefs.removeObserver(loadbarPrefBranch, observer);
          } catch {}
        });
      }
    } catch {}
  }

  function chooseForeground({ r, g, b }) {
    const toLinear = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    return luminance > 0.6 ? 'rgba(11, 13, 16, 0.92)' : 'rgba(245, 247, 251, 0.96)';
  }

  function parseCssRgb(input) {
    if (!input) return null;
    const m = String(input).trim().match(/^rgba?\(([^)]+)\)$/i);
    if (!m) return null;
    const parts = m[1].split(',').map(s => s.trim());
    if (parts.length < 3) return null;
    const r = Math.max(0, Math.min(255, parseInt(parts[0], 10)));
    const g = Math.max(0, Math.min(255, parseInt(parts[1], 10)));
    const b = Math.max(0, Math.min(255, parseInt(parts[2], 10)));
    return { r, g, b };
  }

  function hasVisibleColor(input) {
    if (!input) return false;
    const value = String(input).trim().toLowerCase();
    if (!value || value === 'transparent') return false;
    if (/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(value)) return false;
    return true;
  }

  function describeElementTheme(view, element) {
    if (!view || !element) {
      return { found: false, bg: null, fg: null };
    }

    const style = view.getComputedStyle(element);
    return {
      found: true,
      bg: style.backgroundColor || null,
      fg: style.color || null
    };
  }

  function getThemeFromElement(view, element, source = 'element') {
    if (!view || !element) return null;

    let fg = null;
    let bg = null;
    let current = element;

    while (current) {
      const style = view.getComputedStyle(current);
      if (!fg && hasVisibleColor(style.color)) {
        fg = style.color;
      }
      if (!bg && hasVisibleColor(style.backgroundColor)) {
        bg = style.backgroundColor;
      }
      if (bg && fg) break;
      current = current.parentElement;
    }

    if (!bg) return null;
    const bgRgb = parseCssRgb(bg);
    return {
      bg,
      fg: fg || (bgRgb ? chooseForeground(bgRgb) : null),
      source
    };
  }

  function getSemanticTheme(doc, view) {
    if (!doc || !view) return null;

    return getThemeFromElement(view, doc.querySelector('nav'), 'nav')
      || getThemeFromElement(view, doc.querySelector('header'), 'header');
  }

  function getBrowserPageThemeFromChrome(browser) {
    try {
      const doc = browser?.contentDocument;
      const view = doc?.defaultView;
      const root = doc?.documentElement;
      if (!doc || !view || !root) return null;

      const visibleElement = typeof doc.elementFromPoint === 'function' ? doc.elementFromPoint(1, 3) : null;
      const candidates = {
        header: describeElementTheme(view, doc.querySelector('header')),
        nav: describeElementTheme(view, doc.querySelector('nav')),
        body: describeElementTheme(view, doc.body),
        visible: describeElementTheme(view, visibleElement),
        html: describeElementTheme(view, root)
      };

      const semanticTheme = getSemanticTheme(doc, view);
      if (semanticTheme?.bg) {
        return {
          ...semanticTheme,
          bridge: 'chrome',
          href: browser?.currentURI?.spec || '',
          candidates
        };
      }

      const bodyTheme = getThemeFromElement(view, doc.body, 'body');
      if (bodyTheme?.bg) {
        return {
          ...bodyTheme,
          bridge: 'chrome',
          href: browser?.currentURI?.spec || '',
          candidates
        };
      }

      const visibleTheme = getThemeFromElement(view, visibleElement, 'visible');
      if (visibleTheme?.bg) {
        return {
          ...visibleTheme,
          bridge: 'chrome',
          href: browser?.currentURI?.spec || '',
          candidates
        };
      }

      const rootTheme = getThemeFromElement(view, root, 'html');
      if (!rootTheme?.bg) return null;

      return {
        ...rootTheme,
        bridge: 'chrome',
        href: browser?.currentURI?.spec || '',
        candidates
      };
    } catch (error) {
      if (DEBUG_VERBOSE) console.warn('[blended-addressbar:urlbar] Unable to read page theme', error);
      return null;
    }
  }

  function getBrowserMessageManager(browser) {
    return browser?.messageManager || browser?.frameLoader?.messageManager || null;
  }

  function getThemeFrameScript(requestId) {
    return `
      (() => {
        const requestId = ${JSON.stringify(requestId)};
        const messageName = ${JSON.stringify(themeMessageName)};

        const send = (payload) => {
          sendAsyncMessage(messageName, { requestId, ...payload });
        };

        const describeElementTheme = (view, element) => {
          if (!view || !element) {
            return { found: false, bg: null, fg: null };
          }

          const style = view.getComputedStyle(element);
          return {
            found: true,
            bg: style.backgroundColor || null,
            fg: style.color || null
          };
        };

        const hasVisibleColor = (input) => {
          if (!input) return false;
          const value = String(input).trim().toLowerCase();
          if (!value || value === 'transparent') return false;
          if (/^rgba\\([^)]*,\\s*0(?:\\.0+)?\\s*\\)$/i.test(value)) return false;
          return true;
        };

        const parseCssRgb = (input) => {
          if (!input) return null;
          const match = String(input).trim().match(/^rgba?\\(([^)]+)\\)$/i);
          if (!match) return null;
          const parts = match[1].split(',').map((part) => part.trim());
          if (parts.length < 3) return null;
          const clamp = (value) => Math.max(0, Math.min(255, parseInt(value, 10)));
          return { r: clamp(parts[0]), g: clamp(parts[1]), b: clamp(parts[2]) };
        };

        const chooseForeground = ({ r, g, b }) => {
          const toLinear = (channel) => {
            const value = channel / 255;
            return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
          };
          const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
          return luminance > 0.6 ? 'rgba(11, 13, 16, 0.92)' : 'rgba(245, 247, 251, 0.96)';
        };

        const getThemeFromElement = (view, element, source = 'element') => {
          if (!view || !element) return null;
          let fg = null;
          let bg = null;
          let current = element;
          while (current) {
            const style = view.getComputedStyle(current);
            if (!fg && hasVisibleColor(style.color)) fg = style.color;
            if (!bg && hasVisibleColor(style.backgroundColor)) bg = style.backgroundColor;
            if (bg && fg) break;
            current = current.parentElement;
          }
          if (!bg) return null;
          const bgRgb = parseCssRgb(bg);
          return {
            bg,
            fg: fg || (bgRgb ? chooseForeground(bgRgb) : null),
            source
          };
        };

        const withMeta = (theme, href, candidates) => theme && ({
          ...theme,
          bridge: 'message-manager',
          href,
          candidates
        });

        try {
          if (content.top !== content) return;

          const doc = content.document;
          const view = doc?.defaultView;
          const root = doc?.documentElement;
          if (!doc || !view || !root) {
            send({ ok: false, error: 'content-document-unavailable' });
            return;
          }

          const visibleElement = typeof doc.elementFromPoint === 'function' ? doc.elementFromPoint(1, 3) : null;
          const candidates = {
            header: describeElementTheme(view, doc.querySelector('header')),
            nav: describeElementTheme(view, doc.querySelector('nav')),
            body: describeElementTheme(view, doc.body),
            visible: describeElementTheme(view, visibleElement),
            html: describeElementTheme(view, root)
          };

          const href = content.location.href;
          const theme = withMeta(getThemeFromElement(view, doc.querySelector('nav'), 'nav'), href, candidates)
            || withMeta(getThemeFromElement(view, doc.querySelector('header'), 'header'), href, candidates)
            || withMeta(getThemeFromElement(view, doc.body, 'body'), href, candidates)
            || withMeta(getThemeFromElement(view, visibleElement, 'visible'), href, candidates)
            || withMeta(getThemeFromElement(view, root, 'html'), href, candidates);

          send({ ok: true, theme, candidates, href });
        } catch (error) {
          send({
            ok: false,
            error: error?.message || String(error)
          });
        }
      })();
    `;
  }

  async function getBrowserPageThemeFromMessageManager(browser) {
    const messageManager = getBrowserMessageManager(browser);
    if (!browser || !messageManager?.loadFrameScript || !messageManager?.addMessageListener) {
      if (DEBUG_THEME) {
        console.info('[blended-addressbar:urlbar] Message manager bridge unavailable', {
          hasBrowser: !!browser,
          hasMessageManager: !!messageManager,
          href: browser?.currentURI?.spec || ''
        });
      }
      return null;
    }

    const requestId = `theme-${Date.now()}-${++themeRequestSeq}`;

    return await new Promise((resolve) => {
      let settled = false;

      const cleanup = () => {
        try {
          messageManager.removeMessageListener(themeMessageName, listener);
        } catch {}
      };

      const finish = (theme, debugPayload = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        cleanup();
        if (DEBUG_THEME && debugPayload) {
          console.info('[blended-addressbar:urlbar] Message manager bridge result', debugPayload);
        }
        resolve(theme);
      };

      const listener = {
        receiveMessage(message) {
          const data = message?.data;
          if (!data || data.requestId !== requestId) return;
          finish(data.theme || null, data);
        }
      };

      const timeoutId = setTimeout(() => {
        finish(null, {
          requestId,
          ok: false,
          error: 'message-manager-timeout',
          href: browser?.currentURI?.spec || ''
        });
      }, 750);

      try {
        messageManager.addMessageListener(themeMessageName, listener);
        const scriptUrl = `data:application/javascript;charset=utf-8,${encodeURIComponent(getThemeFrameScript(requestId))}`;
        messageManager.loadFrameScript(scriptUrl, false);
      } catch (error) {
        finish(null, {
          requestId,
          ok: false,
          error: error?.message || String(error),
          href: browser?.currentURI?.spec || ''
        });
      }
    });
  }

  async function getBrowserPageThemeFromContent(browser) {
    if (!browser || typeof ContentTask === 'undefined' || !ContentTask?.spawn) {
      return null;
    }

    try {
      return await ContentTask.spawn(browser, null, () => {
        const describeElementTheme = (view, element) => {
          if (!view || !element) {
            return { found: false, bg: null, fg: null };
          }

          const style = view.getComputedStyle(element);
          return {
            found: true,
            bg: style.backgroundColor || null,
            fg: style.color || null
          };
        };

        const hasVisibleColor = (input) => {
          if (!input) return false;
          const value = String(input).trim().toLowerCase();
          if (!value || value === 'transparent') return false;
          if (/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(value)) return false;
          return true;
        };

        const parseCssRgb = (input) => {
          if (!input) return null;
          const match = String(input).trim().match(/^rgba?\(([^)]+)\)$/i);
          if (!match) return null;
          const parts = match[1].split(',').map((part) => part.trim());
          if (parts.length < 3) return null;
          const clamp = (value) => Math.max(0, Math.min(255, parseInt(value, 10)));
          return { r: clamp(parts[0]), g: clamp(parts[1]), b: clamp(parts[2]) };
        };

        const chooseForeground = ({ r, g, b }) => {
          const toLinear = (channel) => {
            const value = channel / 255;
            return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
          };
          const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
          return luminance > 0.6 ? 'rgba(11, 13, 16, 0.92)' : 'rgba(245, 247, 251, 0.96)';
        };

        const getThemeFromElement = (view, element, source = 'element') => {
          if (!view || !element) return null;
          let fg = null;
          let bg = null;
          let current = element;
          while (current) {
            const style = view.getComputedStyle(current);
            if (!fg && hasVisibleColor(style.color)) fg = style.color;
            if (!bg && hasVisibleColor(style.backgroundColor)) bg = style.backgroundColor;
            if (bg && fg) break;
            current = current.parentElement;
          }
          if (!bg) return null;
          const bgRgb = parseCssRgb(bg);
          return {
            bg,
            fg: fg || (bgRgb ? chooseForeground(bgRgb) : null),
            source
          };
        };

        const getSemanticTheme = (doc, view) => {
          if (!doc || !view) return null;
          return getThemeFromElement(view, doc.querySelector('nav'), 'nav')
            || getThemeFromElement(view, doc.querySelector('header'), 'header');
        };

        try {
          const doc = content.document;
          const view = doc?.defaultView;
          const root = doc?.documentElement;
          if (!doc || !view || !root) return null;

          const visibleElement = typeof doc.elementFromPoint === 'function' ? doc.elementFromPoint(1, 3) : null;
          const candidates = {
            header: describeElementTheme(view, doc.querySelector('header')),
            nav: describeElementTheme(view, doc.querySelector('nav')),
            body: describeElementTheme(view, doc.body),
            visible: describeElementTheme(view, visibleElement),
            html: describeElementTheme(view, root)
          };

          const semanticTheme = getSemanticTheme(doc, view);
          if (semanticTheme?.bg) {
            return {
              ...semanticTheme,
              bridge: 'content',
              href: content.location.href,
              candidates
            };
          }

          const bodyTheme = getThemeFromElement(view, doc.body, 'body');
          if (bodyTheme?.bg) {
            return {
              ...bodyTheme,
              bridge: 'content',
              href: content.location.href,
              candidates
            };
          }

          const visibleTheme = getThemeFromElement(view, visibleElement, 'visible');
          if (visibleTheme?.bg) {
            return {
              ...visibleTheme,
              bridge: 'content',
              href: content.location.href,
              candidates
            };
          }

          const rootTheme = getThemeFromElement(view, root, 'html');
          if (!rootTheme?.bg) return null;

          return {
            ...rootTheme,
            bridge: 'content',
            href: content.location.href,
            candidates
          };
        } catch {
          return null;
        }
      });
    } catch (error) {
      if (DEBUG_VERBOSE) console.warn('[blended-addressbar:urlbar] ContentTask theme lookup failed', error);
      return null;
    }
  }

  async function getBrowserPageTheme(browser) {
    const messageManagerTheme = await getBrowserPageThemeFromMessageManager(browser);
    if (messageManagerTheme?.bg) return messageManagerTheme;

    const contentTheme = await getBrowserPageThemeFromContent(browser);
    if (contentTheme?.bg) return contentTheme;

    return getBrowserPageThemeFromChrome(browser);
  }

  async function getDefaultHeaderCss(browser) {
    const pageTheme = await getBrowserPageTheme(browser);
    if (pageTheme?.bg) return pageTheme;

    const probe = chromeDoc.createElement('div');
    probe.style.position = 'fixed';
    probe.style.pointerEvents = 'none';
    probe.style.opacity = '0';
    probe.style.backgroundColor = 'var(--zen-main-browser-background-toolbar)';
    probe.style.color = 'var(--toolbox-textcolor)';
    chromeDoc.documentElement.appendChild(probe);
    const toolbarBg = getComputedStyle(probe).backgroundColor;
    const toolbarFg = getComputedStyle(probe).color;
    probe.remove();

    const rootBg = getComputedStyle(chromeDoc.documentElement).backgroundColor;
    const bg = toolbarBg && toolbarBg !== 'transparent' ? toolbarBg : rootBg;
    const fg = hasVisibleColor(toolbarFg)
      ? toolbarFg
      : (() => {
          const rgb = parseCssRgb(bg);
          return rgb ? chooseForeground(rgb) : null;
        })();
    return {
      bg: bg || 'transparent',
      fg,
      bridge: 'toolbar-fallback',
      source: 'toolbar-fallback',
      href: browser?.currentURI?.spec || ''
    };
  }

  function rgbaToCss(color) {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a.toFixed(3)})`;
  }

  const sampleCanvas = chromeDoc.createElement('canvas');
  sampleCanvas.width = 2;
  sampleCanvas.height = 2;
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

  let samplerOverlay = null;
  function ensureSamplerOverlay() {
    if (!DEBUG_SHOW_SAMPLER) return null;
    if (samplerOverlay && samplerOverlay.isConnected) return samplerOverlay;
    const el = chromeDoc.createElement('div');
    el.id = 'zen-urlbar-sampler-overlay';
    el.style.position = 'fixed';
    el.style.width = '2px';
    el.style.height = '2px';
    el.style.border = '1px solid red';
    el.style.boxSizing = 'border-box';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '2147483647';
    el.style.left = '3px';
    el.style.top = '3px';
    chromeDoc.documentElement.appendChild(el);
    samplerOverlay = el;
    return samplerOverlay;
  }

  function updateSamplerOverlay(x, y) {
    const el = ensureSamplerOverlay();
    if (!el) return;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  async function sampleTabPanelsPixel() {
    const panels = chromeDoc.getElementById('tabbrowser-tabpanels');
    if (!panels) {
      if (DEBUG) console.warn('[blended-addressbar:urlbar] tabbrowser-tabpanels not found');
      return null;
    }

    const browser = gBrowser?.selectedBrowser || null;
    const rect = (browser || panels).getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) {
      if (DEBUG_VERBOSE) console.warn('[blended-addressbar:urlbar] tabbrowser-tabpanels has no size');
      return null;
    }

    const contentX = 1;
    const contentY = 3;
    const x = Math.max(0, Math.floor(rect.left + contentX));
    const y = Math.max(0, Math.floor(rect.top + contentY));
    updateSamplerOverlay(x, y);

    if (!sampleCtx) {
      if (DEBUG) console.warn('[blended-addressbar:urlbar] No canvas context for sampling');
      return null;
    }

    const windowUtils = window.windowUtils;
    try {
      const wg = browser?.browsingContext?.currentWindowGlobal;
      if (wg && typeof wg.drawSnapshot === 'function') {
        const bc = browser?.browsingContext || null;
        const scrollX = typeof bc?.top?.scrollX === 'number'
          ? bc.top.scrollX
          : (typeof bc?.scrollX === 'number' ? bc.scrollX : 0);
        const scrollY = typeof bc?.top?.scrollY === 'number'
          ? bc.top.scrollY
          : (typeof bc?.scrollY === 'number' ? bc.scrollY : 0);
        const rect = new DOMRect(contentX + scrollX, contentY + scrollY, 1, 1);
        const bitmap = await wg.drawSnapshot(rect, 1, 'transparent');
        sampleCtx.clearRect(0, 0, 1, 1);
        sampleCtx.drawImage(bitmap, 0, 0);
        if (bitmap && typeof bitmap.close === 'function') bitmap.close();
      } else if (windowUtils && typeof windowUtils.drawSnapshot === 'function') {
        const bitmap = await windowUtils.drawSnapshot({ x, y, width: 1, height: 1 }, 1, 'transparent');
        sampleCtx.clearRect(0, 0, 1, 1);
        sampleCtx.drawImage(bitmap, 0, 0);
        if (bitmap && typeof bitmap.close === 'function') bitmap.close();
      } else if (typeof sampleCtx.drawWindow === 'function') {
        sampleCtx.clearRect(0, 0, 1, 1);
        sampleCtx.drawWindow(window, x, y, 1, 1, 'transparent');
      } else {
        if (DEBUG) console.warn('[blended-addressbar:urlbar] No snapshot API available');
        return null;
      }
    } catch (e) {
      if (DEBUG) console.error('[blended-addressbar:urlbar] Snapshot failed', e);
      return null;
    }

    const data = sampleCtx.getImageData(0, 0, 1, 1).data;
    return {
      rgba: { r: data[0], g: data[1], b: data[2], a: data[3] / 255 },
      meta: {
        x,
        y,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        method: browser?.browsingContext?.currentWindowGlobal?.drawSnapshot ? 'content-snapshot' : 'chrome-snapshot',
        scroll: {
          x: browser?.browsingContext?.top?.scrollX,
          y: browser?.browsingContext?.top?.scrollY
        }
      }
    };
  }

  let samplingActive = false;
  let samplingTimer = 0;
  let samplingInFlight = false;
  let lastCss = null;
  let lastLogAt = 0;
  let currentIntervalMs = samplingIntervalMs;

  function stopSampling() {
    samplingActive = false;
    if (samplingTimer) clearTimeout(samplingTimer);
    samplingTimer = 0;
    samplingInFlight = false;
    if (DEBUG) console.info('[blended-addressbar:urlbar] Stop sampling');
  }

  function scheduleNext() {
    if (!samplingActive) return;
    samplingTimer = setTimeout(sampleTick, currentIntervalMs);
  }

  async function sampleTick() {
    if (!samplingActive || samplingInFlight) {
      scheduleNext();
      return;
    }

    samplingInFlight = true;
    const result = await sampleTabPanelsPixel();
    samplingInFlight = false;

    const pageTheme = await getBrowserPageTheme(gBrowser?.selectedBrowser || null);
    if ((pageTheme?.source === 'header' || pageTheme?.source === 'nav') && pageTheme.bg) {
      if (pageTheme.bg !== lastCss) {
        lastCss = pageTheme.bg;
        applyTheme(pageTheme, 'semantic-priority');
      }
      scheduleNext();
      return;
    }

    if (result && result.rgba) {
      const css = rgbaToCss(result.rgba);
      if (css !== lastCss) {
        lastCss = css;
        const fg = chooseForeground(result.rgba);
        applyTheme({
          bg: css,
          fg,
          bridge: 'sampler',
          source: 'sampler',
          href: gBrowser?.selectedBrowser?.currentURI?.spec || ''
        }, 'sampler');
        if (DEBUG) {
          const now = Date.now();
          if (now - lastLogAt > 1000) {
            lastLogAt = now;
            console.info('[blended-addressbar:urlbar] Apply', css, { ...result.meta, fg });
          }
        }
      }
    }

    scheduleNext();
  }

  async function startSampling(browser = gBrowser?.selectedBrowser || null) {
    stopSampling();
    const fallback = await getDefaultHeaderCss(browser);
    if (!browser || browser !== gBrowser?.selectedBrowser) {
      return;
    }
    applyTheme(fallback, 'fallback');
    if (!samplingEnabled) {
      if (DEBUG) console.info('[blended-addressbar:urlbar] Sampling disabled');
      return;
    }
    samplingActive = true;
    currentIntervalMs = samplingIntervalMs;
    if (DEBUG) console.info('[blended-addressbar:urlbar] Start sampling');
    sampleTick();
  }

  function enterPostLoadSampling() {
    if (!postLoadSamplingEnabled) {
      stopSampling();
      return;
    }
    currentIntervalMs = postLoadSamplingIntervalMs;
    if (DEBUG) console.info('[blended-addressbar:urlbar] Post-load sampling');
  }

  async function updateActive() {
    const browser = gBrowser?.selectedBrowser;
    if (!browser) return;
    if (DEBUG) console.info('[blended-addressbar:urlbar] Update active tab');
    await startSampling(browser);
  }

  function initWhenReady() {
    if (typeof gBrowser === 'undefined' || !gBrowser) {
      setTimeout(initWhenReady, 500);
      return;
    }

    applyLoadbarPrefs();
    observeLoadbarPrefs();

    gBrowser.tabContainer.addEventListener('TabSelect', () => {
      void updateActive();
    });

    const pl = {
      onLocationChange(browserArg, webProgress, req, location, flags) {
        try {
          const active = gBrowser.selectedBrowser;
          const isTop = webProgress && webProgress.isTopLevel;
          const matches = browserArg === active;
          if (isTop && matches) {
            setTimeout(() => {
              void updateActive();
            }, 50);
          }
        } catch {}
      },
      onStateChange(browserArg, webProgress, req, flags) {
        try {
          const active = gBrowser.selectedBrowser;
          const isTop = webProgress && webProgress.isTopLevel;
          const matches = browserArg === active;
          if (!matches || !isTop) return;
          const stopFlag = Ci && Ci.nsIWebProgressListener
            ? Ci.nsIWebProgressListener.STATE_STOP
            : 0x00000010;
          if (flags & stopFlag) {
            if (samplingEnabled) {
              enterPostLoadSampling();
            } else {
              setTimeout(() => {
                void updateActive();
              }, 50);
            }
          }
        } catch {}
      }
    };
    try { gBrowser.addTabsProgressListener(pl); } catch {}

    void updateActive();
  }

  initWhenReady();
})();
