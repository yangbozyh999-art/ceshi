/* 构建脚本：把 js/ 下的 ES 模块打包成单个普通脚本 js/app.bundle.js
 * 运行：node build.js   （修改任何源码后需重新执行） */
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function stripImports(src) {
  // 本项目所有 import 均为单行
  return src.replace(/^import\s[^;]*?from\s*["'][^"']+["'];?\s*$/gm, "");
}
function stripExports(src) {
  return src
    .replace(/export\s+(async\s+)?function/g, "$1function")
    .replace(/export\s+const/g, "const")
    .replace(/export\s+\{[^}]*\};?/g, "");
}

const out = [];
out.push(`/* ⚠️ 本文件由 build.js 自动生成，请勿手改；源码在 js/ 目录 */
window.__tasks = window.__tasks || {};
window.addEventListener("error", function (e) {
  var d = document.getElementById("js-error");
  if (d) { d.hidden = false; d.textContent = "⚠️ 脚本错误：" + (e.message || "unknown") + " (@" + String(e.filename || "").split("/").pop() + ":" + e.lineno + ")"; }
});
window.addEventListener("unhandledrejection", function (e) {
  var d = document.getElementById("js-error");
  var r = e.reason && e.reason.message ? e.reason.message : String(e.reason || "unknown");
  if (d) { d.hidden = false; d.textContent = "⚠️ 异步错误：" + r; }
});
`);

// 1) helpers / scoring / ai：提升为全局（名字互不冲突）
for (const f of ["js/helpers.js", "js/scoring.js", "js/ai.js"]) {
  out.push(`/* ===== ${f} ===== */\n` + stripExports(stripImports(read(f))));
}

// 2) 任务模块：各自包进 IIFE，挂到 window.__tasks
const TASK_IDS = ["consent", "device", "srt", "schulte", "stroop", "cancel", "gonogo", "nback", "digitspan", "survey", "results"];
for (const id of TASK_IDS) {
  const body = stripExports(stripImports(read(`js/tasks/${id}.js`)));
  out.push(`/* ===== tasks/${id}.js ===== */\nwindow.__tasks["${id}"] = (() => {\n${body}\nreturn { run };\n})();`);
}

// 3) app.js：动态 import 替换为任务表查找
let appSrc = stripImports(read("js/app.js"));
appSrc = appSrc.replace(/import\("\.\/tasks\/([a-z]+)\.js"\)/g, 'Promise.resolve({ run: window.__tasks["$1"].run })');
out.push(`/* ===== app.js ===== */\n` + appSrc);

fs.writeFileSync(path.join(ROOT, "js", "app.bundle.js"), out.join("\n\n"));
console.log("built js/app.bundle.js (" + out.join("\n").split("\n").length + " lines)");
