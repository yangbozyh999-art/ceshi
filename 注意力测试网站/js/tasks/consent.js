/* ① 知情同意与基本信息填写 */
export async function run(box, ctx) {
  box.innerHTML = `
    <div class="consent-text">
      <b>知情同意书</b>
      <p>1. 本测试为<b>自测/娱乐/研究用途，不构成医学诊断</b>。结果不代表任何临床结论。</p>
      <p>2. 测试包含 9 项认知任务，约 15~20 分钟。所有任务数据（反应时、正确率等）仅用于生成本次报告。</p>
      <p>3. 所有数据<b>仅保存在你的浏览器本地</b>，默认不上传；你可随时在结果页导出 JSON/CSV 或清除数据。</p>
      <p>4. 默认<b>不采集</b>注意力相关诊断等敏感信息；你也可以随时放弃测试，不会有任何后果。</p>
    </div>
    <label class="check-row"><input type="checkbox" id="ck-agree">
      <span>我已阅读并理解上述说明，自愿参加本次测试。</span></label>

    <div class="task-title">基本信息</div>
    <div class="field-row" style="grid-template-columns:repeat(3,1fr)">
      <label class="field"><span>年龄 <b class="req">*</b></span><input id="f-age" type="number" min="6" max="99" required></label>
      <label class="field"><span>设备类型 <b class="req">*</b></span>
        <select id="f-device"><option value="">请选择</option><option>手机</option><option>平板</option><option>电脑</option></select></label>
      <label class="field"><span>主要输入方式 <b class="req">*</b></span>
        <select id="f-input"><option value="">请选择</option><option>触屏</option><option>鼠标</option><option>键盘</option></select></label>
    </div>
    <details><summary class="hint" style="cursor:pointer">选填信息（用于结果解读参考，不影响客观分）</summary>
      <div class="field-row" style="grid-template-columns:repeat(3,1fr);margin-top:10px">
        <label class="field"><span>性别</span><select id="f-sex"><option>不愿透露</option><option>男</option><option>女</option><option>其他</option></select></label>
        <label class="field"><span>教育年限</span><input id="f-edu" type="number" min="0" max="30" placeholder="如 12"></label>
        <label class="field"><span>母语</span><input id="f-lang" type="text" placeholder="如 中文"></label>
        <label class="field"><span>是否戴眼镜/矫正</span><select id="f-glasses"><option>否</option><option>是</option></select></label>
        <label class="field"><span>利手</span><select id="f-hand"><option>右利手</option><option>左利手</option><option>双手</option></select></label>
      </div>
    </details>
    <p class="hint" id="consent-err" style="color:var(--danger)" hidden>请完成必填项并勾选同意。</p>
    <div class="center-actions"><button class="btn primary" id="go">开始测试</button></div>
  `;

  return new Promise((resolve) => {
    box.querySelector("#go").addEventListener("click", () => {
      const age = box.querySelector("#f-age").value;
      const device_type = box.querySelector("#f-device").value;
      const input_method = box.querySelector("#f-input").value;
      const agree = box.querySelector("#ck-agree").checked;
      if (!agree || !age || !device_type || !input_method) {
        box.querySelector("#consent-err").hidden = false;
        return;
      }
      resolve({ info: {
        consent: true,
        age: +age,
        device_type, input_method,
        sex: box.querySelector("#f-sex").value,
        education_years: box.querySelector("#f-edu").value ? +box.querySelector("#f-edu").value : null,
        native_language: box.querySelector("#f-lang").value.trim() || null,
        glasses: box.querySelector("#f-glasses").value === "是",
        handedness: box.querySelector("#f-hand").value,
        test_time: new Date().toISOString(),
      }});
    });
  });
}
