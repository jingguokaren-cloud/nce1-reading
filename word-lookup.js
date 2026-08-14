(function () {
  "use strict";

  const STYLE_ID = "nce-word-lookup-style";
  // Trigger before mobile Safari/Chrome normally opens its native long-press menu.
  const LONG_PRESS_MS = 450;
  const MOVE_TOLERANCE = 14;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .nce-lookup-surface,.nce-lookup-surface *{-webkit-touch-callout:none}
      .nce-word-popover{position:fixed;z-index:10000;width:min(320px,calc(100vw - 24px));padding:15px;border:1px solid #dfe5ef;border-radius:14px;background:#fff;color:#263249;box-shadow:0 14px 40px rgba(38,50,73,.2);font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;line-height:1.45}
      .nce-word-popover__head{display:flex;align-items:center;gap:10px}
      .nce-word-popover__word{min-width:0;flex:1;color:#4169dc;font-size:18px;font-weight:800;overflow-wrap:anywhere}
      .nce-word-popover__close{display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:9px;background:#f0f3f8;color:#667087;font-size:20px;cursor:pointer}
      .nce-word-popover__meaning{margin-top:7px;color:#566177;font-size:14px;overflow-wrap:anywhere}
      .nce-word-popover__action{width:100%;min-height:42px;margin-top:13px;border:0;border-radius:10px;background:#e8efff;color:#315bc5;font-size:14px;font-weight:750;cursor:pointer}
      .nce-word-popover__action.saved{background:#edf9f3;color:#168052}
      .nce-word-popover__action:disabled{cursor:default}
      .nce-lookup-highlight{border-radius:3px;background:#fff0a8}
      @media (hover:none) and (pointer:coarse){
        .nce-lookup-surface,.nce-lookup-surface *{-webkit-user-select:none;user-select:none}
        .nce-lookup-surface input,.nce-lookup-surface textarea{-webkit-user-select:text;user-select:text}
        .nce-word-popover{padding:17px}
        .nce-word-popover__close{width:42px;height:42px}
        .nce-word-popover__action{min-height:48px;font-size:15px}
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeWord(value) {
    const match = String(value || "").trim().match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/);
    return match ? match[0].replace(/’/g, "'").toLowerCase() : "";
  }

  function wordAtPoint(x, y) {
    let node;
    let offset;
    if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(x, y);
      node = position?.offsetNode;
      offset = position?.offset;
    } else if (document.caretRangeFromPoint) {
      const position = document.caretRangeFromPoint(x, y);
      node = position?.startContainer;
      offset = position?.startOffset;
    }
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const text = node.textContent || "";
    const matcher = /[A-Za-z]+(?:['’\-][A-Za-z]+)*/g;
    let match;
    while ((match = matcher.exec(text))) {
      if (offset < match.index || offset > match.index + match[0].length) continue;
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      return { word: normalizeWord(match[0]), range };
    }
    return null;
  }

  function selectionWord() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const word = normalizeWord(selection.toString());
    if (!word || normalizeWord(selection.toString()) !== selection.toString().trim().toLowerCase().replace(/’/g, "'")) return null;
    return { word, range: selection.getRangeAt(0).cloneRange() };
  }

  function lookup(word) {
    return new Promise((resolve) => {
      const callback = `nce_dict_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const script = document.createElement("script");
      let finished = false;
      const cleanup = () => {
        delete window[callback];
        script.remove();
      };
      const finish = (meaning) => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(meaning || "未找到释义");
      };
      window[callback] = (data) => {
        const entry = data?.data?.entries?.[0];
        finish(entry?.explain || entry?.entry);
      };
      script.src = `https://dict.youdao.com/suggest?num=1&doctype=json&q=${encodeURIComponent(word)}&callback=${callback}`;
      script.onerror = () => finish("查词服务暂时不可用，请稍后再试");
      document.body.appendChild(script);
      window.setTimeout(() => finish("查词超时，请检查网络后重试"), 7000);
    });
  }

  function init({ root, isSaved, onSave }) {
    const surface = typeof root === "string" ? document.querySelector(root) : root;
    if (!surface) return;
    installStyles();
    surface.classList.add("nce-lookup-surface");
    let timer = 0;
    let start = null;
    let popover = null;
    let highlightedRange = null;
    let suppressContextMenuUntil = 0;

    const close = () => {
      popover?.remove();
      popover = null;
      highlightedRange = null;
      window.getSelection()?.removeAllRanges();
    };
    const position = (rect) => {
      const margin = 12;
      const width = Math.min(320, window.innerWidth - margin * 2);
      const left = Math.max(margin, Math.min(window.innerWidth - width - margin, rect.left + rect.width / 2 - width / 2));
      const estimatedHeight = popover?.offsetHeight || 170;
      const above = rect.top - estimatedHeight - 10;
      const top = above >= margin ? above : Math.min(window.innerHeight - estimatedHeight - margin, rect.bottom + 10);
      Object.assign(popover.style, { left: `${left}px`, top: `${Math.max(margin, top)}px` });
    };
    const show = async ({ word, range }) => {
      if (!word) return;
      close();
      highlightedRange = range;
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      const rect = range.getBoundingClientRect();
      popover = document.createElement("section");
      popover.className = "nce-word-popover";
      popover.setAttribute("role", "dialog");
      popover.setAttribute("aria-label", `${word} 的中文释义`);
      popover.innerHTML = `<div class="nce-word-popover__head"><div class="nce-word-popover__word"></div><button class="nce-word-popover__close" type="button" aria-label="关闭">×</button></div><div class="nce-word-popover__meaning" role="status">正在查询…</div><button class="nce-word-popover__action" type="button" disabled>查询后可加入生词本</button>`;
      popover.querySelector(".nce-word-popover__word").textContent = word;
      document.body.appendChild(popover);
      position(rect);
      popover.querySelector(".nce-word-popover__close").onclick = close;
      const meaning = await lookup(word);
      if (!popover) return;
      popover.querySelector(".nce-word-popover__meaning").textContent = meaning;
      const action = popover.querySelector(".nce-word-popover__action");
      const saved = Boolean(isSaved(word));
      action.disabled = saved || meaning.startsWith("查词") || meaning === "未找到释义";
      action.textContent = saved ? "✓ 已加入生词本" : "＋ 加入生词本";
      action.classList.toggle("saved", saved);
      action.onclick = async () => {
        await onSave(word, meaning);
        action.disabled = true;
        action.textContent = "✓ 已加入生词本";
        action.classList.add("saved");
      };
      position(rect);
    };
    const eligible = (target) => target instanceof Element && surface.contains(target) && !target.closest("button,input,textarea,select,a,[contenteditable],.nce-word-popover");
    const cancelPress = () => { window.clearTimeout(timer); timer = 0; start = null; };

    surface.addEventListener("pointerdown", (event) => {
      if ((event.pointerType !== "touch" && event.pointerType !== "pen") || !eligible(event.target)) return;
      cancelPress();
      start = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      timer = window.setTimeout(() => {
        const found = wordAtPoint(start.x, start.y);
        if (found) {
          suppressContextMenuUntil = Date.now() + 900;
          navigator.vibrate?.(25);
          show(found);
        }
        cancelPress();
      }, LONG_PRESS_MS);
    }, { passive: true });
    surface.addEventListener("pointermove", (event) => {
      if (!start || event.pointerId !== start.pointerId) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE) cancelPress();
    }, { passive: true });
    surface.addEventListener("pointerup", cancelPress, { passive: true });
    surface.addEventListener("pointercancel", cancelPress, { passive: true });
    // Prevent the browser dictionary/copy menu inside study text. Interactive
    // controls are excluded so their normal behavior remains available.
    surface.addEventListener("contextmenu", (event) => {
      if (eligible(event.target)) event.preventDefault();
    }, { capture: true });
    surface.addEventListener("dblclick", () => {
      const found = selectionWord();
      if (found) show(found);
    });
    document.addEventListener("pointerdown", (event) => {
      if (popover && !popover.contains(event.target) && !surface.contains(event.target)) close();
    });
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, { passive: true });
  }

  window.NCEWordLookup = { init };
})();
