const DEFAULTS = {
  itemSelector: ".masonry__item",
  gap: 16,
  minWidth: 240,
  observe: true,

  // ページload後に開始（内部で待つ）
  startOnLoad: false,

  // transform アニメ
  animate: false,
  duration: 240, // ms

  // fade アニメ
  fadeIn: true,
  fadeDuration: 240, // ms

  // ★ 上から順に1要素ずつフェード
  stagger: true,
  staggerDelay: 50,       // ms（1要素ごとの遅延）
  staggerMode: "visual",  // "visual"（上から順）固定推奨

  // 初回：画像decode待ちしてから表示
  decodeOnInit: true,

  // append：画像decode待ちしてから追加分だけ表示
  decodeOnAppend: true,
  decodeTimeout: 2000, // ms（0なら無制限）

  // ResizeObserver等の反応をdebounce
  resizeDebounce: 120, // ms（0ならdebounce無し）

  easing: "ease",
  minHeight: 1
};

function toNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function isPageLoaded() {
  return typeof document !== "undefined" && document.readyState === "complete";
}

function debounce(fn, wait) {
  if (!wait || wait <= 0) return fn;
  let t = 0;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

async function waitImagesDecoded(rootEl, timeoutMs = 0) {
  const imgs = Array.from(rootEl.querySelectorAll("img"));
  if (!imgs.length) return;

  const waitOne = async (img) => {
    if (img.complete && img.naturalWidth > 0) {
      if (typeof img.decode === "function") {
        try { await img.decode(); } catch (_) {}
      }
      return;
    }

    await new Promise((resolve) => {
      const done = () => resolve();
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });

    if (typeof img.decode === "function") {
      try { await img.decode(); } catch (_) {}
    }
  };

  const p = Promise.all(imgs.map(waitOne));
  if (!timeoutMs || timeoutMs <= 0) {
    await p;
    return;
  }
  await Promise.race([p, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

// ---- stagger（上から順） ----
function getTranslateY(el) {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;

  const m3 = t.startsWith("matrix3d(");
  const nums = t
    .replace(/^matrix3d?\(|\)$/g, "")
    .split(",")
    .map((v) => Number(v.trim()));

  // matrix -> ty index 5, matrix3d -> ty index 13
  const ty = m3 ? nums[13] : nums[5];
  return Number.isFinite(ty) ? ty : 0;
}

function sortByVisualTop(items) {
  // y が小さい順（上から）
  return [...items].sort((a, b) => getTranslateY(a) - getTranslateY(b));
}

function revealStagger(items, delayMs) {
  const total = Math.max(0, (items.length - 1) * delayMs) + 80;

  // まず delay をセット
  items.forEach((el, i) => {
    el.style.transitionDelay = `${i * delayMs}ms`;
  });

  // 2フレーム後に opacity を上げる（確実にトランジションが効く）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      for (const el of items) el.style.opacity = "1";
    });
  });

  // delayを戻す
  setTimeout(() => {
    for (const el of items) el.style.transitionDelay = "";
  }, total);
}

export class MasonryFlow {
  /**
   * @param {string|Element} root
   * @param {Partial<typeof DEFAULTS>} opts
   */
  constructor(root, opts = {}) {
    this.root = typeof root === "string" ? document.querySelector(root) : root;
    if (!this.root) throw new Error("MasonryFlow: root not found");

    this._started = false;
    this._didFirstReveal = false;

    // append分だけフェード対象
    this._pendingFadeEls = new Set();

    this.items = [];
    this._raf = 0;
    this._resizeObs = null;
    this._mutObs = null;

    const d = this.root.dataset;
    this.opts = { ...DEFAULTS, ...opts };

    // data属性で上書き（WP向け）
    if (d.item) this.opts.itemSelector = d.item;
    if (d.gap) this.opts.gap = toNumber(d.gap, this.opts.gap);
    if (d.min) this.opts.minWidth = toNumber(d.min, this.opts.minWidth);
    if (d.observe) this.opts.observe = d.observe !== "false";

    if (d.startOnLoad) this.opts.startOnLoad = d.startOnLoad === "true";

    if (d.animate) this.opts.animate = d.animate === "true";
    if (d.duration) this.opts.duration = toNumber(d.duration, this.opts.duration);

    if (d.fade) this.opts.fadeIn = d.fade === "true";
    if (d.fadeDuration) this.opts.fadeDuration = toNumber(d.fadeDuration, this.opts.fadeDuration);

    if (d.stagger) this.opts.stagger = d.stagger === "true";
    if (d.staggerDelay) this.opts.staggerDelay = toNumber(d.staggerDelay, this.opts.staggerDelay);

    if (d.decodeOnInit) this.opts.decodeOnInit = d.decodeOnInit !== "false";
    if (d.decodeOnAppend) this.opts.decodeOnAppend = d.decodeOnAppend !== "false";
    if (d.decodeTimeout) this.opts.decodeTimeout = toNumber(d.decodeTimeout, this.opts.decodeTimeout);

    if (d.resizeDebounce) this.opts.resizeDebounce = toNumber(d.resizeDebounce, this.opts.resizeDebounce);

    if (prefersReducedMotion()) {
      this.opts.animate = false;
      this.opts.fadeIn = false;
      this.opts.stagger = false;
    }

    // 親のposition
    const computed = getComputedStyle(this.root);
    if (computed.position === "static") this.root.style.position = "relative";

    if (this.opts.minHeight > 0 && !this.root.style.minHeight) {
      this.root.style.minHeight = `${this.opts.minHeight}px`;
    }

    // debounce版 requestLayout
    this._debouncedRequestLayout = debounce(() => this.requestLayout(), this.opts.resizeDebounce);

    // startOnLoad待ち
    if (this.opts.startOnLoad && !isPageLoaded()) {
      window.addEventListener("load", () => this.start(), { once: true });
      return;
    }

    this.start();
  }

  start() {
    if (this._started) return;
    this._started = true;

    this.refresh();
    this.layout();

    // まずはアイテムを隠す（初回/append共通の前提）
    if (this.opts.fadeIn) {
      for (const el of this.items) el.style.opacity = "0";
    }

    // コンテナ表示（CSSでopacity:0→1）
    requestAnimationFrame(() => {
      this.root.classList.remove("is-mf-loading");
      this.root.classList.add("is-mf-ready");
    });

    if (this.opts.observe) this._setupObservers();
    window.addEventListener("resize", this._onResize, { passive: true });

    if (this.opts.fadeIn && this.opts.decodeOnInit) {
      this._initAfterDecode();
    } else {
      this._revealAllOnce();
    }
  }

  async _initAfterDecode() {
    await waitImagesDecoded(this.root, this.opts.decodeTimeout);

    // decode後にレイアウト確定
    this.requestLayout();

    // debounceのlayoutが走った「後」に出すため、2rafで待つ
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._revealAllOnce();
      });
    });
  }

  _revealAllOnce() {
    if (!this.opts.fadeIn || this._didFirstReveal) return;

    if (this.opts.stagger) {
      const ordered = sortByVisualTop(this.items);
      revealStagger(ordered, this.opts.staggerDelay);
    } else {
      for (const el of this.items) el.style.opacity = "1";
    }

    this._didFirstReveal = true;
  }

  refresh() {
    this.items = Array.from(this.root.querySelectorAll(this.opts.itemSelector));

    for (const el of this.items) {
      el.style.position = "absolute";

      const transitions = [];

      if (this.opts.animate) {
        el.style.willChange = "transform";
        transitions.push(`transform ${this.opts.duration}ms ${this.opts.easing}`);
      } else {
        el.style.willChange = "";
      }

      if (this.opts.fadeIn) {
        transitions.push(`opacity ${this.opts.fadeDuration}ms ${this.opts.easing}`);
      }

      el.style.transition = transitions.join(", ");
    }

    if (this._resizeObs) {
      this._resizeObs.disconnect();
      for (const el of this.items) this._resizeObs.observe(el);
    }
  }

  requestLayout() {
    if (!this._started) return;

    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.refresh();
      this.layout();
    });
  }

  layout() {
    const { gap, minWidth } = this.opts;

    const width = this.root.clientWidth;
    if (!width) return;

    const cols = Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
    const colWidth = (width - gap * (cols - 1)) / cols;

    const colHeights = new Array(cols).fill(0);

    for (const el of this.items) {
      el.style.width = `${colWidth}px`;

      let col = 0;
      for (let i = 1; i < cols; i++) {
        if (colHeights[i] < colHeights[col]) col = i;
      }

      const x = (colWidth + gap) * col;
      const y = colHeights[col];

      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;

      const h = el.offsetHeight;
      colHeights[col] = y + h + gap;
    }

    const max = Math.max(...colHeights, 0);
    this.root.style.height = `${Math.max(0, max - gap)}px`;

    // append分だけ上から順に1要素ずつフェード
    if (this.opts.fadeIn && this._didFirstReveal && this._pendingFadeEls.size) {
      const pending = Array.from(this._pendingFadeEls);
      this._pendingFadeEls.clear();

      if (this.opts.stagger) {
        // transform確定後なのでvisual順でOK
        const ordered = sortByVisualTop(pending);
        revealStagger(ordered, this.opts.staggerDelay);
      } else {
        requestAnimationFrame(() => {
          for (const el of pending) el.style.opacity = "1";
        });
      }
    }
  }

  /**
   * append：画像decode後に配置→追加分だけ上から順にフェード
   * @param {Element|Element[]|NodeList} elements
   */
  async append(elements) {
    const list = Array.isArray(elements)
      ? elements
      : Array.from(elements instanceof NodeList ? elements : [elements]);

    for (const el of list) {
      if (this.opts.fadeIn) {
        el.style.opacity = "0";
        this._pendingFadeEls.add(el);
      }
      this.root.appendChild(el);
    }

    if (this.opts.decodeOnAppend) {
      await Promise.all(list.map((el) => waitImagesDecoded(el, this.opts.decodeTimeout)));
    }

    this._debouncedRequestLayout();
  }

  destroy() {
    window.removeEventListener("resize", this._onResize);
    if (this._resizeObs) this._resizeObs.disconnect();
    if (this._mutObs) this._mutObs.disconnect();
    if (this._raf) cancelAnimationFrame(this._raf);

    this.root.style.height = "";

    for (const el of this.items) {
      el.style.position = "";
      el.style.width = "";
      el.style.transform = "";
      el.style.transition = "";
      el.style.willChange = "";
      el.style.opacity = "";
      el.style.transitionDelay = "";
    }

    this.items = [];
    this._pendingFadeEls.clear();
    delete this.root.__masonryFlowInstance;
  }

  _onResize = () => this._debouncedRequestLayout();

  _setupObservers() {
    if ("ResizeObserver" in window) {
      this._resizeObs = new ResizeObserver(() => this._debouncedRequestLayout());
      for (const el of this.items) this._resizeObs.observe(el);
    } else {
      this.root.addEventListener("load", () => this._debouncedRequestLayout(), true);
    }

    if ("MutationObserver" in window) {
      this._mutObs = new MutationObserver(() => this._debouncedRequestLayout());
      this._mutObs.observe(this.root, { childList: true, subtree: true });
    }
  }

  static autoInit(selector = "[data-masonry]", opts = {}) {
    const roots = Array.from(document.querySelectorAll(selector));

    return roots.map((root) => {
      if (root.__masonryFlowInstance) return root.__masonryFlowInstance;
      const inst = new MasonryFlow(root, opts);
      root.__masonryFlowInstance = inst;
      return inst;
    });
  }
}
