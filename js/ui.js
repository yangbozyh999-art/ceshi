/* 轻量弹层：确认框 / 输入框 / 浮动提示
 * 为什么不用原生 confirm/alert/prompt：内置预览面板、iframe 沙箱、部分手机浏览器
 * 会静默屏蔽这些 API（confirm 直接返回 false），表现为"点击没反应"。
 * 这里全部用项目内的 DOM 弹层实现，任何环境都能正常交互。 */

let layerEl = null;
let active = null;   // { resolve, prevFocus, onKey }

function ensureLayer() {
  if (layerEl && document.body.contains(layerEl)) return layerEl;
  layerEl = document.createElement("div");
  layerEl.className = "ui-layer";
  layerEl.hidden = true;
  layerEl.innerHTML = `
    <div class="ui-mask"></div>
    <div class="ui-dialog" role="dialog" aria-modal="true" aria-labelledby="ui-title">
      <h3 class="ui-title" id="ui-title"></h3>
      <p class="ui-msg"></p>
      <textarea class="ui-input" rows="4" spellcheck="false" hidden></textarea>
      <div class="ui-actions">
        <button type="button" class="btn ui-cancel">取消</button>
        <button type="button" class="btn ui-ok">确定</button>
      </div>
    </div>`;
  document.body.appendChild(layerEl);
  return layerEl;
}

function close(result) {
  if (!active) return;
  const { resolve, prevFocus, onKey } = active;
  active = null;
  document.removeEventListener("keydown", onKey, true);
  if (layerEl) layerEl.hidden = true;
  if (prevFocus && typeof prevFocus.focus === "function") {
    try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  resolve(result);
}

/* opts: { title, message, okText, cancelText(null=单按钮), danger, input:{value,placeholder,rows}, resolve } */
function render(opts, resolve) {
  if (active) close(null);   // 前一个弹层还在时先收掉，避免叠加

  const box = ensureLayer();
  const q = (s) => box.querySelector(s);
  const titleEl = q(".ui-title");
  const msgEl = q(".ui-msg");
  const inputEl = q(".ui-input");
  const okBtn = q(".ui-ok");
  const cancelBtn = q(".ui-cancel");

  titleEl.textContent = opts.title || "提示";
  titleEl.hidden = !opts.title;
  msgEl.textContent = opts.message || "";
  msgEl.hidden = !opts.message;

  const useInput = !!opts.input;
  inputEl.hidden = !useInput;
  if (useInput) {
    inputEl.value = opts.input.value || "";
    inputEl.placeholder = opts.input.placeholder || "";
    inputEl.rows = opts.input.rows || 4;
  }

  okBtn.textContent = opts.okText || "确定";
  okBtn.className = "btn ui-ok " + (opts.danger ? "danger" : "primary");
  const single = opts.cancelText === null;
  cancelBtn.hidden = single;
  cancelBtn.textContent = opts.cancelText || "取消";

  box.hidden = false;
  const prevFocus = document.activeElement;
  const cancelValue = useInput ? null : (single ? true : false);

  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close(cancelValue);
    } else if (e.key === "Enter" && (!useInput || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      close(useInput ? inputEl.value : true);
    }
  };
  document.addEventListener("keydown", onKey, true);
  active = { resolve, prevFocus, onKey };

  q(".ui-mask").onclick = () => close(cancelValue);
  cancelBtn.onclick = () => close(cancelValue);
  okBtn.onclick = () => close(useInput ? inputEl.value : true);

  setTimeout(() => {
    try {
      if (useInput) inputEl.focus();
      else if (!single) cancelBtn.focus({ preventScroll: true });
      else okBtn.focus({ preventScroll: true });
    } catch (e) { /* ignore */ }
  }, 30);
}

/* 确认框：返回 Promise<boolean>；cancelText 传 null 则只有"知道了"一个按钮 */
export function uiConfirm(opts) {
  const o = typeof opts === "string" ? { message: opts } : (opts || {});
  return new Promise((resolve) => render({
    title: o.title || "",
    message: o.message || "",
    okText: o.okText,
    cancelText: o.cancelText === undefined ? "取消" : o.cancelText,
    danger: o.danger,
  }, resolve));
}

/* 输入框：返回 Promise<string|null>，取消返回 null */
export function uiPrompt(opts) {
  const o = typeof opts === "string" ? { message: opts } : (opts || {});
  return new Promise((resolve) => render({
    title: o.title || "编辑内容",
    message: o.message || "",
    okText: o.okText || "复制",
    cancelText: "取消",
    input: { value: o.value || "", placeholder: o.placeholder || "", rows: o.rows || 5 },
  }, resolve));
}

/* 浮动提示：不打断操作，2 秒自动消失 */
let toastEl = null;
let toastTimer = null;
export function uiToast(msg, type = "ok") {
  if (!toastEl || !document.body.contains(toastEl)) {
    toastEl = document.createElement("div");
    toastEl.className = "ui-toast";
    document.body.appendChild(toastEl);
  }
  toastEl.className = "ui-toast " + (type === "err" ? "is-err" : "is-ok");
  toastEl.textContent = msg;
  toastEl.hidden = false;
  requestAnimationFrame(() => { if (toastEl) toastEl.classList.add("is-show"); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (!toastEl) return;
    toastEl.classList.remove("is-show");
    setTimeout(() => { if (toastEl) toastEl.hidden = true; }, 220);
  }, 2200);
}
