import { draftStore } from "../storage/draft-store.js";
const id = location.hash.slice(1);
const draft = await draftStore.get(id);
if (!draft) throw new Error("下書きが見つかりません");
const title = document.querySelector("#title"); const description = document.querySelector("#description");
const steps = document.querySelector("#steps"); const detail = document.querySelector("#detail"); const status = document.querySelector("#status");
title.value = draft.title; description.value = draft.description;
function renderDetail(step) { detail.textContent = step ? `${step.order}. ${step.label || (step.kind === "scroll" ? "画面をスクロールする" : "ページを移動する")}` : "記録された手順はありません。"; }
for (const step of draft.steps) { const item = document.createElement("li"); const button = document.createElement("button"); button.textContent = `${step.order}. ${step.label || step.kind}`; button.addEventListener("click", () => renderDetail(step)); item.append(button); steps.append(item); }
renderDetail(draft.steps[0]);
for (const field of [title, description]) field.addEventListener("input", async () => { draft.title = title.value; draft.description = description.value; draft.updatedAt = new Date().toISOString(); await draftStore.put(draft); status.textContent = "この端末に保存しました。"; });
document.querySelector("#save").addEventListener("click", () => { status.textContent = "保存して続けるにはログインが必要です。下書きはこの端末に残っています。"; });
