// ==UserScript==
// @name         Get DLC Info from SteamDB
// @namespace    gmy77-get-dlc-info-steamdb
// @version      2026.03.21
// @author       gmy77 (based on Sak32009)
// @description  Extract DLC, depot, achievement and package metadata from Steam / SteamDB. Multi-emulator export: CreamAPI, Goldberg, CreamLinux. Filter, drag, keyboard shortcut.
// @license      MIT
// @icon         https://steamdb.info/static/logos/192px.png
// @homepage     https://github.com/gmy77/GetDLCInfoFromSteamDB
// @homepageURL  https://github.com/gmy77/GetDLCInfoFromSteamDB
// @source       https://github.com/gmy77/GetDLCInfoFromSteamDB
// @supportURL   https://github.com/gmy77/GetDLCInfoFromSteamDB/issues
// @downloadURL  https://raw.githubusercontent.com/gmy77/GetDLCInfoFromSteamDB/master/dist/sak32009-get-data-from-steam-steamdb.user.js
// @updateURL    https://raw.githubusercontent.com/gmy77/GetDLCInfoFromSteamDB/master/dist/sak32009-get-data-from-steam-steamdb.meta.js
// @match        *://steamdb.info/app/*
// @match        *://steamdb.info/depot/*
// @match        *://store.steampowered.com/app/*
// @connect      store.steampowered.com
// @grant        none
// @run-at       document-end
// @noframes
// @updatedAt    Fri, 21 Mar 2026 00:00:00 GMT
// ==/UserScript==

/* ------------------------------------------------------------------ *
 *  Encoded string pool — key identifiers resolved once at startup.   *
 *  Each slot is a base64 literal; use _$(index) to decode.           *
 * ------------------------------------------------------------------ */
((_noop1, _noop2) => {
  "use strict";

  // ── Decoder ──────────────────────────────────────────────────────
  const _$ = /* @__PURE__ */ (() => {
    const _t = [
      /* 0 */ "aHR0cHM6Ly9zdG9yZS5zdGVhbXBvd2VyZWQuY29tL2FwaS9hcHBkZXRhaWxz",
      /* 1 */ "Z2RzLXBhbmVs",
      /* 2 */ "Z2RzLXBhbmVsOnZpc2libGU=",
      /* 3 */ "c3RlYW1kYi5pbmZv",
      /* 4 */ "Z2RzOnN0b3JlOg==",
      /* 5 */ "Z2RzLXRvYXN0",
      /* 6 */ "Z2RzLXBhbmVsLXN0eWxlcw==",
      /* 7 */ "I2RsYyB0YWJsZSB0Ym9keSB0cg==",
      /* 8 */ "I2FjaGlldmVtZW50cyB0YWJsZSB0Ym9keSB0cg==",
      /* 9 */ "I2RlcG90cyB0YWJsZSB0Ym9keSB0cg==",
      /* 10*/ "Z2RzLXBhbmVsOnBvcw==",
    ];
    return (i) => atob(_t[i]);
  })();

  // ── Resolved constants ────────────────────────────────────────────
  const _API = _$(0);
  const _PID = _$(1);
  const _PSK = _$(2);
  const _SDB = _$(3);
  const _CPX = _$(4);
  const _PPK = _$(10);
  const _RX  = /\/app\/(\d+)/u;

  /* ================================================================ *
   *  UTILS                                                            *
   * ================================================================ */
  const utils = {
    mk(tag, opts = {}) {
      return Object.assign(document.createElement(tag), opts);
    },

    text(v) {
      return v == null ? "" : String(v).trim();
    },

    debounce(fn, ms = 150) {
      let t;
      return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    },

    fmtDate(v) {
      if (!v) return "Unknown";
      const d = new Date(v);
      return isNaN(d) ? v : new Intl.DateTimeFormat(void 0, { dateStyle: "medium", timeStyle: "short" }).format(d);
    },

    fmtPrice(p) { return p?.final_formatted ?? "Unavailable"; },

    async copy(val) {
      try {
        await navigator.clipboard.writeText(val);
        utils.toast("Copied to clipboard");
      } catch (_) {
        const ta = utils.mk("textarea", { value: val });
        Object.assign(ta.style, { position: "fixed", top: "-9999px" });
        ta.setAttribute("readonly", "");
        document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
        utils.toast("Copied to clipboard");
      }
    },

    dl(name, body) {
      const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
      const a   = utils.mk("a", { href: url, download: name });
      document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    },

    toast(msg) {
      document.getElementById(_$(5))?.remove();
      const el = utils.mk("div", { id: _$(5), textContent: msg });
      Object.assign(el.style, {
        position: "fixed", top: "1.5rem", right: "1.5rem",
        padding: "0.6rem 1rem", background: "rgba(11,15,24,.94)",
        color: "#e4eaf5", borderRadius: "999px", fontSize: ".84rem",
        zIndex: "2147483647", boxShadow: "0 8px 24px rgba(3,5,10,.5)",
        border: "1px solid rgba(255,255,255,.08)", transition: "opacity .4s ease",
      });
      document.body.append(el);
      setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 420); }, 1700);
    },

    setVis(v) { try { sessionStorage.setItem(_PSK, JSON.stringify(v)); } catch (_) {} },
    getVis()  { try { const s = sessionStorage.getItem(_PSK); return s === null ? true : JSON.parse(s); } catch (_) { return true; } },

    /** Attach drag-to-reposition behaviour; persists coords in sessionStorage. */
    draggable(el, handle) {
      try {
        const sv = JSON.parse(sessionStorage.getItem(_PPK) || "null");
        if (sv?.top) Object.assign(el.style, { top: sv.top, left: sv.left, bottom: "auto", right: "auto", insetBlockEnd: "auto", insetInlineEnd: "auto" });
      } catch (_) {}

      let sx = 0, sy = 0;
      handle.style.cursor = "grab";

      const mv = (e) => {
        e.preventDefault();
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        const cy = e.touches ? e.touches[0].clientY : e.clientY;
        const r  = el.getBoundingClientRect();
        Object.assign(el.style, {
          left: Math.max(0, Math.min(innerWidth  - r.width,  r.left - (sx - cx))) + "px",
          top:  Math.max(0, Math.min(innerHeight - r.height, r.top  - (sy - cy))) + "px",
          right: "auto", bottom: "auto", insetBlockEnd: "auto", insetInlineEnd: "auto",
        });
        sx = cx; sy = cy;
      };
      const up = () => {
        document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up);
        document.removeEventListener("touchmove", mv); document.removeEventListener("touchend", up);
        handle.style.cursor = "grab";
        try { sessionStorage.setItem(_PPK, JSON.stringify({ top: el.style.top, left: el.style.left })); } catch (_) {}
      };

      handle.addEventListener("mousedown", (e) => {
        e.preventDefault(); sx = e.clientX; sy = e.clientY;
        handle.style.cursor = "grabbing";
        document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
      });
      handle.addEventListener("touchstart", (e) => {
        sx = e.touches[0].clientX; sy = e.touches[0].clientY;
        document.addEventListener("touchmove", mv, { passive: false });
        document.addEventListener("touchend", up);
      }, { passive: true });
    },
  };

  /* ================================================================ *
   *  APP DATA CLIENT                                                  *
   * ================================================================ */
  class AppDataClient {
    constructor() { this._ctrl = null; }

    async fetch(id, force = false) {
      const key = _CPX + id;
      if (!force) { const c = this._rc(key); if (c) return c; }
      this._ctrl?.abort(); this._ctrl = new AbortController();
      const u = new URL(_API);
      u.searchParams.set("appids",  id);
      u.searchParams.set("cc",      "us");
      u.searchParams.set("l",       "english");
      u.searchParams.set("filters", "basic,price_overview,package_groups,platforms,release_date,developers,publishers,dlc");
      const r = await fetch(u.href, { signal: this._ctrl.signal, credentials: "omit", headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("Steam API: HTTP " + r.status);
      const j = await r.json(); const e = j?.[id];
      if (!e?.success) throw new Error("Steam API returned no data");
      const n = AppDataClient._norm(id, e.data); this._wc(key, n); return n;
    }

    _rc(k) { try { const r = sessionStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (_) { return null; } }
    _wc(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }

    static _norm(id, d) {
      const { name, type, release_date: rd, price_overview: po,
              developers: devs = [], publishers: pubs = [],
              package_groups: pg = [], platforms: plat = {}, dlc = [] } = d ?? {};
      return {
        appId: id, name, type,
        releaseDate:   rd?.date,
        isReleased:    rd?.coming_soon === false,
        priceOverview: po, developers: devs, publishers: pubs, platforms: plat,
        dlc: dlc.map(String),
        packages: pg.flatMap(g => (g?.subs ?? []).map(s => ({
          id: String(s.packageid), title: s.title,
          price: s.price_in_cents_with_discount / 100, discount: s.discount_pct,
        }))),
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  /* ================================================================ *
   *  STEAMDB SCRAPER                                                  *
   * ================================================================ */
  class SteamDbScraper {
    static dlc() {
      return SteamDbScraper._dd(
        [...document.querySelectorAll(_$(7))].flatMap(row => {
          const cells = row.querySelectorAll("td");
          if (!cells.length) return [];
          const id = row.dataset.appid ?? utils.text(cells[0]?.textContent);
          if (!id) return [];
          const nc = cells[1] ?? cells[0];
          return [{ id: id.trim(), name: utils.text(nc?.querySelector("a")?.textContent || nc?.textContent) || ("DLC " + id.trim()) }];
        }), x => x.id);
    }

    static achievements() {
      return SteamDbScraper._dd(
        [...document.querySelectorAll(_$(8))].flatMap(row => {
          const n = row.dataset.name ?? utils.text(row.querySelector("td:nth-child(2)")?.textContent);
          if (!n) return [];
          const img = row.querySelector("img");
          return [{ name: n, displayName: utils.text(row.querySelector("td:nth-child(3)")?.textContent) || n, description: utils.text(row.querySelector("td:nth-child(4)")?.textContent), icon: img?.getAttribute("src") ?? "", iconGray: img?.getAttribute("data-hover-src") ?? "" }];
        }), x => x.name);
    }

    static depots() {
      return SteamDbScraper._dd(
        [...document.querySelectorAll(_$(9))].flatMap(row => {
          const cells = row.querySelectorAll("td");
          if (!cells.length) return [];
          const id = row.dataset.depotid ?? utils.text(cells[0]?.textContent);
          if (!id) return [];
          const nc = cells[1] ?? cells[0];
          return [{ id: id.trim(), name: utils.text(nc?.textContent) || ("Depot " + id.trim()), manifests: utils.text(cells[2]?.textContent), osList: utils.text(row.dataset.os) }];
        }), x => x.id);
    }

    static _dd(list, fn) {
      const s = new Set();
      return list.filter(e => { const k = fn(e); if (!k || s.has(k)) return false; s.add(k); return true; });
    }
  }

  /* ================================================================ *
   *  EXPORTERS                                                        *
   * ================================================================ */
  const _exp = (() => {
    const _id  = e => typeof e === "string" ? e : e.id;
    const _nm  = e => typeof e === "string" ? ("DLC " + e) : e.name;
    const _esc = v => '"' + v.replace(/"/g, '""') + '"';
    const _sep = t => "\n" + "=".repeat(58) + "\n" + t + "\n" + "=".repeat(58) + "\n";

    return {
      creamApi(appId, dlc) {
        return ["; cream_api.ini — generated by GetDLCInfoFromSteamDB", "[steam]", "appid = " + appId, "", "[dlc]",
                ...dlc.map(e => _id(e) + " = " + _nm(e))].join("\n");
      },
      goldberg(appId, dlc) {
        return ["; Goldberg Steam Emulator — DLC.txt", "; AppID: " + appId, "; Place at: steam_settings/DLC.txt", "",
                ...dlc.map(e => _id(e) + "=" + _nm(e))].join("\n");
      },
      creamLinux(appId, dlc) {
        return ["[settings]", "app_id=" + appId, "", "[dlc]",
                ...dlc.map(e => _id(e) + "=" + _nm(e))].join("\n");
      },
      achievementsIni(ach) {
        return "[Achievements]\n" + ach.map(a => a.name + "=1").join("\n");
      },
      achievementsJson(ach) {
        return JSON.stringify(ach.map(a => ({ name: a.name, displayName: a.displayName, description: a.description, icon: a.icon, iconGray: a.iconGray })), null, 2);
      },
      depotsCsv(dep) {
        return ["depot_id,name,manifests,os_list",
                ...dep.map(d => [d.id, d.name, d.manifests, d.osList].map(_esc).join(","))].join("\n");
      },
      bundle(appId, dlc, ach, dep) {
        const out = ["GetDLCInfoFromSteamDB — Export Bundle\nApp: " + appId + "\nDate: " + new Date().toUTCString()];
        if (dlc.length) { out.push(_sep("CREAM_API.INI") + _exp.creamApi(appId, dlc)); out.push(_sep("GOLDBERG DLC.TXT") + _exp.goldberg(appId, dlc)); out.push(_sep("CREAMLINUX.INI") + _exp.creamLinux(appId, dlc)); }
        if (ach.length) { out.push(_sep("ACHIEVEMENTS.INI") + _exp.achievementsIni(ach)); out.push(_sep("ACHIEVEMENTS.JSON") + _exp.achievementsJson(ach)); }
        if (dep.length) { out.push(_sep("DEPOTS.CSV") + _exp.depotsCsv(dep)); }
        return out.join("\n");
      },
    };
  })();

  /* ================================================================ *
   *  PANEL CONTROLLER                                                 *
   * ================================================================ */
  class PanelController {
    constructor() { this._root = this._init(); }

    _init() {
      const ex = document.getElementById(_PID);
      if (ex) return ex;
      this._css();
      const el = utils.mk("div", { id: _PID });
      el.setAttribute("role", "region"); el.setAttribute("aria-label", "Get DLC Info from SteamDB");
      document.body.append(el); return el;
    }

    _css() {
      if (document.getElementById(_$(6))) return;
      const P = _PID;
      document.head.append(utils.mk("style", { id: _$(6), textContent: `
        #${P}{position:fixed;inset-block-end:1.5rem;inset-inline-end:1.5rem;width:min(450px,calc(100vw - 2rem));padding:1.2rem;border-radius:16px;background:rgba(11,15,24,.93);color:#e4eaf5;font-family:"Inter","Segoe UI",system-ui,sans-serif;box-shadow:0 28px 64px rgba(3,5,10,.7);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);z-index:2147483647;display:flex;flex-direction:column;gap:.8rem;border:1px solid rgba(255,255,255,.07);font-size:13px;transition:transform .3s ease,opacity .3s ease}
        #${P}[data-hidden="true"]{opacity:.07;transform:translateY(16px);pointer-events:none}
        #${P} button{appearance:none;border:none;cursor:pointer;border-radius:8px;padding:.42rem .7rem;background:linear-gradient(115deg,#7c5cbf,#3daae8);color:#fff;font-weight:600;font-size:.76rem;transition:filter .18s,transform .12s;white-space:nowrap}
        #${P} button:hover:not([disabled]){filter:brightness(1.2);transform:translateY(-1px)}
        #${P} button[disabled]{opacity:.35;cursor:not-allowed}
        #${P} button.sec{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13)}
        #${P} header{display:flex;align-items:center;gap:.5rem;user-select:none;cursor:default}
        #${P} header h2{font-size:.95rem;margin:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #${P} .gds-badge{background:rgba(61,170,232,.17);color:#5bcaf5;border-radius:20px;padding:.12rem .45rem;font-size:.67rem;font-weight:700;letter-spacing:.03em;flex-shrink:0}
        #${P} .gds-drag{font-size:.62rem;opacity:.28;cursor:grab;flex-shrink:0;padding:.1rem .25rem;user-select:none}
        #${P} dl{display:grid;grid-template-columns:auto 1fr;gap:.27rem .58rem;margin:0}
        #${P} dl dt{opacity:.5;font-size:.7rem;align-self:center}
        #${P} dl dd{margin:0;font-size:.79rem}
        #${P} details{background:rgba(0,0,0,.22);border-radius:10px;padding:.65rem .75rem;border:1px solid rgba(255,255,255,.05)}
        #${P} details summary{cursor:pointer;font-weight:600;font-size:.86rem;outline:none;list-style:none;display:flex;align-items:center;gap:.4rem}
        #${P} details summary::-webkit-details-marker{display:none}
        #${P} details[open] summary::before{content:"▾ "}
        #${P} details:not([open]) summary::before{content:"▸ "}
        #${P} .gds-search{width:100%;box-sizing:border-box;margin-top:.5rem;padding:.38rem .55rem;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.11);border-radius:7px;color:#e4eaf5;font-size:.78rem;outline:none;transition:border-color .18s}
        #${P} .gds-search:focus{border-color:rgba(61,170,232,.5)}
        #${P} ul{list-style:none;margin:.55rem 0 0;padding:0;max-height:195px;overflow-y:auto;display:grid;gap:.27rem}
        #${P} li{background:rgba(255,255,255,.04);border-radius:7px;padding:.42rem .52rem;font-size:.78rem;line-height:1.35;border:1px solid rgba(255,255,255,.04);transition:background .14s}
        #${P} li:hover{background:rgba(255,255,255,.075)}
        #${P} footer{display:flex;flex-wrap:wrap;gap:.37rem;align-items:center}
        #${P} .gds-actions{display:flex;flex-wrap:wrap;gap:.32rem;margin-top:.5rem}
        #${P} .gds-meta{font-size:.73rem;opacity:.56;margin-top:.12rem}
        #${P} .gds-error{background:rgba(210,55,55,.14);border:1px solid rgba(220,80,80,.3);border-radius:10px;padding:.65rem;font-size:.8rem}
        #${P} .gds-hint{font-size:.62rem;opacity:.3;margin-left:auto}
        #${P} ::-webkit-scrollbar{width:3px}
        #${P} ::-webkit-scrollbar-track{background:transparent}
        #${P} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:2px}
      ` }));
    }

    render(st) {
      this._root.replaceChildren();
      this._root.dataset.hidden = st.hidden ? "true" : "false";

      /* ── Header ── */
      const hdr = utils.mk("header");
      hdr.append(utils.mk("h2", { textContent: st.store?.name ? st.store.name + "  ·  " + st.appId : "App " + st.appId }));
      if (st.dlc.length)          hdr.append(utils.mk("span", { className: "gds-badge", textContent: st.dlc.length + " DLC" }));
      if (st.achievements.length) hdr.append(utils.mk("span", { className: "gds-badge", textContent: st.achievements.length + " Ach" }));
      const drag = utils.mk("span", { className: "gds-drag", textContent: "⠿", title: "Drag to move" });
      hdr.append(drag);
      const tog = utils.mk("button", { type: "button", textContent: st.hidden ? "▲" : "▼", className: "sec", title: st.hidden ? "Show" : "Hide" });
      tog.addEventListener("click", () => { st.hidden = !st.hidden; utils.setVis(!st.hidden); this.render(st); });
      hdr.append(tog);
      this._root.append(hdr);

      utils.draggable(this._root, drag);

      if (st.error) { this._root.append(utils.mk("div", { className: "gds-error", textContent: st.error })); return; }
      if (st.loading) this._root.append(utils.mk("p", { className: "gds-meta", textContent: "Fetching Steam data…" }));
      if (st.store)               this._root.append(this._overview(st));
      if (st.dlc.length)          this._root.append(this._dlcSec(st));
      if (st.achievements.length) this._root.append(this._achSec(st));
      if (st.depots.length)       this._root.append(this._depSec(st));
      if (st.store?.packages?.length) this._root.append(this._pkgSec(st));
      this._root.append(this._footer(st));
    }

    _overview(st) {
      const d = utils.mk("details", { open: true });
      d.append(utils.mk("summary", { textContent: "Overview" }));
      const dl = utils.mk("dl"); const s = st.store;
      [["Type", s.type ?? "Unknown"], ["Release", utils.fmtDate(s.releaseDate) + (s.isReleased ? "" : " (Coming soon)")],
       ["Price", utils.fmtPrice(s.priceOverview)], ["Developers", s.developers?.join(", ") || "—"],
       ["Publishers", s.publishers?.join(", ") || "—"], ["Platforms", this._plat(s.platforms)],
       ["Fetched", utils.fmtDate(s.fetchedAt)]].forEach(([k, v]) => {
        dl.append(utils.mk("dt", { textContent: k })); dl.append(utils.mk("dd", { textContent: v }));
      });
      d.append(dl); return d;
    }

    _dlcSec(st) {
      const d   = utils.mk("details", { open: true });
      d.append(utils.mk("summary", { textContent: "DLC (" + st.dlc.length + ")" }));
      const inp = utils.mk("input"); inp.type = "text"; inp.placeholder = "Filter by name or ID…"; inp.className = "gds-search";
      d.append(inp);
      const ul  = utils.mk("ul");
      const draw = (q = "") => {
        ul.replaceChildren(); const lq = q.toLowerCase();
        const list = q ? st.dlc.filter(e => { const id = typeof e === "string" ? e : e.id; const nm = (typeof e === "string" ? "" : e.name).toLowerCase(); return id.includes(q) || nm.includes(lq); }) : st.dlc;
        list.slice(0, 350).forEach(e => { const id = typeof e === "string" ? e : e.id; const nm = typeof e === "string" ? "DLC " + e : e.name; ul.append(utils.mk("li", { textContent: id + "  ·  " + nm })); });
        if (!list.length) ul.append(utils.mk("li", { className: "gds-meta", textContent: "No results" }));
      };
      draw(); inp.addEventListener("input", utils.debounce(() => draw(inp.value), 180)); d.append(ul);
      const acts = utils.mk("div", { className: "gds-actions" });
      const btn  = (lbl, fn) => { const b = utils.mk("button", { type: "button", textContent: lbl }); b.addEventListener("click", fn); return b; };
      acts.append(
        btn("Copy IDs",   () => utils.copy(st.dlc.map(e => typeof e === "string" ? e : e.id).join(",\n"))),
        btn("CreamAPI",   () => utils.dl(st.appId + "_cream_api.ini",   _exp.creamApi(st.appId, st.dlc))),
        btn("Goldberg",   () => utils.dl(st.appId + "_DLC.txt",          _exp.goldberg(st.appId, st.dlc))),
        btn("CreamLinux", () => utils.dl(st.appId + "_creamlinux.ini",   _exp.creamLinux(st.appId, st.dlc))),
      );
      d.append(acts); return d;
    }

    _achSec(st) {
      const d   = utils.mk("details");
      d.append(utils.mk("summary", { textContent: "Achievements (" + st.achievements.length + ")" }));
      const inp = utils.mk("input"); inp.type = "text"; inp.placeholder = "Filter achievements…"; inp.className = "gds-search";
      d.append(inp);
      const ul  = utils.mk("ul");
      const draw = (q = "") => {
        ul.replaceChildren(); const lq = q.toLowerCase();
        const list = q ? st.achievements.filter(a => a.name.toLowerCase().includes(lq) || a.displayName.toLowerCase().includes(lq) || a.description.toLowerCase().includes(lq)) : st.achievements;
        list.slice(0, 350).forEach(a => { const li = utils.mk("li", { textContent: a.name + "  ·  " + a.displayName }); if (a.description) li.append(utils.mk("div", { className: "gds-meta", textContent: a.description })); ul.append(li); });
        if (!list.length) ul.append(utils.mk("li", { className: "gds-meta", textContent: "No results" }));
      };
      draw(); inp.addEventListener("input", utils.debounce(() => draw(inp.value), 180)); d.append(ul);
      const acts = utils.mk("div", { className: "gds-actions" });
      const btn  = (lbl, fn) => { const b = utils.mk("button", { type: "button", textContent: lbl }); b.addEventListener("click", fn); return b; };
      acts.append(
        btn("Copy JSON",     () => utils.copy(_exp.achievementsJson(st.achievements))),
        btn("Download INI",  () => utils.dl(st.appId + "_achievements.ini",  _exp.achievementsIni(st.achievements))),
        btn("Download JSON", () => utils.dl(st.appId + "_achievements.json", _exp.achievementsJson(st.achievements))),
      );
      d.append(acts); return d;
    }

    _depSec(st) {
      const d = utils.mk("details");
      d.append(utils.mk("summary", { textContent: "Depots (" + st.depots.length + ")" }));
      const ul = utils.mk("ul");
      st.depots.slice(0, 350).forEach(dep => {
        const li = utils.mk("li", { textContent: dep.id + "  ·  " + dep.name });
        const m  = [dep.manifests, dep.osList].filter(Boolean).join(" · ");
        if (m) li.append(utils.mk("div", { className: "gds-meta", textContent: m }));
        ul.append(li);
      });
      d.append(ul);
      const acts = utils.mk("div", { className: "gds-actions" });
      const b = utils.mk("button", { type: "button", textContent: "Download depots.csv" });
      b.addEventListener("click", () => utils.dl(st.appId + "_depots.csv", _exp.depotsCsv(st.depots)));
      acts.append(b); d.append(acts); return d;
    }

    _pkgSec(st) {
      const pkgs = st.store?.packages ?? [];
      const d    = utils.mk("details");
      d.append(utils.mk("summary", { textContent: "Packages (" + pkgs.length + ")" }));
      const ul = utils.mk("ul");
      pkgs.forEach(p => {
        const li = utils.mk("li", { textContent: p.title || "Package " + p.id });
        const pr = p.discount > 0 ? "$" + p.price.toFixed(2) + " (−" + p.discount + "%)" : "$" + p.price.toFixed(2);
        li.append(utils.mk("div", { className: "gds-meta", textContent: "ID: " + p.id + "  ·  " + pr }));
        ul.append(li);
      });
      d.append(ul); return d;
    }

    _footer(st) {
      const f   = utils.mk("footer");
      const btn = (lbl, fn) => { const b = utils.mk("button", { type: "button", textContent: lbl }); b.addEventListener("click", fn); return b; };
      f.append(btn("Refresh", () => st.onRefresh?.()));
      f.append(btn("Copy Store JSON", () => st.store && utils.copy(JSON.stringify(st.store, null, 2))));
      if (st.dlc.length || st.achievements.length || st.depots.length) {
        f.append(btn("⬇ Export All", () => utils.dl(st.appId + "_export_bundle.txt", _exp.bundle(st.appId, st.dlc, st.achievements, st.depots))));
      }
      f.append(utils.mk("span", { className: "gds-hint", textContent: "Alt+Shift+S" }));
      return f;
    }

    _plat(p) {
      if (!p) return "Unknown";
      const a = Object.entries(p).filter(([, v]) => v).map(([k]) => k[0].toUpperCase() + k.slice(1));
      return a.length ? a.join(", ") : "Unknown";
    }
  }

  /* ================================================================ *
   *  APP ID DETECTION                                                 *
   * ================================================================ */
  function detectId() {
    const m = location.pathname.match(_RX); if (m) return m[1];
    const q = new URL(location.href).searchParams.get("appid"); if (q) return q;
    const og = document.querySelector('meta[property="og:url"]')?.getAttribute("content");
    return og?.match(_RX)?.[1] ?? null;
  }

  /* ================================================================ *
   *  BOOTSTRAP                                                        *
   * ================================================================ */
  async function main() {
    const appId  = detectId();
    const panel  = new PanelController();
    const client = new AppDataClient();

    const st = {
      appId: appId ?? "Unknown", store: null, dlc: [], achievements: [], depots: [],
      loading: true, hidden: !utils.getVis(), error: null,
      onRefresh: async () => {
        st.loading = true; panel.render(st);
        try   { st.store = await client.fetch(st.appId, true); st.loading = false; }
        catch (e) { st.error = e instanceof Error ? e.message : String(e); st.loading = false; }
        panel.render(st);
      },
    };

    if (!appId) { st.loading = false; st.error = "Unable to detect Steam App ID for this page."; panel.render(st); return; }
    panel.render(st);

    try   { st.store = await client.fetch(appId); st.loading = false; panel.render(st); }
    catch (e) { st.loading = false; st.error = e instanceof Error ? e.message : String(e); panel.render(st); return; }

    if (location.hostname.endsWith(_SDB)) {
      const upd = () => {
        const dlc = SteamDbScraper.dlc(); const ach = SteamDbScraper.achievements(); const dep = SteamDbScraper.depots();
        st.dlc = dlc.length ? dlc : (st.store?.dlc ?? []); st.achievements = ach; st.depots = dep;
        panel.render(st);
      };
      upd();
      new MutationObserver(utils.debounce(upd, 220)).observe(document.body, { childList: true, subtree: true });
    } else if (st.store?.dlc?.length) {
      st.dlc = st.store.dlc; panel.render(st);
    }

    // Keyboard shortcut: Alt+Shift+S
    document.addEventListener("keydown", e => {
      if (e.altKey && e.shiftKey && e.code === "KeyS") {
        e.preventDefault(); st.hidden = !st.hidden; utils.setVis(!st.hidden); panel.render(st);
        utils.toast(st.hidden ? "Panel hidden  (Alt+Shift+S)" : "Panel visible  (Alt+Shift+S)");
      }
    });
  }

  main().catch(e => console.error("[GDS]", e));

})(x => x, x => x);
