// ==UserScript==
// @name         Get Data from Steam / SteamDB
// @namespace    sak32009-get-data-modern
// @version      2024.10.31
// @author       Sak32009 & contributors
// @description  Collect DLC, depot and achievement metadata from Steam / SteamDB with modern, dependency-free utilities.
// @license      MIT
// @icon         https://steamdb.info/static/logos/192px.png
// @homepage     https://github.com/Sak32009/GetDataFromSteam-SteamDB
// @homepageURL  https://github.com/Sak32009/GetDataFromSteam-SteamDB
// @source       https://github.com/Sak32009/GetDataFromSteam-SteamDB
// @supportURL   https://github.com/Sak32009/GetDataFromSteam-SteamDB/issues
// @downloadURL  https://raw.githubusercontent.com/Sak32009/GetDataFromSteam-SteamDB/main/dist/sak32009-get-data-from-steam-steamdb.user.js
// @updateURL    https://raw.githubusercontent.com/Sak32009/GetDataFromSteam-SteamDB/main/dist/sak32009-get-data-from-steam-steamdb.meta.js
// @match        *://steamdb.info/app/*
// @match        *://steamdb.info/depot/*
// @match        *://store.steampowered.com/app/*
// @connect      store.steampowered.com
// @grant        none
// @run-at       document-end
// @noframes
// @updatedAt    Thu, 31 Oct 2024 12:00:00 GMT
// ==/UserScript==

(() => {
  "use strict";

  /**
   * Regular expressions & selectors used across the script.
   */
  const APP_PAGE_REGEX = /\/app\/(\d+)/u;
  const STEAM_STORE_API = "https://store.steampowered.com/api/appdetails";
  const PANEL_ID = "gds-panel";
  const PANEL_STORAGE_KEY = "gds-panel:visible";
  const STEAMDB_HOST = "steamdb.info";

  /**
   * Namespace that hosts small utility helpers. Keeping the helpers close to the
   * script reduces the need for large dependencies while keeping the logic tidy.
   */
  const utils = {
    /**
     * Creates a DOM element and extends it with the provided options.
     * This is a tiny helper that keeps templating declarative.
     *
     * @template {keyof HTMLElementTagNameMap} T
     * @param {T} tag
     * @param {Partial<HTMLElementTagNameMap[T]> & Record<string, unknown>} [options]
     * @returns {HTMLElementTagNameMap[T]}
     */
    createElement(tag, options = {}) {
      const element = document.createElement(tag);
      Object.assign(element, options);
      return element;
    },

    /**
     * Converts arbitrary values to trimmed text while avoiding null/undefined.
     * @param {unknown} value
     * @returns {string}
     */
    text(value) {
      if (value === null || value === undefined) {
        return "";
      }
      return String(value).trim();
    },

    /**
     * Debounces a function so it only runs once after the cooldown period. This
     * is used for DOM observers to avoid spamming re-renders while SteamDB still
     * streams HTML into the page.
     *
     * @template {(...args: never[]) => void} T
     * @param {T} callback
     * @param {number} delay
     * @returns {T}
     */
    debounce(callback, delay = 150) {
      let timer = null;
      return ((...args) => {
        if (timer) {
          window.clearTimeout(timer);
        }
        timer = window.setTimeout(() => {
          timer = null;
          callback(...args);
        }, delay);
      });
    },

    /**
     * Formats dates by using Intl.DateTimeFormat. Keeps locale awareness while
     * falling back to ISO strings when the input cannot be parsed.
     *
     * @param {string | undefined} value
     * @returns {string}
     */
    formatDate(value) {
      if (!value) {
        return "Unknown";
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value;
      }
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    },

    /**
     * Formats price using the currency information exposed by the Steam API.
     * @param {{ final_formatted?: string } | undefined} price
     * @returns {string}
     */
    formatPrice(price) {
      if (!price) {
        return "Unavailable";
      }
      if (price.final_formatted) {
        return price.final_formatted;
      }
      return "Unavailable";
    },

    /**
     * Copy helper that prefers the asynchronous clipboard API and gracefully
     * falls back to a hidden textarea when the API is blocked.
     *
     * @param {string} value
     */
    async copy(value) {
      try {
        await navigator.clipboard.writeText(value);
        utils.toast("Copied to clipboard");
      } catch (error) {
        const textarea = utils.createElement("textarea", {
          value,
        });
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        textarea.setAttribute("readonly", "true");
        document.body.append(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
        utils.toast("Copied to clipboard");
      }
    },

    /**
     * Triggers a file download by creating an Object URL.
     * @param {string} filename
     * @param {string} contents
     */
    download(filename, contents) {
      const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = utils.createElement("a", {
        href: url,
        download: filename,
      });
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },

    /**
     * Shows a non-blocking message in the top-right corner so we avoid native
     * alerts that interrupt the browsing session.
     *
     * @param {string} message
     */
    toast(message) {
      const existing = document.getElementById("gds-toast");
      if (existing) {
        existing.remove();
      }
      const toast = utils.createElement("div", {
        id: "gds-toast",
        textContent: message,
      });
      toast.style.position = "fixed";
      toast.style.top = "1.5rem";
      toast.style.right = "1.5rem";
      toast.style.padding = "0.6rem 0.9rem";
      toast.style.background = "rgba(19, 24, 34, 0.9)";
      toast.style.color = "#f5f7fa";
      toast.style.borderRadius = "999px";
      toast.style.fontSize = "0.85rem";
      toast.style.zIndex = "2147483647";
      toast.style.boxShadow = "0 10px 25px rgba(10, 13, 22, 0.35)";
      toast.style.transition = "opacity 0.4s ease";
      document.body.append(toast);
      window.setTimeout(() => {
        toast.style.opacity = "0";
        window.setTimeout(() => toast.remove(), 400);
      }, 1500);
    },

    /**
     * Persists panel visibility in sessionStorage, ignoring quota issues.
     * @param {boolean} value
     */
    setPanelVisibility(value) {
      try {
        window.sessionStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(value));
      } catch (error) {
        console.warn("[GDS] Unable to persist panel visibility", error);
      }
    },

    /**
     * Reads the stored panel visibility preference.
     * @returns {boolean}
     */
    getPanelVisibility() {
      try {
        const stored = window.sessionStorage.getItem(PANEL_STORAGE_KEY);
        if (stored === null) {
          return true;
        }
        return JSON.parse(stored);
      } catch (error) {
        console.warn("[GDS] Unable to read panel visibility", error);
        return true;
      }
    },
  };

  /**
   * Lightweight cache-aware client for the public Steam Store API. The API is
   * extremely chatty, therefore we store responses in sessionStorage so the
   * panel can be reopened without hitting the network again.
   */
  class AppDataClient {
    constructor() {
      /** @type {AbortController | null} */
      this.controller = null;
    }

    /**
     * Fetches and normalizes app data.
     * @param {string} appId
     * @param {boolean} [forceRefresh=false]
     * @returns {Promise<AppPayload>}
     */
    async fetch(appId, forceRefresh = false) {
      const cacheKey = `gds:store:${appId}`;
      if (!forceRefresh) {
        const cached = this.readCache(cacheKey);
        if (cached) {
          return cached;
        }
      }

      if (this.controller) {
        this.controller.abort();
      }
      this.controller = new AbortController();

      const url = new URL(STEAM_STORE_API);
      url.searchParams.set("appids", appId);
      url.searchParams.set("cc", "us");
      url.searchParams.set("l", "english");
      url.searchParams.set("filters", "basic,price_overview,package_groups,platforms,release_date,developers,publishers,dlc");

      const response = await fetch(url.toString(), {
        method: "GET",
        signal: this.controller.signal,
        credentials: "omit",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Steam Store API responded with ${response.status}`);
      }

      /** @type {Record<string, SteamApiResponse>} */
      const payload = await response.json();
      const entry = payload?.[appId];
      if (!entry?.success) {
        throw new Error("Steam Store API returned an empty response");
      }

      const normalized = AppDataClient.normalize(appId, entry.data);
      this.writeCache(cacheKey, normalized);
      return normalized;
    }

    /**
     * Reads JSON from the cache.
     * @param {string} key
     * @returns {AppPayload | null}
     */
    readCache(key) {
      try {
        const raw = window.sessionStorage.getItem(key);
        if (!raw) {
          return null;
        }
        return JSON.parse(raw);
      } catch (error) {
        console.warn("[GDS] Failed to read cache", error);
        return null;
      }
    }

    /**
     * Writes JSON to the cache.
     * @param {string} key
     * @param {AppPayload} value
     */
    writeCache(key, value) {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.warn("[GDS] Failed to write cache", error);
      }
    }

    /**
     * Normalizes the verbose store payload into a leaner structure.
     * @param {string} appId
     * @param {SteamApiResponse["data"]} data
     * @returns {AppPayload}
     */
    static normalize(appId, data) {
      const {
        name,
        type,
        release_date: releaseDate,
        price_overview: priceOverview,
        developers = [],
        publishers = [],
        package_groups: packageGroups = [],
        platforms = {},
        dlc = [],
      } = data ?? {};

      const packages = packageGroups.flatMap((group) => {
        if (!group?.subs) {
          return [];
        }
        return group.subs.map((entry) => ({
          id: String(entry.packageid),
          title: entry.title,
          price: entry.price_in_cents_with_discount / 100,
          discount: entry.discount_pct,
        }));
      });

      return {
        appId,
        name,
        type,
        releaseDate: releaseDate?.date,
        isReleased: releaseDate?.coming_soon === false,
        developers,
        publishers,
        priceOverview,
        platforms,
        dlc: dlc?.map(String) ?? [],
        packages,
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * SteamDB exposes a very rich HTML view with DLC, achievements and depots.
   * The scraper translates the DOM into structured data without relying on
   * undocumented XHR calls. The logic is heavily guarded and fails softly in
   * case the markup changes.
   */
  class SteamDbScraper {
    /**
     * Collects DLC entries from the current page.
     * @returns {Array<SteamDbDlcEntry>}
     */
    static collectDlc() {
      const rows = /** @type {NodeListOf<HTMLTableRowElement>} */ (
        document.querySelectorAll("#dlc table tbody tr")
      );
      const items = [];
      rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length === 0) {
          return;
        }
        const id = row.getAttribute("data-appid") ?? utils.text(cells[0]?.textContent);
        if (!id) {
          return;
        }
        const nameCell = cells[1] ?? cells[0];
        const nameLink = nameCell?.querySelector("a");
        const name = utils.text(nameLink?.textContent || nameCell?.textContent);
        items.push({
          id: id.trim(),
          name: name || `DLC ${id.trim()}`,
        });
      });
      return SteamDbScraper.deduplicate(items, (item) => item.id);
    }

    /**
     * Collects achievement metadata from the SteamDB achievements table.
     * @returns {Array<SteamDbAchievementEntry>}
     */
    static collectAchievements() {
      const rows = /** @type {NodeListOf<HTMLTableRowElement>} */ (
        document.querySelectorAll("#achievements table tbody tr")
      );
      const items = [];
      rows.forEach((row) => {
        const apiName = row.getAttribute("data-name") ?? utils.text(row.querySelector("td:nth-child(2)")?.textContent);
        if (!apiName) {
          return;
        }
        const displayName = utils.text(row.querySelector("td:nth-child(3)")?.textContent);
        const description = utils.text(row.querySelector("td:nth-child(4)")?.textContent);
        const icon = row.querySelector("img");
        items.push({
          name: apiName,
          displayName: displayName || apiName,
          description,
          icon: icon?.getAttribute("src") ?? "",
          iconGray: icon?.getAttribute("data-hover-src") ?? "",
        });
      });
      return SteamDbScraper.deduplicate(items, (item) => item.name);
    }

    /**
     * Collects depot metadata such as depot id, name and OS flags.
     * @returns {Array<SteamDbDepotEntry>}
     */
    static collectDepots() {
      const rows = /** @type {NodeListOf<HTMLTableRowElement>} */ (
        document.querySelectorAll("#depots table tbody tr")
      );
      const items = [];
      rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length === 0) {
          return;
        }
        const id = row.getAttribute("data-depotid") ?? utils.text(cells[0]?.textContent);
        if (!id) {
          return;
        }
        const nameCell = cells[1] ?? cells[0];
        const name = utils.text(nameCell?.textContent) || `Depot ${id.trim()}`;
        const manifests = utils.text(cells[2]?.textContent);
        const osList = utils.text(row.getAttribute("data-os"));
        items.push({
          id: id.trim(),
          name,
          manifests,
          osList,
        });
      });
      return SteamDbScraper.deduplicate(items, (item) => item.id);
    }

    /**
     * Helper that removes duplicates while keeping the first occurrence.
     *
     * @template T
     * @param {T[]} list
     * @param {(entry: T) => string} resolver
     * @returns {T[]}
     */
    static deduplicate(list, resolver) {
      const seen = new Set();
      const result = [];
      list.forEach((entry) => {
        const key = resolver(entry);
        if (!key || seen.has(key)) {
          return;
        }
        seen.add(key);
        result.push(entry);
      });
      return result;
    }
  }

  /**
   * Export helpers for formats that the original project popularized. These
   * exports are intentionally simple and can be extended by advanced users.
   */
  const exporters = {
    /**
     * Creates a tiny cream_api.ini configuration with the DLC list.
     * @param {string} appId
     * @param {Array<SteamDbDlcEntry | string>} dlcEntries
     */
    creamApi(appId, dlcEntries) {
      const body = Array.from(dlcEntries)
        .map((item, index) => {
          const id = typeof item === "string" ? item : item.id;
          const name = typeof item === "string" ? `DLC ${item}` : item.name;
          return `dlc${index + 1} = ${id} ; ${name}`;
        })
        .join("\n");
      return `; cream_api autogenerated by Get Data from Steam / SteamDB\n[steam]\nappid = ${appId}\n\n[dlc]\n${body}`;
    },

    /**
     * Builds an achievements ini compatible with Achievement Watcher.
     * @param {Array<SteamDbAchievementEntry>} achievements
     */
    achievementsIni(achievements) {
      const header = "[Achievements]";
      const lines = achievements.map((item) => `${item.name}=1`);
      return `${header}\n${lines.join("\n")}`;
    },

    /**
     * Converts achievements into a JSON payload.
     * @param {Array<SteamDbAchievementEntry>} achievements
     */
    achievementsJson(achievements) {
      return JSON.stringify(
        achievements.map((item) => ({
          name: item.name,
          displayName: item.displayName,
          description: item.description,
          icon: item.icon,
          iconGray: item.iconGray,
        })),
        null,
        2,
      );
    },

    /**
     * Provides a CSV compatible view of depots to simplify spreadsheet imports.
     * @param {Array<SteamDbDepotEntry>} depots
     */
    depotsCsv(depots) {
      const header = "depot_id,name,manifests,os_list";
      const rows = depots.map((depot) =>
        [depot.id, depot.name, depot.manifests, depot.osList]
          .map((value) => `"${value.replace(/"/g, '""')}"`)
          .join(","),
      );
      return [header, ...rows].join("\n");
    },
  };

  /**
   * The panel controller is responsible for rendering the floating UI. It keeps
   * the markup extremely small while remaining accessible and keyboard friendly.
   */
  class PanelController {
    constructor() {
      /** @type {HTMLDivElement} */
      this.root = this.ensureRoot();
    }

    /**
     * Ensures the floating panel exists once.
     * @returns {HTMLDivElement}
     */
    ensureRoot() {
      const existing = document.getElementById(PANEL_ID);
      if (existing) {
        return /** @type {HTMLDivElement} */ (existing);
      }

      this.injectStyles();

      const container = utils.createElement("div", {
        id: PANEL_ID,
      });
      container.setAttribute("role", "region");
      container.setAttribute("aria-label", "Get Data from Steam / SteamDB");

      document.body.append(container);
      return container;
    }

    /**
     * Appends the CSS only once. The palette intentionally supports both light
     * and dark pages by using semi transparent overlays.
     */
    injectStyles() {
      if (document.getElementById(`${PANEL_ID}-styles`)) {
        return;
      }
      const style = utils.createElement("style", {
        id: `${PANEL_ID}-styles`,
        textContent: `
          :root {
            color-scheme: light dark;
          }

          #${PANEL_ID} {
            position: fixed;
            inset-block-end: 1.5rem;
            inset-inline-end: 1.5rem;
            width: min(420px, calc(100vw - 2rem));
            padding: 1.25rem;
            border-radius: 16px;
            background: rgba(19, 26, 36, 0.88);
            color: #f5f7fa;
            font-family: "Inter", "Segoe UI", system-ui, sans-serif;
            box-shadow: 0 24px 60px rgba(5, 8, 12, 0.55);
            backdrop-filter: blur(18px);
            z-index: 2147483647;
            display: flex;
            flex-direction: column;
            gap: 1rem;
            transition: transform 0.3s ease, opacity 0.3s ease;
          }

          #${PANEL_ID}[data-hidden="true"] {
            opacity: 0.1;
            transform: translateY(12px);
            pointer-events: none;
          }

          #${PANEL_ID} button {
            appearance: none;
            border: none;
            cursor: pointer;
            border-radius: 10px;
            padding: 0.45rem 0.75rem;
            background: linear-gradient(120deg, #6a5acd, #4fb8ff);
            color: white;
            font-weight: 600;
            font-size: 0.8rem;
            transition: opacity 0.2s ease;
          }

          #${PANEL_ID} button[disabled] {
            opacity: 0.45;
            cursor: not-allowed;
          }

          #${PANEL_ID} button.secondary {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
          }

          #${PANEL_ID} header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1rem;
          }

          #${PANEL_ID} header h2 {
            font-size: 1.1rem;
            margin: 0;
          }

          #${PANEL_ID} dl {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 0.35rem 0.75rem;
            margin: 0;
          }

          #${PANEL_ID} dl dt {
            opacity: 0.6;
            font-size: 0.75rem;
          }

          #${PANEL_ID} dl dd {
            margin: 0;
            font-size: 0.85rem;
            letter-spacing: 0.02em;
          }

          #${PANEL_ID} details {
            background: rgba(0, 0, 0, 0.2);
            border-radius: 12px;
            padding: 0.75rem 0.85rem;
          }

          #${PANEL_ID} details summary {
            cursor: pointer;
            font-weight: 600;
            outline: none;
          }

          #${PANEL_ID} ul {
            list-style: none;
            margin: 0.75rem 0 0;
            padding: 0;
            max-height: 220px;
            overflow-y: auto;
            display: grid;
            gap: 0.35rem;
          }

          #${PANEL_ID} li {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            padding: 0.55rem 0.6rem;
            font-size: 0.82rem;
            line-height: 1.4;
          }

          #${PANEL_ID} footer {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 0.5rem;
          }

          #${PANEL_ID} .gds-meta {
            font-size: 0.8rem;
            opacity: 0.75;
          }

          #${PANEL_ID} .gds-error {
            background: rgba(255, 82, 82, 0.2);
            border: 1px solid rgba(255, 138, 128, 0.4);
            border-radius: 12px;
            padding: 0.75rem;
            font-size: 0.85rem;
          }

          #${PANEL_ID} .gds-grid {
            display: grid;
            gap: 0.35rem;
          }
        `,
      });
      document.head.append(style);
    }

    /**
     * Renders the entire panel state.
     * @param {PanelState} state
     */
    render(state) {
      this.root.replaceChildren();

      if (state.hidden) {
        this.root.dataset.hidden = "true";
      } else {
        delete this.root.dataset.hidden;
      }

      const header = utils.createElement("header");
      const title = utils.createElement("h2", {
        textContent: state.store?.name ? `${state.store.name} · ${state.appId}` : `App ${state.appId}`,
      });
      header.append(title);

      const toggle = utils.createElement("button", {
        type: "button",
        textContent: state.hidden ? "Show panel" : "Hide panel",
        className: "secondary",
      });
      toggle.addEventListener("click", () => {
        const nextHidden = !state.hidden;
        state.hidden = nextHidden;
        utils.setPanelVisibility(!nextHidden);
        this.render(state);
      });
      header.append(toggle);
      this.root.append(header);

      if (state.error) {
        const errorBox = utils.createElement("div", {
          className: "gds-error",
          textContent: state.error,
        });
        this.root.append(errorBox);
        return;
      }

      if (state.loading) {
        const loading = utils.createElement("p", {
          className: "gds-meta",
          textContent: "Collecting Steam data…",
        });
        this.root.append(loading);
      }

      if (state.store) {
        this.root.append(this.renderOverview(state));
      }

      if (state.dlc.length) {
        this.root.append(this.renderDlcSection(state));
      }

      if (state.achievements.length) {
        this.root.append(this.renderAchievementsSection(state));
      }

      if (state.depots.length) {
        this.root.append(this.renderDepotsSection(state));
      }

      const footer = this.renderFooter(state);
      this.root.append(footer);
    }

    /**
     * Overview summarizing store metadata.
     * @param {PanelState} state
     */
    renderOverview(state) {
      const details = utils.createElement("details", { open: true });
      details.append(utils.createElement("summary", { textContent: "Overview" }));
      const dl = utils.createElement("dl");
      const { store } = state;
      if (!store) {
        return details;
      }
      const entries = [
        ["App Type", store.type ?? "Unknown"],
        ["Release", `${utils.formatDate(store.releaseDate)}${store.isReleased ? "" : " (Coming soon)"}`],
        ["Price", utils.formatPrice(store.priceOverview)],
        ["Developers", store.developers?.join(", ") || "Unknown"],
        ["Publishers", store.publishers?.join(", ") || "Unknown"],
        ["Platforms", this.formatPlatforms(store.platforms)],
        ["Fetched", utils.formatDate(store.fetchedAt)],
      ];
      entries.forEach(([label, value]) => {
        dl.append(utils.createElement("dt", { textContent: label }));
        dl.append(utils.createElement("dd", { textContent: value }));
      });
      details.append(dl);
      return details;
    }

    /**
     * Renders the DLC section with export actions.
     * @param {PanelState} state
     */
    renderDlcSection(state) {
      const details = utils.createElement("details", { open: true });
      details.append(utils.createElement("summary", { textContent: `DLC (${state.dlc.length})` }));

      const list = utils.createElement("ul");
      state.dlc.slice(0, 250).forEach((entry) => {
        const li = utils.createElement("li");
        const id = typeof entry === "string" ? entry : entry.id;
        const name = typeof entry === "string" ? `DLC ${entry}` : entry.name;
        li.textContent = `${id} · ${name}`;
        list.append(li);
      });
      details.append(list);

      const actions = utils.createElement("div", { className: "gds-grid" });
      const copyIds = utils.createElement("button", {
        type: "button",
        textContent: "Copy DLC IDs",
      });
      copyIds.addEventListener("click", () => {
        const ids = state.dlc.map((entry) => (typeof entry === "string" ? entry : entry.id)).join(", ");
        utils.copy(ids || "");
      });

      const downloadCream = utils.createElement("button", {
        type: "button",
        textContent: "Download cream_api.ini",
      });
      downloadCream.addEventListener("click", () => {
        const contents = exporters.creamApi(state.appId, state.dlc);
        utils.download(`${state.appId}_cream_api.ini`, contents);
      });

      actions.append(copyIds, downloadCream);
      details.append(actions);
      return details;
    }

    /**
     * Renders achievements with copying helpers.
     * @param {PanelState} state
     */
    renderAchievementsSection(state) {
      const details = utils.createElement("details");
      details.append(utils.createElement("summary", { textContent: `Achievements (${state.achievements.length})` }));

      const list = utils.createElement("ul");
      state.achievements.slice(0, 250).forEach((achievement) => {
        const li = utils.createElement("li");
        li.textContent = `${achievement.name} · ${achievement.displayName}`;
        if (achievement.description) {
          li.append(utils.createElement("div", { className: "gds-meta", textContent: achievement.description }));
        }
        list.append(li);
      });
      details.append(list);

      const actions = utils.createElement("div", { className: "gds-grid" });
      const copyJson = utils.createElement("button", {
        type: "button",
        textContent: "Copy achievements JSON",
      });
      copyJson.addEventListener("click", () => {
        utils.copy(exporters.achievementsJson(state.achievements));
      });

      const downloadIni = utils.createElement("button", {
        type: "button",
        textContent: "Download achievements.ini",
      });
      downloadIni.addEventListener("click", () => {
        utils.download(`${state.appId}_achievements.ini`, exporters.achievementsIni(state.achievements));
      });

      actions.append(copyJson, downloadIni);
      details.append(actions);
      return details;
    }

    /**
     * Renders depots overview.
     * @param {PanelState} state
     */
    renderDepotsSection(state) {
      const details = utils.createElement("details");
      details.append(utils.createElement("summary", { textContent: `Depots (${state.depots.length})` }));

      const list = utils.createElement("ul");
      state.depots.slice(0, 250).forEach((depot) => {
        const li = utils.createElement("li");
        li.textContent = `${depot.id} · ${depot.name}`;
        const meta = utils.createElement("div", {
          className: "gds-meta",
          textContent: [depot.manifests, depot.osList].filter(Boolean).join(" · "),
        });
        li.append(meta);
        list.append(li);
      });
      details.append(list);

      const actions = utils.createElement("div", { className: "gds-grid" });
      const downloadCsv = utils.createElement("button", {
        type: "button",
        textContent: "Download depots.csv",
      });
      downloadCsv.addEventListener("click", () => {
        utils.download(`${state.appId}_depots.csv`, exporters.depotsCsv(state.depots));
      });

      actions.append(downloadCsv);
      details.append(actions);
      return details;
    }

    /**
     * Creates the footer with refresh capabilities.
     * @param {PanelState} state
     */
    renderFooter(state) {
      const footer = utils.createElement("footer");
      const refresh = utils.createElement("button", {
        type: "button",
        textContent: "Refresh data",
      });
      refresh.addEventListener("click", () => state.onRefresh?.());

      const copyJson = utils.createElement("button", {
        type: "button",
        textContent: "Copy store JSON",
      });
      copyJson.disabled = !state.store;
      copyJson.addEventListener("click", () => {
        if (state.store) {
          utils.copy(JSON.stringify(state.store, null, 2));
        }
      });

      footer.append(refresh, copyJson);
      return footer;
    }

    /**
     * Helper for platform string.
     * @param {{ windows?: boolean, mac?: boolean, linux?: boolean }} platforms
     */
    formatPlatforms(platforms) {
      if (!platforms) {
        return "Unknown";
      }
      const enabled = Object.entries(platforms)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key.charAt(0).toUpperCase() + key.slice(1));
      return enabled.length ? enabled.join(", ") : "Unknown";
    }
  }

  /**
   * Attempts to extract the appId from the current page by using multiple
   * strategies so both Steam and SteamDB URLs are supported.
   * @returns {string | null}
   */
  function detectAppId() {
    const direct = location.pathname.match(APP_PAGE_REGEX);
    if (direct) {
      return direct[1];
    }
    const url = new URL(location.href);
    const queryId = url.searchParams.get("appid");
    if (queryId) {
      return queryId;
    }
    const metaUrl = document.querySelector('meta[property="og:url"]')?.getAttribute("content");
    const metaMatch = metaUrl?.match(APP_PAGE_REGEX);
    if (metaMatch) {
      return metaMatch[1];
    }
    return null;
  }

  /**
   * Main entry point. Collects data, wires up observers and handles refreshes.
   */
  async function bootstrap() {
    const appId = detectAppId();
    const panel = new PanelController();
    const client = new AppDataClient();

    /** @type {PanelState} */
    const state = {
      appId: appId ?? "Unknown",
      store: null,
      dlc: [],
      achievements: [],
      depots: [],
      loading: true,
      hidden: !utils.getPanelVisibility(),
      error: null,
      onRefresh: async () => {
        state.loading = true;
        panel.render(state);
        try {
          const fresh = await client.fetch(state.appId, true);
          state.store = fresh;
          state.loading = false;
          panel.render(state);
        } catch (error) {
          state.error = error instanceof Error ? error.message : String(error);
          state.loading = false;
          panel.render(state);
        }
      },
    };

    if (!appId) {
      state.loading = false;
      state.error = "Unable to determine the Steam App ID for this page.";
      panel.render(state);
      return;
    }

    panel.render(state);

    try {
      const payload = await client.fetch(appId, false);
      state.store = payload;
      state.loading = false;
      panel.render(state);
    } catch (error) {
      state.loading = false;
      state.error = error instanceof Error ? error.message : String(error);
      panel.render(state);
    }

    if (location.hostname.endsWith(STEAMDB_HOST)) {
      const updateFromSteamDb = () => {
        const dlcEntries = SteamDbScraper.collectDlc();
        const achievements = SteamDbScraper.collectAchievements();
        const depots = SteamDbScraper.collectDepots();

        state.dlc = dlcEntries.length ? dlcEntries : state.store?.dlc ?? [];
        state.achievements = achievements;
        state.depots = depots;
        panel.render(state);
      };

      updateFromSteamDb();

      const observer = new MutationObserver(utils.debounce(() => {
        updateFromSteamDb();
      }, 200));
      observer.observe(document.body, { childList: true, subtree: true });
    } else if (state.store?.dlc?.length) {
      state.dlc = state.store.dlc;
      panel.render(state);
    }
  }

  /**
   * Type references (JSDoc) to keep the script self-documenting.
   * @typedef {Object} SteamApiResponse
   * @property {boolean} success
   * @property {SteamApiAppData} data
   *
   * @typedef {Object} SteamApiAppData
   * @property {string} [name]
   * @property {string} [type]
   * @property {{ date?: string, coming_soon?: boolean }} [release_date]
   * @property {{ final_formatted?: string }} [price_overview]
   * @property {string[]} [developers]
   * @property {string[]} [publishers]
   * @property {Array<{ subs?: Array<{ packageid: number, title: string, price_in_cents_with_discount: number, discount_pct: number }> }>} [package_groups]
   * @property {{ windows?: boolean, mac?: boolean, linux?: boolean }} [platforms]
   * @property {number[]} [dlc]
   *
   * @typedef {Object} AppPayload
   * @property {string} appId
   * @property {string} [name]
   * @property {string} [type]
   * @property {string} [releaseDate]
   * @property {boolean} [isReleased]
   * @property {{ final_formatted?: string }} [priceOverview]
   * @property {string[]} [developers]
   * @property {string[]} [publishers]
   * @property {{ windows?: boolean, mac?: boolean, linux?: boolean }} [platforms]
   * @property {string[]} [dlc]
   * @property {Array<{ id: string, title?: string, price?: number, discount?: number }>} [packages]
   * @property {string} fetchedAt
   *
   * @typedef {Object} SteamDbDlcEntry
   * @property {string} id
   * @property {string} name
   *
   * @typedef {Object} SteamDbAchievementEntry
   * @property {string} name
   * @property {string} displayName
   * @property {string} description
   * @property {string} icon
   * @property {string} iconGray
   *
   * @typedef {Object} SteamDbDepotEntry
   * @property {string} id
   * @property {string} name
   * @property {string} manifests
   * @property {string} osList
   *
   * @typedef {Object} PanelState
   * @property {string} appId
   * @property {AppPayload | null} store
   * @property {Array<SteamDbDlcEntry | string>} dlc
   * @property {SteamDbAchievementEntry[]} achievements
   * @property {SteamDbDepotEntry[]} depots
   * @property {boolean} loading
   * @property {boolean} hidden
   * @property {string | null} error
   * @property {() => void | Promise<void>} [onRefresh]
   */

  bootstrap().catch((error) => {
    console.error("[GDS] Fatal error", error);
  });
})();
