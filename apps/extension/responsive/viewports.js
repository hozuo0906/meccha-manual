export const VIEWPORTS = Object.freeze({
  pc: { label: "PC", width: null, height: null },
  smartphonePortrait: { label: "スマホ（縦）", width: 390, height: 844 },
  smartphoneLandscape: { label: "スマホ（横）", width: 844, height: 390 },
  tabletPortrait: { label: "タブレット（縦）", width: 768, height: 1024 },
  tabletLandscape: { label: "タブレット（横）", width: 1024, height: 768 }
});

export function targetOuterBounds(viewport, measured, current) {
  if (!viewport.width || !viewport.height) return null;
  const chromeWidth = Math.max(0, current.width - measured.innerWidth);
  const chromeHeight = Math.max(0, current.height - measured.innerHeight);
  return {
    width: Math.max(320, viewport.width + chromeWidth),
    height: Math.max(320, viewport.height + chromeHeight)
  };
}
