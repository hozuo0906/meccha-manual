const mode = document.querySelector("#mode");
const start = document.querySelector("#start");
const finish = document.querySelector("#finish");
const cancel = document.querySelector("#cancel");
const status = document.querySelector("#status");

function showRecording(recording) {
  start.hidden = recording; mode.disabled = recording; finish.hidden = !recording; cancel.hidden = !recording;
  status.textContent = recording ? "このタブだけを記録しています。入力した値は保存しません。" : "";
}
async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "操作を完了できませんでした");
  return response.value;
}
start.addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await send({ type: "capture:start", tabId: tab.id, mode: mode.value }); showRecording(true);
  } catch (error) { status.textContent = `記録を開始できませんでした。下書きは変更されていません。対象ページを開いて、もう一度お試しください。 (${error.message})`; }
});
finish.addEventListener("click", async () => {
  try { const { draftId } = await send({ type: "capture:finish" }); await chrome.tabs.create({ url: chrome.runtime.getURL(`editor/editor.html#${draftId}`) }); window.close(); }
  catch (error) { status.textContent = `記録を終了できませんでした。操作はまだ記録中です。もう一度お試しください。 (${error.message})`; }
});
cancel.addEventListener("click", async () => { await send({ type: "capture:cancel" }); showRecording(false); });
send({ type: "capture:status" }).then(({ recording }) => showRecording(recording), () => showRecording(false));
