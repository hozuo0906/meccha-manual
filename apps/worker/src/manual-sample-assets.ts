/** Public synthetic fixture. No workspace, persisted revision, or private asset IDs. */
export const MANUAL_SAMPLE_IMAGE_PATHS: Record<string, string> = {
  "/manuals/sample/images/list.png": "/assets/manual-sample/list.png",
  "/manuals/sample/images/form.png": "/assets/manual-sample/form.png",
  "/manuals/sample/images/complete.png": "/assets/manual-sample/complete.png",
};

export const MANUAL_SAMPLE_DETAIL = {
  manual: { id: "sample-supply-request", title: "備品の貸出を申請する（架空の画面）" },
  draft: {
    title: "備品の貸出を申請する（架空の画面）",
    description: "架空の社内ツール「おためし申請」で、会議用の備品を借りる流れです。画面と内容はすべて合成したサンプルです。",
  },
  steps: [
    { title: "申請一覧を開く", instruction: "架空の社内ツール「おためし申請」のメニューから「備品の貸出」を選び、申請一覧を開きます。", image: "list" },
    { title: "新しい申請を始める", instruction: "一覧の右上にある「新しく申請」を選びます。備品貸出の入力画面が表示されます。", image: "list" },
    { title: "借りる備品を選ぶ", instruction: "備品欄から「会議用ボード」を選びます。種類と数量を確認します。", image: "form" },
    { title: "利用目的を入力する", instruction: "利用目的に「打ち合わせで使用」と入力します。この画面は操作例のための架空のものです。", image: "form" },
    { title: "申請内容を確認する", instruction: "備品が「会議用ボード」、数量が「1」、利用目的が「打ち合わせで使用」になっていることを確認し、「申請する」を選びます。", image: "form" },
    { title: "受付完了を確認する", instruction: "「申請を受け付けました」と表示されたら完了です。「一覧へ戻る」を選ぶと申請一覧に戻れます。", image: "complete" },
  ].map((step, index) => ({
    clientKey: `sample-step-${index + 1}`,
    position: index + 1,
    type: "action",
    title: step.title,
    instruction: step.instruction,
    assetUrl: `/manuals/sample/images/${step.image}.png`,
    annotations: [],
  })),
};
