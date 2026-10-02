import { MANUAL_PRINT_CSS, MANUAL_PRINT_JS } from "./manual-print-assets.ts";
import { MANUAL_BRANDING_CSS, MANUAL_BRANDING_JS } from "./manual-branding-assets.ts";
import { EDITOR_TOOLS_CSS, EDITOR_DIALOG_HTML } from "./editor-tools-assets.ts";
export const CLOUD_MANUAL_CSS = `:root{color-scheme:light;font-family:system-ui,-apple-system,sans-serif;color:#20282e;background:#f3fbfa}body{margin:0}.cloud-shell{width:min(1120px,calc(100% - 32px));margin:0 auto;padding:28px 0 56px}.cloud-header{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:24px}.cloud-brand{display:flex;align-items:center;gap:14px}.cloud-brand-logo{width:54px;height:54px;object-fit:contain}.cloud-brand-mascot{width:78px;height:78px;object-fit:contain;align-self:flex-start}.cloud-brand-name{margin:0 0 4px;font-size:.8rem;font-weight:700;letter-spacing:.08em;color:#087f7a}.cloud-header h1{margin:0;font-size:1.7rem}.cloud-note{line-height:1.7;color:#52666a}.cloud-message{padding:12px 14px;border:1px solid #b6deda;border-radius:10px;background:#f7fffd;min-height:1.4em}.cloud-message.error{color:#a3362b;border-color:#f3b6ae;background:#fff7f5}.cloud-message.success{color:#067647;border-color:#abefc6;background:#ecfdf3}.cloud-message.warning{color:#8c5600;border-color:#f2d58a;background:#fffaf0}.cloud-grid{display:grid;grid-template-columns:minmax(250px,34%) 1fr;gap:20px;align-items:start}.cloud-panel{background:#f7fffd;border:1px solid #b6deda;border-radius:14px;padding:20px;box-shadow:0 8px 24px #204a4420}.cloud-list{list-style:none;padding:0;margin:0;display:grid;gap:8px}.cloud-list button{display:block;width:100%;text-align:left;border:1px solid #b6deda;border-radius:9px;padding:12px;background:#f7fffd;color:#20282e;cursor:pointer}.cloud-list button[aria-current=true]{border-color:#149b8a;box-shadow:0 0 0 2px #d5f1ed}.cloud-field{display:grid;gap:6px;margin:14px 0}.cloud-field label{font-weight:700}.cloud-field input,.cloud-field textarea,.cloud-step input,.cloud-step textarea{font:inherit;border:1px solid #9abbb8;border-radius:8px;padding:10px 12px;box-sizing:border-box;width:100%;min-height:44px;background:#fff;color:#20282e}.cloud-field textarea,.cloud-step textarea{min-height:112px;resize:vertical}.cloud-step{border-top:1px solid #b6deda;padding:18px 0 14px}.cloud-step label{display:grid;gap:6px;margin-bottom:12px;font-weight:700;color:#20282e}.cloud-step p{margin:0;line-height:1.7;white-space:pre-wrap}.cloud-step-image{display:block;width:auto;max-width:100%;max-height:480px;margin:12px auto;border-radius:8px;border:1px solid #b6deda}.cloud-step-image-card{margin:12px 0 0;padding:0;border:0;background:transparent}.cloud-step-image-card img{display:block;max-width:100%;max-height:480px;border:1px solid #b6deda;border-radius:8px}.cloud-step-image-card img[hidden]{display:none!important}.cloud-image-status,.cloud-image-error,.cloud-image-empty{margin:0;color:#52666a;line-height:1.5}.cloud-image-error{color:#a3362b}.cloud-image-retry{min-height:36px;margin-top:8px;padding:6px 12px;border:1px solid #149b8a;border-radius:7px;background:#e9faf7;color:#126b5c;font-weight:700;cursor:pointer}.cloud-step-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px}.cloud-actions{display:flex;align-items:center;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:20px;padding:10px 0;border-top:1px solid #b6deda}.cloud-save-state{margin-right:auto;color:#52666a;font-size:.92rem;line-height:1.4}.cloud-save-state[data-state=dirty]{color:#8c5600;font-weight:700}.cloud-save-state[data-state=saving]{color:#126b5c;font-weight:700}button.primary,button.secondary{min-height:44px;padding:9px 16px;border:0;border-radius:8px;font-weight:700;cursor:pointer}.primary{background:#087f7a;color:#fff}.secondary{background:#e9f5f3;color:#20282e}.danger{color:#a3362b}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.share-panel{margin-top:20px;border-top:1px solid #b6deda;padding-top:18px}.share-panel h3{margin:0 0 8px}.share-form{display:grid;gap:12px}.share-form>label{display:grid;gap:6px;font-weight:700}.share-form>label input[type=password],.share-form>label input[type=datetime-local]{font:inherit;min-height:44px;border:1px solid #9abbb8;border-radius:8px;padding:9px;box-sizing:border-box;width:100%}.share-form>label:has(input[type=checkbox]){display:flex;align-items:flex-start;gap:8px;font-weight:400;line-height:1.5}.share-form input[type=checkbox]{width:20px;height:20px;flex:0 0 auto;margin:0}.share-link{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.share-link input{flex:1;min-width:180px}@media(max-width:760px){.cloud-grid{grid-template-columns:1fr}.cloud-header{display:block}.cloud-brand-mascot{display:none}.cloud-header .cloud-actions{justify-content:flex-start}.cloud-actions{position:sticky;bottom:0;z-index:2;background:#f7fffded;backdrop-filter:blur(12px);margin:12px -4px 0;padding:10px 4px;border-top:1px solid #b6deda}.cloud-save-state{flex:1 1 100%;margin-right:0}}/* Shared editor tokens: quiet surfaces, image-first hierarchy, consistent 44px targets. */
:root{--manual-accent:#087f7a;--manual-ink:#183039;--manual-muted:#5c7077;--manual-line:#d7e2e5;--manual-surface:#fff;--manual-canvas:#f2f6f7}
[hidden]{display:none!important}button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #117bce;outline-offset:3px}button:disabled{opacity:.5;cursor:not-allowed}.is-editing.cloud-shell{width:100%;padding:0}.is-editing>.cloud-header{display:none}.is-editing>.cloud-message{margin:0;padding:8px 24px;border:0;border-bottom:1px solid var(--manual-line);border-radius:0;font-size:13px;min-height:20px}.is-editing>.cloud-grid{display:block}.is-editing .cloud-panel:has(#cloud-detail){border:0;border-radius:0;box-shadow:none;padding:0;background:var(--manual-canvas)}.is-editing .manual-library{position:fixed;left:12px;top:110px;z-index:8;width:min(340px,calc(100vw - 64px));max-height:65vh;overflow:auto;box-shadow:0 12px 40px #18303930}.manual-toolbar{min-height:72px;box-sizing:border-box;display:flex;align-items:center;gap:12px;padding:12px 20px;background:#fff;border-bottom:1px solid var(--manual-line);position:sticky;top:0;z-index:5}.manual-toolbar .manual-title{flex:1;min-width:100px;font-size:20px;font-weight:700;border:1px solid transparent;padding:8px;border-radius:7px;color:var(--manual-ink);background:transparent;min-height:44px}.manual-toolbar .manual-title:hover{border-color:var(--manual-line)}.manual-toolbar .cloud-save-state{margin:0;white-space:nowrap;font-size:12px}.manual-toolbar button{white-space:nowrap}.manual-description{background:#fff;border-bottom:1px solid var(--manual-line);padding:8px 24px;color:var(--manual-muted);font-size:13px}.manual-description summary{cursor:pointer;min-height:24px}.manual-description textarea{width:100%;box-sizing:border-box;margin-top:10px;border:1px solid var(--manual-line);padding:12px;font:inherit;min-height:80px}.manual-workspace{display:grid;grid-template-columns:224px minmax(0,1fr) 256px;min-height:calc(100vh - 152px)}.manual-step-nav{padding:20px 12px;border-right:1px solid var(--manual-line);background:#fff;max-height:calc(100vh - 152px);overflow:auto;position:sticky;top:72px;box-sizing:border-box}.manual-step-nav h2,.manual-context-tools h2{font-size:15px;margin:0 0 14px;color:var(--manual-ink)}.manual-step-nav>button{width:100%;margin-bottom:14px}.manual-step-nav ol{list-style:none;margin:0;padding:0;display:grid;gap:6px}.manual-step-nav li button{border:1px solid transparent;border-radius:8px;background:transparent;color:var(--manual-ink);width:100%;text-align:left;line-height:1.5;min-height:48px;padding:10px 12px;cursor:pointer;font:inherit;font-size:14px;overflow-wrap:anywhere}.manual-step-nav li button:hover{background:#f1f7f7}.manual-step-nav li button[aria-current=step]{background:#e5f4f2;border-color:var(--manual-accent);color:#06635f;font-weight:700}.manual-step-center{padding:24px;min-width:0}.manual-step-center .cloud-step{padding:0;border:0}.manual-step-heading{display:flex;align-items:center;gap:18px;margin-bottom:18px}.manual-step-heading>span{white-space:nowrap;font-size:13px;color:var(--manual-muted)}.manual-step-heading>input{font-weight:700;font-size:18px;border-color:transparent;background:transparent}.manual-step-heading>input:hover{border-color:var(--manual-line)}.manual-step-center .cloud-step-image-card{min-height:260px;background:#fff;border:1px solid var(--manual-line);border-radius:10px;display:flex;flex-direction:column;justify-content:center;margin:0 0 20px;overflow:hidden;box-shadow:0 2px 6px #18303908}.manual-step-center .cloud-step-image-card img{max-height:min(52vh,560px);object-fit:contain;width:100%;box-sizing:border-box;border:0;border-radius:0;margin:0}.manual-step-center .cloud-image-status,.manual-step-center .cloud-image-error{padding:24px;text-align:center}.manual-step-center .cloud-image-empty{padding:70px 20px;text-align:center;background:#fff;border:1px dashed #adbdc3;border-radius:10px;margin-bottom:20px}.manual-step-center .cloud-step label{font-size:14px;gap:10px}.manual-step-center textarea{min-height:90px}.manual-context-tools{padding:24px 18px;background:#fff;border-left:1px solid var(--manual-line)}.manual-context-tools button{display:block;width:100%;margin:0 0 10px}.manual-context-tools .cloud-note{font-size:13px;line-height:1.7;margin-top:24px}.manual-share-drawer{position:fixed;z-index:12;right:0;top:0;bottom:0;width:420px;max-width:calc(100vw - 48px);background:#fff;border:0;border-left:1px solid var(--manual-line);box-shadow:-12px 0 60px #18303924;margin:0;padding:24px;overflow:auto}.manual-share-drawer>button:first-child{float:right}.manual-share-drawer h3{font-size:23px;margin:24px 0}.manual-share-drawer .share-feedback{line-height:1.6;color:var(--manual-muted);font-size:14px}.manual-share-drawer .share-form{gap:20px}.manual-share-drawer .share-form>button{min-height:48px}.manual-share-drawer input,.manual-share-drawer button{font:inherit}.manual-share-drawer .share-link input{max-width:100%;min-width:0}
@media(max-width:1100px){.manual-workspace{grid-template-columns:200px minmax(0,1fr)}.manual-context-tools{grid-column:2;border:0;background:var(--manual-canvas);padding:0 24px 24px;display:flex;gap:8px;flex-wrap:wrap}.manual-context-tools h2,.manual-context-tools p{flex-basis:100%}.manual-context-tools button{width:auto}.manual-toolbar{gap:8px;padding:10px 12px}.manual-toolbar .manual-title{font-size:17px}.manual-toolbar .cloud-save-state{max-width:110px;white-space:normal}.manual-step-nav{grid-row:1/3}.manual-step-center{padding:20px}}
@media(max-width:760px){.manual-toolbar{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:6px}.manual-toolbar .manual-title{grid-column:2/4;width:100%;box-sizing:border-box;font-size:16px}.manual-toolbar .cloud-save-state{grid-column:1/2;max-width:none;font-size:11px}.manual-toolbar>.primary{min-height:40px;padding:8px}.manual-toolbar .manual-back{font-size:12px;padding:8px;min-height:40px}.manual-workspace{display:flex;flex-direction:column;min-height:0}.manual-step-nav{position:static;max-height:170px;padding:12px;border-right:0;border-bottom:1px solid var(--manual-line)}.manual-step-nav h2{display:inline-block;font-size:13px;margin:0 12px 8px 0}.manual-step-nav>button{width:auto;min-height:36px;padding:6px 12px;margin:0 0 8px}.manual-step-nav ol{display:flex;overflow:auto;gap:6px}.manual-step-nav li{flex:0 0 160px}.manual-step-nav li button{font-size:13px;min-height:44px;padding:8px}.manual-step-center{padding:16px}.manual-step-center .cloud-step-image-card{min-height:180px}.manual-step-center .cloud-step-image-card img{max-height:38vh}.manual-step-heading{gap:8px;margin-bottom:10px}.manual-step-heading>input{font-size:16px}.manual-step-heading>span{font-size:11px}.manual-context-tools{padding:0 16px 24px}.manual-description{padding:6px 16px}.manual-share-drawer{width:auto;left:0;max-width:none;padding:20px}.is-editing>.cloud-message{font-size:12px;padding:6px 12px}}
@media(max-width:760px){.manual-toolbar{grid-template-columns:44px minmax(0,1fr) auto}.manual-toolbar .manual-back{grid-column:1;grid-row:1;font-size:0;padding:0}.manual-toolbar .manual-back::before{content:"‹";font-size:26px}.manual-toolbar .manual-title{grid-column:2;grid-row:1;min-width:0;font-size:16px}.manual-toolbar .manual-share{grid-column:3;grid-row:1;justify-self:end}.manual-toolbar [data-manual-save]{grid-column:3;grid-row:2}.manual-toolbar .cloud-save-state{grid-column:1/3;grid-row:2;max-width:none;white-space:nowrap}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
` + `.cloud-shell:not(.is-editing){max-width:1120px}.cloud-shell:not(.is-editing) .cloud-grid{display:block}.cloud-shell:not(.is-editing) .cloud-panel:has(#cloud-detail){display:none}.cloud-shell:not(.is-editing) .manual-library{padding:0;border:0;box-shadow:none;background:transparent}.cloud-shell:not(.is-editing) .cloud-list{grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}.cloud-shell:not(.is-editing) .cloud-list-button{min-height:154px;padding:22px;background:#fff;border:1px solid #d7e2e5;display:flex;flex-direction:column;gap:10px;border-radius:12px;box-shadow:0 2px 5px #18303906}.cloud-list-button strong{font-size:17px;font-weight:650;line-height:1.5;overflow-wrap:anywhere}.manual-list-kicker{font-size:11px;color:#087f7a;font-weight:700;letter-spacing:.08em}.manual-list-meta{font-size:12px;color:#5c7077}.manual-search{width:100%;max-width:440px;min-height:44px;border:1px solid #789099;border-radius:8px;padding:10px 14px;font:inherit;background:white;margin:4px 0 24px;box-sizing:border-box}.is-editing .manual-search{max-width:100%;margin-bottom:12px}.is-editing .cloud-list-button{display:grid;gap:6px}.cloud-empty-library{padding:36px;border:1px dashed #789099;background:white;border-radius:12px;line-height:1.8}.cloud-shell:not(.is-editing) .cloud-message{background:transparent;border:0;padding:0;color:#5c7077;margin:0 0 32px}.cloud-header>button{flex:none}.manual-toolbar .primary{background:var(--manual-accent);color:var(--manual-foreground,#fff)}@media(max-width:760px){.cloud-header>button{margin-top:16px}.cloud-shell:not(.is-editing){padding-top:20px}.cloud-shell:not(.is-editing) .cloud-list{grid-template-columns:1fr}.cloud-header .cloud-note{font-size:14px}.manual-search{max-width:none}.manual-toolbar .primary,.manual-toolbar .manual-back{min-height:44px}}
` + MANUAL_PRINT_CSS + MANUAL_BRANDING_CSS + EDITOR_TOOLS_CSS + `
.manual-workspace{--ink:var(--manual-ink);--muted:var(--manual-muted);--border:var(--manual-line);--teal:var(--manual-accent)}.image-editor-dialog{grid-column:2/4;height:100%;min-height:0}.image-editor-dialog .image-editor-form{height:100%;min-height:0}.image-editor-dialog .image-editor-form>header,.image-editor-dialog .image-editor-actions{flex:none;box-sizing:border-box}.image-editor-dialog button{min-height:44px;border:1px solid var(--manual-line);border-radius:8px;padding:8px 12px;background:#fff;color:var(--manual-ink);font:inherit}.image-editor-dialog [data-editor-save]{background:var(--manual-accent);color:var(--manual-foreground,#fff)}.image-editor-dialog textarea,.image-editor-dialog input{box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--manual-line);font:inherit}.image-editor-dialog .property-group[hidden]{display:none}.image-editor-dialog .tool-grid button[aria-pressed=true]{background:var(--manual-accent);color:var(--manual-foreground,#fff)}@media(max-width:1100px){.image-editor-workspace{grid-template-columns:minmax(0,1fr) 220px}}@media(max-width:760px){.image-editor-dialog .image-editor-form{height:auto;min-height:100%}.image-editor-workspace{display:flex;flex-direction:column}.image-editor-canvas-wrap{padding:12px}.image-editor-dialog{min-height:0}.image-editor-tools{border-left:0}.image-editor-actions{position:sticky;bottom:0}.image-editor-actions>span{display:none}}
.is-editing.cloud-shell{height:100dvh;display:flex;flex-direction:column;overflow:hidden}.is-editing>.cloud-grid{flex:1;min-height:0}.is-editing .cloud-panel:has(#cloud-detail),#cloud-detail,.manual-editor{height:100%;min-height:0}.manual-editor{display:flex;flex-direction:column}.manual-toolbar,.manual-description{flex:none}.manual-workspace{flex:1;min-height:0;overflow:hidden;grid-template-rows:minmax(0,1fr)}.manual-step-nav{position:relative;grid-row:1;top:0;max-height:none;overflow:auto}.manual-step-center,.manual-context-tools{overflow:auto}.manual-step-center{scroll-padding-top:16px}.manual-mobile-actions,.manual-tools-toggle,.manual-panel-close{display:none}.manual-panel-backdrop{position:fixed;inset:0;z-index:14;background:#18303955;border:0;border-radius:0}.manual-share-drawer{z-index:20}.manual-context-tools h2{margin-top:12px}.manual-context-tools .manual-panel-close{margin-left:auto;width:auto}
@media(max-width:1100px){.manual-workspace{grid-template-columns:200px minmax(0,1fr)}.manual-tools-toggle{display:block}.manual-context-tools{display:none}.manual-context-tools[data-panel-open=true]{display:flex;flex-direction:column;position:fixed;right:0;top:0;bottom:0;width:280px;z-index:15;background:#fff;padding:20px;border-left:1px solid var(--manual-line)}.manual-panel-close{display:block;min-height:44px}.manual-context-tools button{width:100%;flex:none}.image-editor-dialog{grid-column:2;min-height:0}}
@media(max-width:760px){.manual-toolbar .manual-tools-toggle{display:none}.manual-workspace{display:block}.manual-step-center{height:100%;box-sizing:border-box}.manual-step-nav{display:none}.manual-step-nav[data-panel-open=true]{display:flex;flex-direction:column;position:fixed;inset:20% 0 0;max-height:none;width:auto;z-index:15;border-radius:18px 18px 0 0;padding:16px}.manual-step-nav ol{display:grid;overflow:auto;flex:1}.manual-step-nav li{flex:none}.manual-step-nav>button{width:auto;align-self:flex-start}.manual-step-nav .manual-panel-close{position:absolute;right:16px;top:16px}.manual-context-tools[data-panel-open=true]{inset:22% 0 0;width:auto;border-radius:18px 18px 0 0}.manual-mobile-actions{flex:none;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;background:#fff;border-top:1px solid var(--manual-line);padding:8px 12px;min-height:60px;box-sizing:border-box}.manual-mobile-actions button{min-height:44px}.manual-toolbar .manual-share{display:none}.manual-toolbar .manual-title{grid-column:2/4}.manual-toolbar [data-manual-save]{grid-column:3;grid-row:2}.manual-step-heading input{min-width:0}.image-editor-dialog[open]{height:100%;overflow:auto}.manual-editor:has(.image-editor-dialog[open]) .manual-mobile-actions{display:none}}
.share-feedback[data-kind=error]{color:#a3362b}.share-feedback[data-kind=success]{color:#067647}.share-feedback[data-kind=warning]{color:#8c5600}.expiry-preview{font-size:14px;font-weight:400;color:var(--manual-muted)}.cloud-field input,.cloud-field textarea,.cloud-step input,.cloud-step textarea,.share-form input,button.secondary,.tool-grid button{border-color:#789099}.manual-share-drawer .share-form input[type=text],.manual-share-drawer .share-form input[type=password],.manual-share-drawer .share-form input[type=datetime-local]{border-color:#789099}.manual-share-drawer .cloud-note{overflow-wrap:anywhere;word-break:keep-all}.cloud-image-retry{min-height:44px}
.manual-context-tools .manual-panel-close,.manual-step-nav .manual-panel-close{display:none}
@media(max-width:1100px){.manual-context-tools[data-panel-open=true] .manual-panel-close{display:block}.image-editor-dialog .image-editor-tools{display:flex;flex-direction:column;overflow:auto}.image-editor-dialog .tool-grid{grid-template-columns:repeat(2,minmax(66px,1fr))}.image-editor-dialog .tool-grid button{white-space:nowrap;padding:8px 6px}}
@media(max-width:760px){.manual-step-nav[data-panel-open=true] .manual-panel-close{display:block}.image-editor-dialog[open]{height:100%;overflow:auto}.image-editor-dialog .image-editor-form{display:flex;height:auto;min-height:100%;overflow:visible}.image-editor-dialog .image-editor-workspace{display:block;overflow:visible}.image-editor-dialog .image-editor-canvas-wrap{overflow:visible;min-height:0;width:100%;box-sizing:border-box;padding:12px}.image-editor-dialog #imageEditorCanvas{display:block;max-width:100%;width:100%;height:auto;max-height:none;box-sizing:border-box}.image-editor-dialog .image-editor-tools{overflow:visible;display:flex;gap:14px}.image-editor-dialog .tool-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.image-editor-dialog .image-editor-actions{position:sticky;bottom:0;background:#fff}.image-editor-dialog .selection-group [data-editor-selection]{max-height:none;overflow:visible}}
/* The same restrained step rail and type rhythm as the local editor. */
:root{font-size:16px;background:#f5f7f8;color:var(--manual-ink)}button,input,textarea{font:inherit}button{transition:background-color 140ms ease,border-color 140ms ease}button.secondary{border:1px solid #b5c5ca;background:#fff}button.secondary:hover{background:#edf4f4}.primary:hover{filter:brightness(.94)}
.cloud-shell:not(.is-editing){max-width:1160px;padding:40px 0 64px}.cloud-shell:not(.is-editing) .cloud-header{padding-bottom:28px;margin-bottom:24px;border-bottom:1px solid #d7e2e5}.cloud-brand{gap:16px}.cloud-brand-logo{width:44px;height:44px}.cloud-brand-mascot{width:52px;height:52px;margin-left:auto;align-self:center}.cloud-brand-name{font-size:13px;letter-spacing:.015em}.cloud-header h1{font-size:32px;letter-spacing:-.04em;line-height:1.4}.cloud-header .cloud-note{margin:10px 0 0;font-size:14px}.cloud-header>button{order:2}.cloud-shell:not(.is-editing) .cloud-message{font-size:14px;margin-bottom:24px}.cloud-shell:not(.is-editing) #cloud-list-heading{font-size:16px;margin:0 0 14px;letter-spacing:.02em}.manual-search{max-width:480px;border-color:#8d9da6;margin:0 0 24px;padding:12px 14px;min-height:48px}.cloud-shell:not(.is-editing) .cloud-list{gap:20px}.cloud-shell:not(.is-editing) .cloud-list-button{min-height:170px;border-radius:10px;padding:24px;box-shadow:none;border-top:3px solid #087f7a}.cloud-shell:not(.is-editing) .cloud-list-button:hover{background:#fff;border-color:#087f7a;box-shadow:0 4px 18px #1830390d}.manual-list-kicker{font-size:12px;letter-spacing:.02em}.cloud-list-button strong{font-size:18px;line-height:1.65}.manual-list-meta{font-size:13px;margin-top:auto}.cloud-empty-library,.cloud-loading-library{grid-column:1/-1;padding:36px;border:1px solid #d7e2e5;background:#fff;border-radius:10px;line-height:1.8;color:#526671}.cloud-empty-library h3{margin:0 0 8px;color:#183039;font-size:20px}.cloud-empty-library p{max-width:52ch;margin:0 0 20px}.cloud-empty-library{overflow-wrap:anywhere}.cloud-loading-library{margin:0;border-left:4px solid #087f7a}
.manual-workspace{grid-template-columns:236px minmax(0,1fr) 248px}.manual-step-nav{display:flex;flex-direction:column;overflow:hidden;background:#fbfcfc;padding:20px 12px}.manual-step-nav h2{flex:none;padding:0 8px;margin-bottom:16px;font-size:15px}.manual-step-nav>button{flex:none}.manual-step-nav ol{display:block;flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scroll-padding:8px}.manual-step-nav li{margin-bottom:6px}.manual-step-nav li button{font-size:14px;min-height:54px;padding:12px;line-height:1.65}.manual-step-nav li button[aria-current=step]{background:#e7f4f2;box-shadow:inset 3px 0 var(--manual-accent)}.manual-context-tools{padding:24px 18px}.manual-context-tools h2{font-size:14px;margin:0 0 12px}.manual-context-tools h2:not(:first-child){margin-top:24px}.manual-context-tools button{font-size:14px}.manual-toolbar .manual-title{font-size:18px;letter-spacing:-.02em}.manual-toolbar .cloud-save-state{font-size:12px}.manual-step-heading>span{font-variant-numeric:tabular-nums;font-size:13px}.manual-step-heading>input{font-size:18px}.manual-step-center textarea{font-size:16px;line-height:1.7;min-height:112px}.manual-step-center .cloud-step-image-card{box-shadow:0 2px 4px #18303905;border-radius:8px}.manual-description summary{min-height:32px;display:list-item;padding-top:4px}.manual-share-drawer h3{font-size:24px;letter-spacing:-.025em}.manual-share-drawer{box-sizing:border-box;max-width:100vw}.manual-share-drawer .share-form>label{line-height:1.65}.manual-share-drawer .share-feedback{padding:14px;background:#f3f7f7;border-radius:8px}
@media(max-width:1100px){.manual-workspace{grid-template-columns:214px minmax(0,1fr)}}
@media(max-width:760px){.cloud-shell:not(.is-editing){padding-top:24px}.cloud-shell:not(.is-editing) .cloud-header{display:flex;flex-wrap:wrap;gap:16px;padding-bottom:20px}.cloud-brand{gap:12px}.cloud-brand-logo{width:36px;height:36px}.cloud-header h1{font-size:25px}.cloud-header>button{margin-top:0}.cloud-brand-mascot{display:none}.cloud-shell:not(.is-editing) .cloud-list-button{min-height:146px;padding:20px}.cloud-empty-library,.cloud-loading-library{padding:24px}.manual-workspace{display:block}.manual-step-nav{display:none}.manual-step-nav[data-panel-open=true]{display:flex}.manual-step-nav ol{display:block}.manual-step-center textarea{min-height:120px}.manual-toolbar .manual-title{font-size:16px}.manual-toolbar .cloud-save-state{font-size:12px}.manual-step-heading>span{font-size:12px}.manual-share-drawer{width:100%;padding:20px}.manual-share-drawer h3{font-size:22px}.manual-description summary{min-height:32px}.manual-step-heading>input{font-size:16px}}

@media(max-width:760px) and (max-height:560px){
.is-editing>.cloud-message:not(.error):not(.warning){position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);padding:0;border:0}
.manual-toolbar{display:flex;min-height:60px;padding:8px 12px;gap:8px}.manual-toolbar .manual-back{flex:0 0 44px}.manual-toolbar .manual-title{flex:1;min-width:0;width:auto}.manual-toolbar .cloud-save-state{font-size:12px;max-width:90px;white-space:normal;flex:0 1 auto}.manual-toolbar [data-manual-save]{flex:none}.manual-description{padding:2px 16px}.manual-description summary{min-height:24px;padding:0}.manual-step-center{padding:12px 16px}.manual-step-heading{margin-bottom:10px}.manual-step-center .cloud-step-image-card{min-height:0;margin-bottom:14px}.manual-step-center .cloud-step-image-card img{max-height:none}.manual-mobile-actions{min-height:52px;padding:4px 12px}.manual-mobile-actions button{min-height:44px}
}

.cloud-image-expand{align-self:flex-end;margin:8px 12px;font-size:13px;min-height:44px}.cloud-image-inspection{box-sizing:border-box;width:min(1280px,calc(100vw - 24px));height:calc(100dvh - 24px);max-width:none;max-height:none;padding:20px;border:1px solid #789099;border-radius:10px;background:#fff;color:#183039}.cloud-image-inspection[open]{display:flex;flex-direction:column;gap:12px}.cloud-image-inspection::backdrop{background:#10252bbf}.cloud-image-inspection h2{font-size:18px;margin:0}.cloud-inspection-tools{display:flex;gap:8px;flex:none}.cloud-inspection-tools>button:last-child{margin-left:auto}.cloud-inspection-tools [aria-pressed=true]{background:#e7f4f2;border-color:#087f7a}.cloud-inspection-stage{min-height:0;flex:1;overflow:auto;background:#edf1f2;overscroll-behavior:contain}.cloud-inspection-stage>img{display:block!important;max-width:none!important;max-height:none!important;width:auto!important;height:auto!important;margin:0!important;border:0!important;border-radius:0!important}.cloud-inspection-stage[data-fit=true]{display:flex;align-items:center;justify-content:center}.cloud-inspection-stage[data-fit=true]>img{max-width:100%!important;max-height:100%!important;object-fit:contain;width:auto!important;height:auto!important}@media(max-width:560px){.cloud-image-inspection{padding:12px}.cloud-inspection-tools button{font-size:13px;padding:8px}}

.manual-share-drawer .share-feedback:empty{display:none}

`;

export const CLOUD_MANUAL_JS = `(() => {
  const SHARED_IMAGE_EDITOR_HTML = ${JSON.stringify(EDITOR_DIALOG_HTML)};
  const root = document.querySelector("#cloud-manuals");
  const header = root?.querySelector(".cloud-header");
  if (header) {
    const brand = document.createElement("div"); brand.className = "cloud-brand";
    const logo = document.createElement("img"); logo.className = "cloud-brand-logo"; logo.src = "/s/assets/brand/logo.png"; logo.alt = "めっちゃマニュアル";
    const copy = header.firstElementChild; if (copy) { header.removeChild(copy); brand.append(logo, copy); header.prepend(brand); }
    const mascot = document.createElement("img"); mascot.className = "cloud-brand-mascot"; mascot.src = "/s/assets/brand/mascot.png"; mascot.alt = "めっちゃマニュアルのキャラクター"; header.append(mascot);
  }
  const message = document.querySelector("#cloud-message");
  const list = document.querySelector("#cloud-list");
  const detail = document.querySelector("#cloud-detail");
  const workspaceId = root?.dataset.workspaceId || "";
  let manuals = [];
  let selected = null;
  let detailData = null;
  let editorState = null;
  let dirty = false;
  let saveState = null;
  let editVersion = 0;
  let requestSerial = 0;
  let saveInFlight = false;
  let reloadButton = null;
  let shareState = null;
  let shareToken = null;
  let shareMetaError = null;
  let shareBusy = false;
  let sharePending = null;
  let shareRequest = null;
  let selectedStepKey = null;
  let shareOpen = new URLSearchParams(location.search).has("shareManualId");
  let undoStack = [];
  let redoStack = [];
  function randomBase64Url(bytes = 32) { const value = new Uint8Array(bytes); crypto.getRandomValues(value); let binary = ""; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
  function shareEndpoint(manualId) { return workspacePath() + "/manuals/" + encodeURIComponent(manualId) + "/share-links"; }
  function shareExpiryInputValue(days) { const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
  function validPasscode(value) { const text = String(value || ""); return Array.from(text).length >= 12 && Array.from(text).length <= 128 && new TextEncoder().encode(text).byteLength <= 512 && !/[\\u0000-\\u001f\\u007f-\\u009f]/.test(text); }
  async function loadShareMetadata(manualId) { try { const result = await json(shareEndpoint(manualId)); return { state: result?.share || null, error: null }; } catch (error) { return { state: null, error }; } }
  function shareIsActive() { return Boolean(shareState && !shareState.revokedAt); }
  async function revokeShare(manualId) { if (!shareState?.shareLinkId) return; if (shareBusy) { setMessage("別の共有操作を処理中です。完了後にお試しください。", "warning"); return; } const serial = requestSerial; const linkId = shareState.shareLinkId; const request = { serial, manualId }; shareRequest = request; shareBusy = true; try { await json(shareEndpoint(manualId), { method: "DELETE", body: JSON.stringify({ shareLinkId: linkId }) }); if (serial !== requestSerial || detailData?.manual?.id !== manualId) return; shareState = null; shareToken = null; sharePending = null; setMessage("共有リンクを停止しました。必要なら新しいリンクを作成してください。", "success"); shareBusy = false; shareRequest = null; renderDetail(detailData); } catch (error) { if (serial === requestSerial) { if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) setMessage(error.message || "共有リンクを停止できません。", "error"); else setMessage("共有リンクを停止できたか確認できません。画面を閉じずに、共有設定の停止ボタンから同じリンクの停止を再試行してください。", "warning"); } } finally { if (shareRequest === request) { shareBusy = false; shareRequest = null; } } }
  function shareUrl() { return location.origin + (shareState?.viewerPath || "/s/") + "#token=" + encodeURIComponent(shareToken || ""); }
  async function issueShare(manualId, form) { if (shareBusy) { setMessage("別の共有操作を処理中です。完了後にお試しください。", "warning"); return; } if (shareIsActive()) return; if (activeCloudImageEditor || cloudImageBusy || pendingImageJobs.size) { setMessage("画像の編集・保存を完了してください。", "warning"); return; } if (dirty) { setMessage("未保存の変更があります。先に変更を保存してください。", "warning"); return; } const draftId = detailData?.draft?.id; const contentVersion = detailData?.draft?.contentVersion; const passcode = form.querySelector("[data-share-passcode]")?.value || ""; const expiry = form.querySelector("[data-share-expires]")?.value || ""; const confirmed = form.querySelector("[data-share-confirm]")?.checked === true; if (!validPasscode(passcode)) { setMessage("パスコードは12〜128文字、512バイト以内で入力してください。", "error"); return; } if (!confirmed) { setMessage("共有内容と期限を確認してから作成してください。", "error"); return; } const parsedExpiry = Date.parse(expiry); const expiresAt = Number.isFinite(parsedExpiry) ? new Date(parsedExpiry).toISOString() : ""; const max = Date.now() + 30 * 24 * 60 * 60 * 1000; if (!Number.isFinite(parsedExpiry) || parsedExpiry <= Date.now() || parsedExpiry > max) { setMessage("有効期限は現在から30日以内で指定してください。", "error"); return; } const serial = requestSerial; const request = { serial, manualId }; shareRequest = request; const pending = sharePending && sharePending.manualId === manualId && sharePending.draftId === draftId && sharePending.contentVersion === contentVersion ? sharePending : { manualId, draftId, contentVersion, body: { operationId: randomBase64Url(), token: randomBase64Url(), passcode, expiresAt, expectedDraftRevisionId: draftId, expectedContentVersion: contentVersion, confirmed: true } }; if (sharePending && pending === sharePending && (passcode !== pending.body.passcode || expiresAt !== pending.body.expiresAt || !confirmed)) { setMessage("前回の作成結果が不明です。前回と同じ内容で再試行してください。", "warning"); shareRequest = null; return; } sharePending = pending; let issued = false; shareBusy = true; try { const result = await json(shareEndpoint(manualId), { method: "POST", body: JSON.stringify(pending.body) }); if (serial !== requestSerial || detailData?.manual?.id !== manualId) return; shareToken = pending.body.token; shareState = { shareLinkId: result.shareLinkId, expiresAt: result.expiresAt, revokedAt: null, permission: result.permission, viewerPath: result.viewerPath || "/s/" }; sharePending = null; issued = true; setMessage("共有リンクを作成しました。作成時点の内容が共有されます。", "success"); } catch (error) { if (serial === requestSerial) { shareToken = null; if ([400, 403, 409].includes(error.status)) { sharePending = null; setMessage(error.message, "error"); } else setMessage("共有リンクの作成結果を確認できません。前回と同じ内容で再試行してください。", "warning"); } } finally { if (shareRequest === request) { shareBusy = false; shareRequest = null; if (issued) renderDetail(detailData); } } }
  function setMessage(text, kind = "") { const nearby = detail?.querySelector(".share-feedback"); if (nearby) { nearby.textContent = shareOpen ? text : ""; nearby.dataset.kind = kind; } message.textContent = text; message.className = ("cloud-message " + kind).trim(); }
  function make(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function workspacePath() { if (!workspaceId) throw new Error("ワークスペースを確認できません。"); return "/api/workspaces/" + encodeURIComponent(workspaceId); }
  async function json(url, init = {}) { const headers = { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) }; const response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store", headers }); let body = null; try { body = await response.json(); } catch {} if (!response.ok) { const error = new Error(body?.message || "手順書を確認できませんでした。"); error.status = response.status; error.code = body?.code; throw error; } return body; }
  function renderList() { list.replaceChildren(); const query=String(document.querySelector("#manual-search")?.value||"").trim().toLocaleLowerCase("ja");const visible=manuals.filter(manual=>String(manual.title||"").toLocaleLowerCase("ja").includes(query));if(!visible.length){list.append(make("p",query?"一致する手順書がありません。検索する言葉を変えてください。":"まだ手順書がありません。Chrome拡張で操作を記録して、保存するとここに並びます。","cloud-empty-library"));return;}for(const manual of visible){const button=make("button","","cloud-list-button");button.type="button";button.disabled=saveInFlight;button.setAttribute("aria-label",manual.title||"名称未設定");button.setAttribute("aria-current",selected?.id===manual.id?"true":"false");button.append(make("span","手順書","manual-list-kicker"),make("strong",manual.title||"名称未設定"));const when=Date.parse(manual.updatedAt);button.append(make("span",Number.isFinite(when)?"更新 "+new Intl.DateTimeFormat("ja-JP",{dateStyle:"medium"}).format(when):"クラウドに保存済み","manual-list-meta"));button.addEventListener("click",()=>{if(!saveInFlight)openManual(manual.id);});list.append(button);} }
  function imageUrlFor(step) {
    const candidate = step?.assetUrl;
    if (typeof candidate !== "string" || !candidate) return null;
    try {
      const url = new URL(candidate, location.origin);
      if (url.origin !== location.origin || url.username || url.password) return null;
      return url.href;
    } catch {
      return null;
    }
  }
  function appendCloudImageCard(parent, imageUrl, index, annotations = []) {
    const image = document.createElement("img"); image.className = "cloud-step-image"; image.alt = "手順 " + (index + 1) + "の画像";
    const card = make("div", "", "cloud-step-image-card");
    const status = make("p", "画像を読み込んでいます。", "cloud-image-status");
    const error = make("p", "画像を読み込めませんでした。", "cloud-image-error"); error.hidden = true;
    const retry = make("button", "画像をもう一度読み込む", "cloud-image-retry"); retry.type = "button"; retry.hidden = true;
    const expand = make("button", "画像を拡大して確認", "secondary cloud-image-expand"); expand.type="button";expand.hidden=true;
    const inspection=make("dialog","","cloud-image-inspection");inspection.setAttribute("aria-label","手順画像を拡大して確認");
    const inspectionHeading=make("h2","手順 "+(index+1)+"の画像");const inspectionTools=make("div","","cloud-inspection-tools");
    const fit=make("button","全体表示","secondary"),actual=make("button","原寸表示","secondary"),close=make("button","閉じる","secondary");
    for(const control of [fit,actual,close])control.type="button";
    const stage=make("div","","cloud-inspection-stage");stage.tabIndex=0;stage.setAttribute("aria-label","拡大画像。矢印キーでスクロールできます");const preview=make("img");preview.alt=image.alt;stage.append(preview);
    const setFit=value=>{stage.dataset.fit=String(value);fit.setAttribute("aria-pressed",String(value));actual.setAttribute("aria-pressed",String(!value));stage.scrollTop=0;stage.scrollLeft=0;};
    fit.addEventListener("click",()=>setFit(true));actual.addEventListener("click",()=>setFit(false));close.addEventListener("click",()=>inspection.close());
    inspection.addEventListener("close",()=>{preview.removeAttribute("src");if(expand.isConnected)expand.focus({preventScroll:true});});
    inspectionTools.append(fit,actual,close);inspection.append(inspectionHeading,inspectionTools,stage);
    expand.addEventListener("click",()=>{if(image.hidden||!image.complete||!image.naturalWidth)return;preview.src=image.currentSrc;setFit(true);inspection.showModal();close.focus();});
    const sourceUrl = imageUrl;
    let composited = false;
    const loadImage = () => {
      composited = false; image.hidden = true; expand.hidden=true; status.hidden = false; error.hidden = true; retry.hidden = true;
      image.src = sourceUrl + (sourceUrl.includes("?") ? "&" : "?") + "retry=" + Date.now();
    };
    image.loading = "eager"; image.hidden = true;
    image.addEventListener("load", () => {
      if (!composited && annotations.length) {
        try { const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;imageTools().drawScreenshot(canvas.getContext("2d"),image,{annotations,masks:[]});composited=true;image.src=canvas.toDataURL("image/png");return; }
        catch { status.hidden=true;error.hidden=false;retry.hidden=false;image.hidden=true;return; }
      }
      status.hidden = true; error.hidden = true; retry.hidden = true; image.hidden = false; expand.hidden=false;
    });
    image.addEventListener("error", () => { status.hidden = true; error.hidden = false; retry.hidden = false; image.hidden = true; });
    retry.addEventListener("click", loadImage);
    card.append(status, error, retry, image, expand, inspection); parent.append(card);
    image.src = imageUrl;
  }
  function markChanged() { dirty = true; editVersion += 1; if (saveState) { saveState.textContent = "クラウドに未保存"; saveState.dataset.state = "dirty"; } }
  function codePointLength(value) { return Array.from(String(value || "")).length; }
  function syncManualListTitle(manualId, title) {
    const manual = manuals.find((item) => item.id === manualId);
    if (!manual) return;
    manual.title = title;
    if (selected?.id === manualId) selected.title = title;
    renderList();
  }
  function validateSnapshot(snapshot) {
    const fields = [[String(snapshot.title || "").trim(), 64, "タイトル"], [snapshot.description, 10000, "説明"]];
    for (const step of snapshot.steps) {
      const stepTitle = String(step.title || "").trim();
      if (codePointLength(stepTitle) < 1) return "手順の見出しは1〜128文字で入力してください。";
      fields.push([stepTitle, 128, "手順の見出し"], [step.instruction, 4000, "手順文"]);
    }
    if (codePointLength(String(snapshot.title || "").trim()) < 1) return "タイトルは1〜64文字で入力してください。";
    const invalid = fields.find(([value, max]) => codePointLength(value) > max);
    if (invalid) return invalid[2] + "は" + invalid[1].toLocaleString("ja-JP") + "文字以内で入力してください。";
    if (snapshot.steps.length > 200) return "手順は200件以内で入力してください。";
    return "";
  }
  function clearProtectedEditor() { manuals = []; selected = null; detailData = null; editorState = null; dirty = false; saveState = null; shareState = null; shareToken = null; shareMetaError = null; sharePending = null; renderList(); renderDetail(null); }
  function renderSharePanel(data, canEdit) {
    const panel = make("section", "", "share-panel");
    const busy = shareBusy && shareRequest?.manualId === data.manual.id;
    const heading = make("h3", "共有設定"); heading.id = "share-heading"; panel.append(heading);
    panel.setAttribute("aria-labelledby", "share-heading");
    if (shareMetaError) { panel.append(make("p", "共有設定を読み込めません。時間をおいて再読み込みしてください。", "cloud-note")); return panel; }
    const expired = shareIsActive() && Number.isFinite(Date.parse(shareState.expiresAt)) && Date.parse(shareState.expiresAt) <= Date.now();
    if (shareIsActive() && shareToken) {
      if (expired) { panel.append(make("p", "リンクの期限が切れています。新しく作成するには、先に共有を停止してください。", "cloud-note")); const stop = make("button", "共有を停止", "secondary danger"); stop.type = "button"; stop.disabled = !canEdit || busy; stop.addEventListener("click", () => { if (window.confirm("現在の共有リンクを停止しますか？")) revokeShare(data.manual.id); }); panel.append(stop); return panel; }
      const note = make("p", "共有リンクは作成時点の内容を表示します。リンクはこの画面を再読み込みすると復元できません。", "cloud-note");
      const link = document.createElement("input"); link.className = "share-link-value"; link.value = shareUrl(); link.readOnly = true; link.setAttribute("aria-label", "共有リンク");
      const copy = make("button", "リンクをコピー", "secondary"); copy.type = "button"; copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(link.value); setMessage("共有リンクをコピーしました。", "success"); } catch { link.select(); setMessage("リンクを選択しました。コピーしてください。", "warning"); } });
      const stop = make("button", "共有を停止", "secondary danger"); stop.type = "button"; stop.disabled = !canEdit || busy; stop.addEventListener("click", () => { if (window.confirm("この共有リンクを停止しますか？")) revokeShare(data.manual.id); });
      const row = make("div", "", "share-link"); row.append(link, copy, stop); panel.append(note, row); return panel;
    }
    if (shareIsActive() && !shareToken) {
      panel.append(make("p", expired ? "リンクの期限が切れています。新しく作成するには、先に共有を停止してください。" : "共有リンクを再表示できません。新しく作成するには、先に現在の共有を停止してください。", "cloud-note"));
      const stop = make("button", "共有を停止", "secondary danger"); stop.type = "button"; stop.disabled = !canEdit || busy; stop.addEventListener("click", () => { if (window.confirm("現在の共有リンクを停止しますか？")) revokeShare(data.manual.id); }); panel.append(stop); return panel;
    }
    const form = document.createElement("form"); form.className = "share-form"; form.noValidate = true;
    const passLabel = make("label", "パスコード（必須・12〜128文字）"); const pass = document.createElement("input"); pass.type = "password"; pass.setAttribute("aria-label","パスコード（12〜128文字）"); pass.required = true; pass.minLength = 12; pass.autocomplete = "new-password"; pass.dataset.codePointMax = "128"; pass.disabled = !canEdit || busy; pass.dataset.sharePasscode = "true"; passLabel.append(pass);
    const expiryLabel = make("label", "有効期限（最大30日・" + Intl.DateTimeFormat().resolvedOptions().timeZone + "）"); const expiry = document.createElement("input"); expiry.type = "datetime-local"; expiry.required = true; expiry.value = shareExpiryInputValue(7); expiry.min = shareExpiryInputValue(0); expiry.max = shareExpiryInputValue(30); expiry.disabled = !canEdit || busy; expiry.dataset.shareExpires = "true"; expiryLabel.append(expiry);const expiryText=make("span","","expiry-preview");expiryText.setAttribute("aria-live","polite");const showExpiry=()=>{const value=new Date(expiry.value);expiryText.textContent=Number.isNaN(value.getTime())?"日時を入力してください":new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit",timeZoneName:"short"}).format(value)+"まで";};expiry.addEventListener("input",showExpiry);showExpiry();expiryLabel.append(expiryText);
    const confirmLabel = make("label", ""); const confirm = document.createElement("input"); confirm.type = "checkbox"; confirm.required = true; confirm.disabled = !canEdit || busy; confirm.dataset.shareConfirm = "true"; confirmLabel.append(confirm, document.createTextNode("共有する内容と有効期限を確認しました"));
    const issue = make("button", "共有リンクを作成", "primary"); issue.type = "submit"; issue.disabled = !canEdit || busy; form.append(passLabel, expiryLabel, confirmLabel, issue); form.addEventListener("submit", (event) => { event.preventDefault(); issueShare(data.manual.id, form); }); panel.append(make("p", "「共有リンクを作成」を押すと共有されます。未保存の変更は共有しません。", "cloud-note"), form); return panel;
  }
  let activeCloudImageEditor = null;
  const pendingImageJobs = new Map();
  let cloudImageBusy = false;
  ${MANUAL_BRANDING_JS}
  ${MANUAL_PRINT_JS}
  function imageTools() { if (!globalThis.MecchaImageTools) throw new Error("画像編集を準備できませんでした。再読み込みしてください。"); return globalThis.MecchaImageTools; }
  async function encodeBaseImage(dataUrl, masks, annotations = []) {
    const image = new Image(); image.src = dataUrl; await image.decode();
    imageTools().assertImageDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas"); canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    imageTools().drawScreenshot(canvas.getContext("2d"), image, {annotations,masks:masks||[]});
    const blob = await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("画像を保存できませんでした。")),"image/png"));
    if(blob.size>10*1024*1024)throw new Error("画像は10MB以下にしてください。切り抜きで小さくできます。");
    return blob;
  }
  async function uploadEditedBase(step, blob) {
    const bytes = await blob.arrayBuffer();
    const checksum=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),value=>value.toString(16).padStart(2,"0")).join("");
    const key=stepKey(step);let job=pendingImageJobs.get(key);
    if(job && job.checksum!==checksum)throw new Error("前の画像の保存結果を確認できません。同じ画像でもう一度適用してください。");
    if(!job) { job={operationId:randomBase64Url(),checksum,bytes,revisionId:detailData.draft.id,updatedAt:detailData.draft.updatedAt};pendingImageJobs.set(key,job); }
    const endpoint=workspacePath()+"/manuals/"+encodeURIComponent(detailData.manual.id)+"/draft/assets/"+job.operationId;
    const result=await json(endpoint,{method:"PUT",headers:{"Content-Type":"image/png","x-draft-revision-id":job.revisionId,"x-draft-updated-at":job.updatedAt,"x-asset-sha256":job.checksum,"x-asset-byte-length":String(job.bytes.byteLength)},body:job.bytes});
    pendingImageJobs.delete(key);return result;
  }
  async function openCloudImageEditor(step, workspace, center, tools, rerender, options={}) {
    if(activeCloudImageEditor||cloudImageBusy||saveInFlight)return;
    cloudImageBusy=true;setMessage("画像を準備しています…");
    const key=stepKey(step),manualId=detailData.manual.id,originalAssetId=step.assetId,returnFocus=document.activeElement;
    try {
      let dataUrl=options.dataUrl;
      if(!dataUrl) {
        const source=imageUrlFor(step);if(!source)throw new Error("画像を追加してください。");
        const response=await fetch(source,{credentials:"same-origin",cache:"no-store"});if(!response.ok)throw new Error("保存済みの画像を読み込めませんでした。");
        const file=new File([await response.blob()],"image",{type:response.headers.get("content-type")?.split(";")[0]||"image/png"});
        dataUrl=(await imageTools().normalizeUploadedImage(file)).dataUrl;
      }
      if(detailData?.manual?.id!==manualId||!editorState.steps.some(value=>stepKey(value)===key))return;
      const holder=document.createElement("div");holder.innerHTML=SHARED_IMAGE_EDITOR_HTML;const dialog=holder.firstElementChild;
      workspace.append(dialog);center.hidden=true;tools.hidden=true;
      const outputActions=[...detail.querySelectorAll("[data-manual-save],.manual-share,.manual-mobile-actions .primary")].map(action=>({action,disabled:action.disabled,title:action.title}));
      for(const {action} of outputActions){action.disabled=true;action.title="画像の変更を適用してから保存・共有できます";}
      const close=()=>{activeCloudImageEditor?.dispose();activeCloudImageEditor=null;dialog.remove();for(const {action,disabled,title} of outputActions){if(action.isConnected){action.disabled=disabled;action.title=title;}}center.hidden=false;tools.hidden=false;cloudImageBusy=false;rerender();if(returnFocus?.isConnected)returnFocus.focus();else if(innerWidth<=760)document.querySelector(".manual-mobile-actions button:nth-child(2)")?.focus();else if(innerWidth<=1100)document.querySelector(".manual-tools-toggle")?.focus();else tools.querySelector(".cloud-image-tools button")?.focus();};
      const screenshot={dataUrl,annotations:options.replace?[]:clone(step.annotations||[]),masks:[]};
      if(options.replace){dialog.querySelector("[data-editor-save]").textContent="内容を確認して、この画像を適用";dialog.querySelector(".editor-help").textContent="公開できない情報があれば黒塗りしてから適用してください。自動置換は行いません。";}
      activeCloudImageEditor=imageTools().createImageEditor({dialog,canvas:dialog.querySelector("canvas"),screenshot,inline:true,initialTool:options.tool||"select",onClose:close,onCancel:()=>{pendingImageJobs.delete(key);setMessage("画像の変更を取り消しました。元の手順書は変更していません。");},onSave:async(next)=>{
        const current=editorState.steps.find(value=>stepKey(value)===key);
        if(detailData?.manual?.id!==manualId||!current||current.assetId!==originalAssetId)return false;
        try {
          const layers=imageTools().cloudImageLayers(next);
          const base=await encodeBaseImage(next.dataUrl||screenshot.dataUrl,layers.masks,layers.baseAnnotations);
          const uploaded=await uploadEditedBase(current,base);
          if(detailData?.manual?.id!==manualId||!editorState.steps.some(value=>stepKey(value)===key))return false;
          checkpointEditor();current.assetId=uploaded.assetId;current.assetUrl=uploaded.assetUrl;current.annotations=clone(layers.annotations);markChanged();setMessage("画像の変更を適用しました。クラウドへ保存すると手順書に反映されます。","success");return true;
        }catch(error){setMessage(error.message||"画像を保存できませんでした。元の画像と編集中の内容を保持しています。","error");return false;}
      }});
      const opened=await activeCloudImageEditor.open();if(opened)setMessage("画像の変更を「変更を適用」で確定してから、手順書を保存します。");else setMessage("画像を表示できません。画像欄から再読み込みできます。","error");
    } catch(error) {cloudImageBusy=false;setMessage(error.message||"画像を準備できませんでした。","error");}
    finally {if(!activeCloudImageEditor)cloudImageBusy=false;}
  }
  function stepKey(step) { return step.id || step.clientKey; }
  function checkpointEditor() { undoStack.push({ state: clone(editorState), selectedStepKey }); if (undoStack.length > 40) undoStack.shift(); redoStack = []; }
  function restoreEditorHistory(from, to) {
    if (!from.length || saveInFlight || activeCloudImageEditor || cloudImageBusy || !editorState) return;
    to.push({ state: clone(editorState), selectedStepKey });
    const snapshot = from.pop(); editorState = snapshot.state; selectedStepKey = snapshot.selectedStepKey;
    markChanged(); renderDetail(detailData);
  }
  function renderDetail(data) {
    reloadButton = null; saveState = null;
    detail.replaceChildren(); root.querySelector(".manual-library").hidden = Boolean(data && editorState); root.classList.toggle("is-editing", Boolean(data && editorState));
    if (!data || !editorState) { detail.append(make("p", "一覧から手順書を選んでください。", "cloud-note")); return; }
    applyManualBranding(data);
    const canEdit = data.permissions?.canEdit !== false;
    const form = make("section", "", "manual-editor");
    const toolbar = make("header", "", "manual-toolbar");
    const back = make("button", "手順書一覧", "secondary manual-back"); back.type = "button"; back.setAttribute("aria-label", "手順書一覧");
    back.addEventListener("click", () => { const panel = root.querySelector(".manual-library"); panel.hidden = !panel.hidden; back.setAttribute("aria-expanded", String(!panel.hidden)); if (!panel.hidden) panel.querySelector("button")?.focus(); });
    back.setAttribute("aria-expanded", "false");
    const title = document.createElement("input"); title.className = "manual-title"; title.dataset.codePointMax = "64"; title.value = editorState.title; title.disabled = !canEdit; title.setAttribute("aria-label", "タイトル");
    title.addEventListener("focus", () => { title.__before = title.value; });
    title.addEventListener("input", () => { if (title.__before !== undefined) { const current = editorState.title; editorState.title = title.__before; checkpointEditor(); editorState.title = current; title.__before = undefined; } editorState.title = title.value; markChanged(); });
    saveState = make("span", dirty ? "クラウドに未保存" : "クラウドに保存済み", "cloud-save-state"); saveState.dataset.state = dirty ? "dirty" : "saved"; saveState.setAttribute("role", "status"); saveState.setAttribute("aria-live", "polite");
    const save = make("button", "変更を保存", "primary"); save.type = "button"; save.dataset.manualSave="true"; save.addEventListener("click",()=>saveManual(data.manual.id,save)); save.disabled = !canEdit || saveInFlight;
    const share = make("button", "共有", "secondary manual-share"); share.type = "button"; share.setAttribute("aria-expanded", String(shareOpen));
    toolbar.append(back, title, saveState, save, share);
    const brandLogo=safeBrandLogoUrl(data.branding?.logoUrl);if(brandLogo){const logo=make("img","","manual-team-logo");logo.src=brandLogo;logo.alt="チームのロゴ";logo.addEventListener("error",()=>logo.remove());toolbar.insertBefore(logo,title);}
    const descriptionDetails = make("details", "", "manual-description"); const descriptionSummary = make("summary", "手順書の説明");
    const description = document.createElement("textarea"); description.dataset.codePointMax = "10000"; description.value = editorState.description; description.disabled = !canEdit; description.setAttribute("aria-label", "説明");
    description.addEventListener("focus", () => { description.__before = description.value; });
    description.addEventListener("input", () => { if (description.__before !== undefined) { const current = editorState.description; editorState.description = description.__before; checkpointEditor(); editorState.description = current; description.__before = undefined; } editorState.description = description.value; markChanged(); });
    descriptionDetails.append(descriptionSummary, description);
    const workspace = make("div", "", "manual-workspace");
    const backdrop=make("button","","manual-panel-backdrop");backdrop.type="button";backdrop.hidden=true;backdrop.setAttribute("aria-label","パネルを閉じる");let panelTrigger=null;
    const closePanels=()=>{for(const panel of [nav,tools])delete panel.dataset.panelOpen;backdrop.hidden=true;panelTrigger?.focus();panelTrigger=null;};
    const openPanel=(panel,trigger)=>{closePanels();panelTrigger=trigger;panel.dataset.panelOpen="true";backdrop.hidden=false;panel.querySelector(".manual-panel-close")?.focus();if(panel===nav)revealSelectedStep();};
    backdrop.addEventListener("click",closePanels);
    const nav = make("nav", "", "manual-step-nav"); nav.setAttribute("aria-label", "手順一覧");
    const navHeading = make("h2", "手順"); const navList = make("ol"); const canvas = make("section", "", "manual-step-center"); canvas.setAttribute("aria-label", "選択中の手順");
    const tools = make("aside", "", "manual-context-tools"); tools.setAttribute("aria-label", "手順の操作");
    const undo = make("button", "取り消す", "secondary"); undo.type = "button"; undo.disabled = !canEdit || !undoStack.length || saveInFlight; undo.addEventListener("click", () => restoreEditorHistory(undoStack, redoStack));
    const redo = make("button", "やり直す", "secondary"); redo.type = "button"; redo.disabled = !canEdit || !redoStack.length || saveInFlight; redo.addEventListener("click", () => restoreEditorHistory(redoStack, undoStack));
    const reload = make("button", "最新の内容を読み込む", "secondary"); reloadButton = reload; reload.type = "button"; reload.disabled = saveInFlight; reload.addEventListener("click", () => { if (!dirty || window.confirm("編集中の変更を破棄して最新の内容を読み込みますか？")) openManual(selected.id, { force: true }); });
    const imageButtons = make("div", "", "cloud-image-tools");
    const branding=make("button","チームの見た目","secondary");branding.type="button";branding.addEventListener("click",()=>{closePanels();openBrandingSettings(branding);});
    const print=make("button","PDF・印刷プレビュー","secondary");print.type="button";print.addEventListener("click",()=>{closePanels();openPrintPreview(print);});
    tools.append(make("h2", "画像を調整"), imageButtons, make("h2", "編集履歴"), undo, redo, reload, make("h2","手順書の設定"),branding,print);
    const add = make("button", "手順を追加", "secondary"); add.dataset.stepAdd = "true"; add.type = "button";
    function revealSelectedStep() {
      const current=navList.querySelector('[aria-current="step"]'); if(!current||!navList.clientHeight)return;
      const row=current.getBoundingClientRect(),viewport=navList.getBoundingClientRect();
      if(row.top<viewport.top+8)navList.scrollTop+=row.top-viewport.top-8;
      else if(row.bottom>viewport.bottom-8)navList.scrollTop+=row.bottom-viewport.bottom+8;
    }
    function renderSteps(focus = false) {
      navList.replaceChildren(); canvas.replaceChildren(); imageButtons.replaceChildren();
      if (!editorState.steps.some((step) => stepKey(step) === selectedStepKey)) selectedStepKey = stepKey(editorState.steps[0] || {});
      navHeading.textContent = "手順 " + editorState.steps.length;
      add.disabled = !canEdit || editorState.steps.length >= 200; add.textContent = editorState.steps.length >= 200 ? "手順は200件まで" : "手順を追加";
      editorState.steps.forEach((step, index) => {
        const key = stepKey(step); const selectedStep = key === selectedStepKey;
        const li = make("li"); const choose = make("button", (index + 1) + "  " + (step.title || "新しい手順")); choose.type = "button"; choose.dataset.stepKey = key; choose.setAttribute("aria-current", selectedStep ? "step" : "false");
        choose.addEventListener("click", () => { if(activeCloudImageEditor||cloudImageBusy){setMessage("画像の変更を適用するか、閉じてから手順を移動してください。","warning");return;} selectedStepKey = key; closePanels(); renderSteps(); });
        choose.addEventListener("keydown", (event) => {
          if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
          const target = index + (event.key === "ArrowUp" ? -1 : 1); if (target < 0 || target >= editorState.steps.length) return;
          event.preventDefault(); if(activeCloudImageEditor||cloudImageBusy)return; if (event.altKey && canEdit) { checkpointEditor(); [editorState.steps[index], editorState.steps[target]] = [editorState.steps[target], editorState.steps[index]]; markChanged(); } else selectedStepKey = stepKey(editorState.steps[target]);
          renderSteps(); [...navList.querySelectorAll("button")].find((button) => button.dataset.stepKey === selectedStepKey)?.focus();
        });
        li.append(choose); navList.append(li);
        if (!selectedStep) return;
        for(const [label,tool] of [["矢印・文字を追加","select"],["切り抜き","crop"]]){const edit=make("button",label,"secondary");edit.type="button";edit.disabled=!canEdit||!imageUrlFor(step);edit.addEventListener("click",()=>{closePanels();openCloudImageEditor(step,workspace,canvas,tools,renderSteps,{tool});});imageButtons.append(edit);}
        const replace=make("button",imageUrlFor(step)?"画像を差し替える":"画像を追加する","secondary");replace.type="button";replace.disabled=!canEdit;
        const file=document.createElement("input");file.type="file";file.accept="image/png,image/jpeg,image/webp";file.hidden=true;
        replace.addEventListener("click",()=>{if(!activeCloudImageEditor&&!cloudImageBusy)file.click();});
        file.addEventListener("change",async()=>{const selectedFile=file.files?.[0];if(!selectedFile)return;cloudImageBusy=true;replace.disabled=true;setMessage("画像を確認しています…");try{const normalized=await imageTools().normalizeUploadedImage(selectedFile);cloudImageBusy=false;closePanels();await openCloudImageEditor(step,workspace,canvas,tools,renderSteps,{dataUrl:normalized.dataUrl,replace:true});}catch(error){cloudImageBusy=false;setMessage(error.message||"画像を読み込めませんでした。","error");}finally{replace.disabled=!canEdit;file.value="";}});imageButtons.append(replace,file);
        const item = make("article", "", "cloud-step"); item.dataset.stepKey = key;
        const stepHeader = make("div", "", "manual-step-heading"); stepHeader.append(make("span", "現在の位置 " + (index + 1) + " / " + editorState.steps.length));
        const stepTitle = document.createElement("input"); stepTitle.dataset.codePointMax = "128"; stepTitle.value = step.title || ""; stepTitle.disabled = !canEdit; stepTitle.setAttribute("aria-label", "手順 " + (index + 1) + "のタイトル"); stepHeader.append(stepTitle); item.append(stepHeader);
        const imageUrl = imageUrlFor(step); if (imageUrl) appendCloudImageCard(item, imageUrl, index, step.annotations || []); else item.append(make("p", "説明のみの手順", "cloud-image-empty"));
        const instructionLabel = make("label", "操作の説明"); const instruction = document.createElement("textarea"); instruction.dataset.codePointMax = "4000"; instruction.value = step.instruction || ""; instruction.disabled = !canEdit; instruction.setAttribute("aria-label", "手順 " + (index + 1) + "の説明"); instructionLabel.append(instruction);
        for (const [field, property] of [[stepTitle, "title"], [instruction, "instruction"]]) {
          field.addEventListener("focus", () => { field.__before = field.value; });
          field.addEventListener("input", () => { if (field.__before !== undefined) { const current = step[property]; step[property] = field.__before; checkpointEditor(); step[property] = current; field.__before = undefined; } step[property] = field.value; if (property === "title") choose.textContent = (index + 1) + "  " + field.value; markChanged(); });
        }
        const actions = make("div", "", "cloud-step-actions");
        for (const [label, offset] of [["上へ", -1], ["下へ", 1]]) { const button = make("button", label, "secondary"); button.type = "button"; button.disabled = !canEdit || index + offset < 0 || index + offset >= editorState.steps.length; button.addEventListener("click", () => { checkpointEditor(); [editorState.steps[index], editorState.steps[index + offset]] = [editorState.steps[index + offset], editorState.steps[index]]; markChanged(); renderSteps(); }); actions.append(button); }
        const remove = make("button", "この手順を削除", "secondary danger"); remove.type = "button"; remove.disabled = !canEdit;
        remove.addEventListener("click", () => { checkpointEditor(); editorState.steps.splice(index, 1); selectedStepKey = stepKey(editorState.steps[Math.min(index, editorState.steps.length - 1)] || {}); markChanged(); renderSteps(true); }); actions.append(remove);
        item.append(instructionLabel, actions); canvas.append(item); if (focus) instruction.focus();
      });
      if (!editorState.steps.length) canvas.append(make("p", "手順を追加して、説明を書き始めましょう。", "cloud-image-empty"));
      undo.disabled = !canEdit || !undoStack.length || saveInFlight; redo.disabled = !canEdit || !redoStack.length || saveInFlight;
      revealSelectedStep();
    }
    add.addEventListener("click", () => { if (editorState.steps.length >= 200) return; checkpointEditor(); const index = editorState.steps.findIndex((step) => stepKey(step) === selectedStepKey); const step = { type: "action", title: "新しい手順", instruction: "", actionType: null, targetText: null, url: null, clientKey: "local-" + crypto.randomUUID() }; editorState.steps.splice(index + 1, 0, step); selectedStepKey = stepKey(step); markChanged(); renderSteps(true); });
    const closeNav=make("button","閉じる","secondary manual-panel-close");closeNav.type="button";closeNav.addEventListener("click",closePanels);
    const closeTools=make("button","閉じる","secondary manual-panel-close");closeTools.type="button";closeTools.addEventListener("click",closePanels);tools.prepend(closeTools);
    const toolsToggle=make("button","画像・編集","secondary manual-tools-toggle");toolsToggle.type="button";toolsToggle.addEventListener("click",()=>openPanel(tools,toolsToggle));toolbar.insertBefore(toolsToggle,save);
    const mobileActions=make("div","","manual-mobile-actions");const mobileSteps=make("button","手順","secondary"),mobileTools=make("button","編集","secondary"),mobileShare=make("button","共有","primary");
    for(const control of [mobileSteps,mobileTools,mobileShare])control.type="button";
    mobileSteps.addEventListener("click",()=>openPanel(nav,mobileSteps));mobileTools.addEventListener("click",()=>openPanel(tools,mobileTools));
    let shareReturnFocus=share;mobileShare.addEventListener("click",()=>{closePanels();shareReturnFocus=mobileShare;share.click();});mobileActions.append(mobileSteps,mobileTools,mobileShare);
    nav.append(navHeading, closeNav, add, navList); workspace.append(nav, canvas, tools); form.append(toolbar, descriptionDetails, workspace, mobileActions, backdrop);
    form.addEventListener("keydown",event=>{if(event.key==="Escape"&&!backdrop.hidden){event.preventDefault();closePanels();}});
    form.addEventListener("submit", (event) => { event.preventDefault(); saveManual(data.manual.id, save); });
    form.addEventListener("keydown", (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.target.matches("input,textarea,[contenteditable=true]")) { event.preventDefault(); restoreEditorHistory(event.shiftKey ? redoStack : undoStack, event.shiftKey ? undoStack : redoStack); } });
    const panel = renderSharePanel(data, canEdit); panel.classList.add("manual-share-drawer"); panel.hidden = !shareOpen; panel.setAttribute("role", "region");
    const closeShare = make("button", "閉じる", "secondary"); closeShare.type = "button"; closeShare.addEventListener("click", () => { shareOpen = false; panel.hidden = true; panel.querySelector(".share-feedback").textContent = ""; share.setAttribute("aria-expanded", "false"); shareReturnFocus?.focus(); }); panel.prepend(closeShare);
    panel.insertBefore(make("p", editorState.title + " · " + editorState.steps.length + "手順 · 画像" + editorState.steps.filter((step) => imageUrlFor(step)).length + "枚", "cloud-note"), closeShare.nextSibling);
    const panelMessage = make("p", shareToken && shareIsActive() ? "共有リンクを作成しました。" : dirty ? "未保存の変更があります。保存してから共有できます。" : "画像・説明・期限を確認してからリンクを作成してください。", "share-feedback"); panelMessage.dataset.kind=shareToken&&shareIsActive()?"success":dirty?"warning":"";panelMessage.setAttribute("role", "status"); panelMessage.setAttribute("aria-live", "polite"); panel.append(panelMessage);
    share.addEventListener("click", (event) => { closePanels(); if(event.isTrusted)shareReturnFocus=share; shareOpen = !shareOpen; panel.hidden = !shareOpen; share.setAttribute("aria-expanded", String(shareOpen)); if (shareOpen) closeShare.focus(); });
    panel.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); closeShare.click(); } });
    detail.append(form, panel); renderSteps();
  }
  function stepForSave(step) { const output = { ...(step.id ? { id: step.id } : {}), type: step.type || "action", title: String(step.title || "").trim(), instruction: String(step.instruction || ""), actionType: step.actionType ?? null, targetText: step.targetText ?? null, url: step.url ?? null, annotations: clone(step.annotations || []) }; if (step.assetId) output.assetId = step.assetId; return output; }
  function mergeServerStepIds(snapshot, latest) {
    if (!Array.isArray(latest?.steps) || !editorState) return;
    const localByKey = new Map(editorState.steps.filter((step) => step.clientKey).map((step) => [step.clientKey, step]));
    snapshot.steps.forEach((step, index) => {
      const local = step.clientKey ? localByKey.get(step.clientKey) : null;
      const server = latest.steps[index];
      if (local && !local.id && server?.id) local.id = server.id;
    });
  }
  function savedSnapshotMatches(snapshot, latest) {
    if (String(snapshot.title || "").trim() !== latest?.draft?.title || snapshot.description !== latest?.draft?.description || !Array.isArray(latest?.steps) || snapshot.steps.length !== latest.steps.length) return false;
    return snapshot.steps.every((step, index) => {
      const server = latest.steps[index];
      return server && (!step.id || step.id === server.id) && (step.type || "action") === server.type && String(step.title || "").trim() === server.title && String(step.instruction || "") === server.instruction && (step.actionType ?? null) === (server.actionType ?? null) && (step.targetText ?? null) === (server.targetText ?? null) && (step.url ?? null) === (server.url ?? null) && (step.assetId ?? null) === (server.assetId ?? null) && JSON.stringify(step.annotations || [], ["id","type","x","y","width","height","x1","y1","x2","y2","color","strokeWidth","text","fontSize"]) === JSON.stringify(server.annotations || [], ["id","type","x","y","width","height","x1","y1","x2","y2","color","strokeWidth","text","fontSize"]);
    });
  }
  async function reconcileSavedDraft(manualId, snapshot) {
    try {
      const latest = await json(workspacePath() + "/manuals/" + encodeURIComponent(manualId));
      if (latest?.draft?.updatedAt && savedSnapshotMatches(snapshot, latest)) {
        if (detailData?.manual?.id === manualId) detailData = latest;
        mergeServerStepIds(snapshot, latest);
        syncManualListTitle(manualId, latest.draft.title);
        return true;
      }
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        clearProtectedEditor();
        return "auth-lost";
      }
    }
    return false;
  }
  async function saveManual(manualId, saveButton) {
    if (!editorState || saveInFlight) return;
    if (activeCloudImageEditor || cloudImageBusy || pendingImageJobs.size) { setMessage("画像の編集・保存を完了してから手順書を保存してください。", "warning"); return; }
    const snapshot = clone(editorState);
    const validationMessage = validateSnapshot(snapshot);
    if (validationMessage) { setMessage(validationMessage, "error"); return; }
    const version = editVersion;
    saveInFlight = true;
    renderList();
    if (reloadButton) reloadButton.disabled = true;
    if (saveButton) saveButton.disabled = true;
    const expectedUpdatedAt = detailData?.draft?.updatedAt;
    setMessage("変更を保存しています…");
    try {
      const result = await json(workspacePath() + "/manuals/" + encodeURIComponent(manualId) + "/draft", {
        method: "PATCH",
        body: JSON.stringify({
          title: String(snapshot.title || "").trim(),
          description: snapshot.description,
          steps: snapshot.steps.map(stepForSave),
          expectedUpdatedAt
        })
      });
      if (result?.updatedAt && detailData?.manual?.id === manualId && detailData?.draft) detailData.draft.updatedAt = result.updatedAt;
      if (version === editVersion) {
        dirty = false;
        setMessage("変更を保存しました。", "success");
        const refreshed = await openManual(manualId, { force: true, expectedUpdatedAt: result?.updatedAt, expectedSnapshot: snapshot });
        if (refreshed === false) {
          dirty = true;
          setMessage("保存結果と最新内容を確認できませんでした。入力内容を保持しています。", "warning");
        } else if (refreshed === true) {
          syncManualListTitle(manualId, snapshot.title.trim());
        }
      } else {
        const reconciled = await reconcileSavedDraft(manualId, snapshot);
        if (reconciled === "auth-lost") return;
        setMessage("保存中に入力が変更されました。変更は画面に保持されています。", "warning");
      }
    } catch (error) {
      if (!error.status) {
        const reconciled = await reconcileSavedDraft(manualId, snapshot);
        if (reconciled === "auth-lost") return;
        setMessage(reconciled ? "保存結果を確認しました。入力内容を保持しています。" : "保存結果を確認できませんでした。入力内容を保持したまま、一覧で状態を確認してください。", "warning");
      } else if (error.status === 401 || error.status === 403) {
        clearProtectedEditor();
        setMessage("認証または権限を確認できません。画面を更新してください。", "error");
      } else {
        setMessage(error.status === 409 ? "別の編集結果があります。入力内容を保持したまま、最新の内容を確認してください。" : error.message, "error");
      }
    } finally {
      saveInFlight = false;
      renderList();
      if (reloadButton) reloadButton.disabled = false;
      const currentSaveButton = detail.querySelector("[data-manual-save]");
      if (currentSaveButton) currentSaveButton.disabled = false;
      if (saveButton) saveButton.disabled = false;
    }
  }
  async function loadManuals(openId = "", options = {}) {
    const serial = ++requestSerial;
    setMessage("保存した手順書を読み込んでいます…");
    list.setAttribute("aria-busy","true");
    if(!manuals.length){list.replaceChildren(make("p","手順書を読み込んでいます…","cloud-loading-library"));}
    try {
      const payload = await json(workspacePath() + "/manuals");
      if (serial !== requestSerial) return;
      list.removeAttribute("aria-busy");
      manuals = Array.isArray(payload.manuals) ? payload.manuals : [];
      selected = openId ? manuals.find((item) => item.id === openId) || selected : selected && manuals.find((item) => item.id === selected.id) || null;
      renderList();
      if (selected && !options.preserveDetail) await openManual(selected.id, options);
      else if (!selected) { renderDetail(null); setMessage("続きから編集する手順書を選択してください。"); }
    } catch (error) {
      if (serial !== requestSerial) return;
      if (error.status === 401 || error.status === 403) clearProtectedEditor();
      list.removeAttribute("aria-busy");
      renderList();
      if(!manuals.length){
        const recovery=make("section","","cloud-empty-library");
        recovery.append(make("h3","手順書を読み込めませんでした"),make("p","保存済みの手順書は変更していません。接続を確認して、もう一度お試しください。"));
        const retry=make("button","もう一度読み込む","primary");retry.type="button";retry.addEventListener("click",()=>loadManuals(openId,options));recovery.append(retry);list.replaceChildren(recovery);
      }
      setMessage(error.status === 401 || error.status === 403 ? "認証または権限を確認できません。画面を更新してください。" : error.message, "error");
    }
  }
  async function openManual(id, options = {}) {
    if (saveInFlight && !options.force) return;
    if(activeCloudImageEditor||cloudImageBusy){setMessage("画像の変更を適用するか、閉じてから手順書を切り替えてください。","warning");return;}
    if (dirty && !options.force && !window.confirm("編集中の変更を破棄して別の手順書を開きますか？")) return;
    const sameManual = detailData?.manual?.id === id;
    const selectedIndex = editorState?.steps.findIndex((step) => stepKey(step) === selectedStepKey) ?? 0;
    const serial = ++requestSerial;
    selected = manuals.find((item) => item.id === id) || null;
    shareState = null; shareToken = null; shareMetaError = null;
    renderList();
    if (!selected) { renderDetail(null); return; }
    setMessage("手順書を読み込んでいます…");
    try {
      const data = await json(workspacePath() + "/manuals/" + encodeURIComponent(id));
      if (serial !== requestSerial) return;
      if (options.expectedUpdatedAt && (data?.draft?.updatedAt !== options.expectedUpdatedAt || !savedSnapshotMatches(options.expectedSnapshot, data))) return false;
      detailData = data;
      editorState = {
        title: data.draft?.title || data.manual?.title || "",
        description: data.draft?.description || "",
        steps: Array.isArray(data.steps) ? clone(data.steps).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : []
      };
      if (!sameManual) { selectedStepKey = stepKey(editorState.steps[0] || {}); undoStack = []; redoStack = []; shareOpen = new URLSearchParams(location.search).has("shareManualId"); }
      else if (!editorState.steps.some((step) => stepKey(step) === selectedStepKey)) selectedStepKey = stepKey(editorState.steps[Math.max(0, selectedIndex)] || editorState.steps[0] || {});
      dirty = false;
      editVersion += 1;
      const shareResult = await loadShareMetadata(id);
      if (serial !== requestSerial) return;
      shareState = shareResult.state;
      shareMetaError = shareResult.error;
      renderDetail(data);
      setMessage(shareOpen ? "共有範囲・期限・パスコードを確認してください。" : "手順書を表示しています。");
      return true;
    } catch (error) {
      if (serial !== requestSerial) return;
      if (error.status === 401 || error.status === 403) {
        clearProtectedEditor();
        setMessage("認証または権限を確認できません。画面を更新してください。", "error");
        return "auth-lost";
      }
      setMessage(error.message, "error");
      return false;
    }
  }
  addEventListener("beforeunload",event=>{if(dirty||saveInFlight||activeCloudImageEditor||cloudImageBusy){event.preventDefault();event.returnValue="";}});
  document.querySelector("#manual-search")?.addEventListener("input",renderList);
  const librarySettings=make("button","チームの見た目","secondary");librarySettings.type="button";librarySettings.addEventListener("click",()=>openBrandingSettings(librarySettings));header?.append(librarySettings);
  if (!workspaceId) setMessage("ワークスペースを確認できません。", "error"); else loadManuals(new URLSearchParams(location.search).get("shareManualId") || "");
})();`;

export function renderCloudManualsPage({ workspaceId = "", assetVersion = "" } = {}) {
  const version = assetVersion ? `?v=${encodeURIComponent(assetVersion)}` : "";
  const safeWorkspaceId = String(workspaceId).replace(/[&<>"']/g, "");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>手順書 | めっちゃマニュアル</title><link rel="stylesheet" href="/assets/cloud-manual.css${version}"></head><body><main id="cloud-manuals" class="cloud-shell" data-workspace-id="${safeWorkspaceId}"><header class="cloud-header"><div><p aria-hidden="true" class="cloud-brand-name">めっちゃマニュアル</p><h1>保存した手順書</h1><p class="cloud-note">いつもの仕事を、誰でも迷わず進められる手順書に。</p></div></header><p id="cloud-message" class="cloud-message" role="status" aria-live="polite"></p><div class="cloud-grid"><section class="cloud-panel manual-library" aria-labelledby="cloud-list-heading"><h2 id="cloud-list-heading">手順書一覧</h2><label for="manual-search" class="sr-only">手順書を検索</label><input id="manual-search" class="manual-search" type="search" placeholder="手順書を検索"><div id="cloud-list" class="cloud-list"></div></section><section class="cloud-panel" aria-labelledby="cloud-detail-heading"><h2 id="cloud-detail-heading" class="sr-only">手順書の内容</h2><div id="cloud-detail"><p class="cloud-note">一覧から手順書を選んでください。</p></div></section></div></main><script src="/assets/editor-tools.js${version}" defer></script><script src="/assets/cloud-manual.js${version}" defer></script></body></html>`;
}
