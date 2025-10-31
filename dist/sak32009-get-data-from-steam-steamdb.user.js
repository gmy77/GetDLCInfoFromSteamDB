// ==UserScript==
// @name         Get Data from Steam / SteamDB
// @namespace    modernized-get-data-from-steam
// @version      2024.07.01
// @author       Modernized by OpenAI Assistant
// @description  Collect DLC, package, and pricing information from Steam and SteamDB using modern browser APIs.
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
// @updatedAt    Mon, 01 Jul 2024 12:00:00 GMT
// ==/UserScript==

(() => {
  "use strict";

  /**
   * Application level constants used across the script.
   */
  const APP_PAGE_REGEX = /\/app\/(\d+)/u;
  const STEAM_STORE_API = "https://store.steampowered.com/api/appdetails";
  const PANEL_ID = "steam-data-toolkit";
  const PANEL_OPEN_KEY = "steam-data-toolkit:is-open";
  const PANEL_ANCHOR = "steam-data-toolkit-anchor";

  /**
   * Basic utility helpers that keep the main workflow clean and readable.
   */
  const utils = {
    /**
     * Safe wrapper around sessionStorage to avoid quota errors in private browsing.
     * @param {string} key
     * @returns {string | null}
     */
    getSessionValue(key) {
      try {
        return window.sessionStorage.getItem(key);
      } catch (error) {
        console.warn("[Steam Data Toolkit] Unable to read sessionStorage", error);
        return null;
      }
    },

    /**
     * Persists a value inside sessionStorage while gracefully handling edge cases.
     * @param {string} key
     * @param {string} value
     */
    setSessionValue(key, value) {
      try {
        window.sessionStorage.setItem(key, value);
      } catch (error) {
        console.warn("[Steam Data Toolkit] Unable to write sessionStorage", error);
      }
    },

    /**
     * Creates an HTML element with optional properties in a declarative way.
     * @template {keyof HTMLElementTagNameMap} T
     * @param {T} tagName
     * @param {Partial<HTMLElementTagNameMap[T]>} options
     * @returns {HTMLElementTagNameMap[T]}
     */
    createElement(tagName, options = {}) {
      const element = document.createElement(tagName);
      Object.assign(element, options);
      return element;
    },

    /**
     * Formats dates using the browser's locale-aware formatter.
     * @param {string | undefined} rawDate
     * @returns {string}
     */
    formatDate(rawDate) {
      if (!rawDate) {
        return "Unknown";
      }
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) {
        return rawDate;
      }
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
      }).format(date);
    },

    /**
     * Formats currency values using the user's locale. If the price object is missing,
     * a fallback message is returned instead of throwing an exception.
     * @param {{ final_formatted?: string }} priceOverview
     * @returns {string}
     */
    formatPrice(priceOverview) {
      if (!priceOverview) {
        return "Unavailable";
      }
      if (priceOverview.final_formatted) {
        return priceOverview.final_formatted;
      }
      return "Unavailable";
    },

    /**
     * Attempts to copy text to the clipboard using the asynchronous Clipboard API,
     * falling back to the classic textarea trick if necessary.
     * @param {string} value
     */
    async copyToClipboard(value) {
      try {
        await navigator.clipboard.writeText(value);
        alert("Copied to clipboard ✔");
      } catch (error) {
        console.warn("[Steam Data Toolkit] Clipboard API failed, using fallback", error);
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
        alert("Copied to clipboard ✔");
      }
    },

    /**
     * Builds a downloadable blob so that the user can persist the collected data locally.
     * @param {string} filename
     * @param {string} contents
     */
    triggerDownload(filename, contents) {
      const blob = new Blob([contents], { type: "application/json" });
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
     * Utility that clamps an array to avoid overwhelming the UI when an app ships
     * with hundreds of DLC items.
     * @template T
     * @param {T[]} list
     * @param {number} maxEntries
     * @returns {T[]}
     */
    clamp(list, maxEntries = 200) {
      if (!Array.isArray(list)) {
        return [];
      }
      if (list.length <= maxEntries) {
        return list;
      }
      console.warn(`Truncating list to ${maxEntries} entries for readability.`);
      return list.slice(0, maxEntries);
    },
  };

  /**
   * Responsible for retrieving raw app data from the Steam Storefront API.
   * Uses AbortController so users can refresh requests without waiting for timeouts.
   */
  class AppDataClient {
    constructor() {
      /** @type {AbortController | null} */
      this.controller = null;
    }

    /**
     * Fetches metadata for a given app id.
     * @param {string} appId
     * @param {boolean} [forceRefresh=false]
     * @returns {Promise<AppPayload>}
     */
    async fetchApp(appId, forceRefresh = false) {
      const cacheKey = `steam-app:${appId}`;
      if (!forceRefresh) {
        const cached = utils.getSessionValue(cacheKey);
        if (cached) {
          try {
            return JSON.parse(cached);
          } catch (error) {
            console.warn("[Steam Data Toolkit] Unable to parse cache", error);
          }
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
      url.searchParams.set("filters", "basic,package_groups,price_overview,platforms,release_date,developers,publishers,dlc");

      const response = await fetch(url.toString(), {
        method: "GET",
        credentials: "omit",
        signal: this.controller.signal,
        headers: {
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Steam Store API responded with ${response.status}`);
      }

      /** @type {Record<string, SteamApiResponse>} */
      const payload = await response.json();
      const appResponse = payload?.[appId];

      if (!appResponse?.success) {
        throw new Error("Steam Store API returned an unsuccessful response");
      }

      const normalized = AppDataClient.normalize(appId, appResponse.data);
      utils.setSessionValue(cacheKey, JSON.stringify(normalized));
      return normalized;
    }

    /**
     * Normalizes the verbose Steam API payload into a smaller, easier to consume structure.
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
        dlc = [],
        package_groups: packageGroups = [],
        platforms = {},
      } = data ?? {};

      const normalizedPackages = packageGroups.flatMap((group) => {
        if (!group?.subs) {
          return [];
        }
        return group.subs.map((sub) => ({
          id: sub.packageid,
          title: sub.title,
          price: sub.price_in_cents_with_discount / 100,
          discount: sub.discount_pct,
        }));
      });

      return {
        appId,
        name,
        type,
        releaseDate: releaseDate?.date,
        isReleased: Boolean(releaseDate?.coming_soon === false),
        developers,
        publishers,
        priceOverview,
        platforms,
        dlc,
        packages: normalizedPackages,
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Manages rendering the floating panel and keeping it in sync with fetched data.
   */
  class PanelController {
    constructor() {
      this.root = null;
    }

    /**
     * Ensures the panel is inserted into the DOM. Subsequent calls simply return the root element.
     * @returns {HTMLDivElement}
     */
    ensureRoot() {
      if (this.root) {
        return this.root;
      }

      const existing = document.getElementById(PANEL_ID);
      if (existing) {
        this.root = existing;
        return existing;
      }

      this.injectStyles();

      const anchor = utils.createElement("div", { id: PANEL_ANCHOR });
      document.body.append(anchor);

      const panel = utils.createElement("div", {
        id: PANEL_ID,
      });
      anchor.append(panel);
      this.root = panel;
      return panel;
    }

    /**
     * Injects component specific styles using a modern CSS reset and design tokens for easy customization.
     */
    injectStyles() {
      if (document.getElementById(`${PANEL_ID}-styles`)) {
        return;
      }

      const style = utils.createElement("style", {
        id: `${PANEL_ID}-styles`,
        textContent: `
          :root {
            color-scheme: dark light;
          }

          #${PANEL_ANCHOR} {
            position: fixed;
            inset-block-end: 1.5rem;
            inset-inline-end: 1.5rem;
            z-index: 2147483647;
          }

          #${PANEL_ID} {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: color-mix(in srgb, #10131a 80%, transparent);
            border-radius: 12px;
            border: 1px solid color-mix(in srgb, #5a6b8a 50%, transparent);
            box-shadow: 0 20px 45px rgba(12, 13, 18, 0.45);
            padding: 1.2rem;
            width: min(380px, calc(100vw - 2rem));
            color: #f7f9fc;
            backdrop-filter: blur(18px);
            transition: transform 0.35s ease, opacity 0.35s ease;
            transform-origin: bottom right;
          }

          #${PANEL_ID}[data-hidden="true"] {
            opacity: 0.1;
            transform: scale(0.92);
            pointer-events: none;
          }

          #${PANEL_ID} header {
            display: flex;
            justify-content: space-between;
            gap: 0.6rem;
            align-items: center;
            margin-bottom: 0.9rem;
          }

          #${PANEL_ID} header h2 {
            margin: 0;
            font-size: 1.05rem;
            font-weight: 600;
            letter-spacing: 0.01em;
          }

          #${PANEL_ID} header button {
            appearance: none;
            border: 0;
            background: color-mix(in srgb, #0084ff 65%, #001a33 35%);
            color: white;
            padding: 0.35rem 0.65rem;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.8rem;
            transition: background 0.2s ease;
          }

          #${PANEL_ID} header button:hover {
            background: color-mix(in srgb, #4ca2ff 80%, #001a33 20%);
          }

          #${PANEL_ID} section {
            margin-block: 0.75rem;
          }

          #${PANEL_ID} section h3 {
            margin: 0 0 0.35rem;
            font-size: 0.9rem;
            opacity: 0.8;
          }

          #${PANEL_ID} ul {
            list-style: none;
            margin: 0;
            padding: 0;
            display: grid;
            gap: 0.4rem;
            max-height: 240px;
            overflow-y: auto;
          }

          #${PANEL_ID} li {
            background: color-mix(in srgb, #1a2333 70%, transparent);
            padding: 0.5rem 0.6rem;
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            gap: 0.15rem;
          }

          #${PANEL_ID} li span:first-child {
            font-weight: 600;
          }

          #${PANEL_ID} footer {
            display: grid;
            gap: 0.5rem;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            margin-top: 0.75rem;
          }

          #${PANEL_ID} footer button {
            appearance: none;
            border: 0;
            padding: 0.45rem 0.6rem;
            border-radius: 8px;
            background: color-mix(in srgb, #00c985 65%, #002619 35%);
            color: white;
            cursor: pointer;
            font-size: 0.8rem;
            transition: background 0.2s ease;
          }

          #${PANEL_ID} footer button:hover {
            background: color-mix(in srgb, #2bdc9b 80%, #002619 20%);
          }

          #${PANEL_ID} .steam-data-meta {
            display: grid;
            gap: 0.2rem;
            font-size: 0.85rem;
          }

          #${PANEL_ID} .steam-data-meta strong {
            font-weight: 600;
          }

          #${PANEL_ID} .steam-data-error {
            color: #ff8f9c;
            font-size: 0.85rem;
          }
        `,
      });

      document.head.append(style);
    }

    /**
     * Renders the current state of the data inside the floating panel.
     * @param {AppPayload | null} payload
     * @param {PanelState} state
     */
    render(payload, state) {
      const root = this.ensureRoot();

      if (state.hidden) {
        root.dataset.hidden = "true";
      } else {
        delete root.dataset.hidden;
      }

      const header = utils.createElement("header");
      const title = utils.createElement("h2", {
        textContent: payload ? `${payload.name} · ${payload.appId}` : "Steam Data Toolkit",
      });

      const toggleButton = utils.createElement("button", {
        type: "button",
        textContent: state.hidden ? "Show" : "Hide",
        title: "Toggle panel visibility",
      });
      toggleButton.addEventListener("click", () => {
        const nextHidden = !state.hidden;
        state.hidden = nextHidden;
        utils.setSessionValue(PANEL_OPEN_KEY, JSON.stringify(!nextHidden));
        this.render(payload, state);
      });
      header.append(title, toggleButton);

      root.replaceChildren(header);

      if (state.error) {
        const errorParagraph = utils.createElement("p", {
          className: "steam-data-error",
          textContent: state.error,
        });
        root.append(errorParagraph);
        return;
      }

      if (!payload) {
        const emptyState = utils.createElement("p", {
          className: "steam-data-meta",
          textContent: "Waiting for Steam app information…",
        });
        root.append(emptyState);
        return;
      }

      const metaSection = utils.createElement("section");
      metaSection.append(
        createMetaLine("App Type", payload.type ?? "Unknown"),
        createMetaLine("Release", `${utils.formatDate(payload.releaseDate)}${payload.isReleased ? "" : " (Coming Soon)"}`),
        createMetaLine("Platforms", formatPlatforms(payload.platforms)),
        createMetaLine("Price", utils.formatPrice(payload.priceOverview)),
        createMetaLine("Developers", payload.developers?.join(", ") || "Unknown"),
        createMetaLine("Publishers", payload.publishers?.join(", ") || "Unknown"),
        createMetaLine("Fetched", utils.formatDate(payload.fetchedAt)),
      );
      root.append(metaSection);

      if (payload.dlc?.length) {
        root.append(this.createListSection("Downloadable Content", payload.dlc.map((id) => ({
          id,
          label: `DLC ID: ${id}`,
        }))));
      }

      if (payload.packages?.length) {
        const packageEntries = payload.packages.map((pkg) => ({
          id: pkg.id,
          label: pkg.title ?? `Package ${pkg.id}`,
          price: pkg.price,
          discount: pkg.discount,
        }));
        root.append(this.createListSection("Packages", packageEntries));
      }

      const footer = utils.createElement("footer");
      const jsonButton = utils.createElement("button", {
        type: "button",
        textContent: "Copy JSON",
      });
      jsonButton.addEventListener("click", () => utils.copyToClipboard(JSON.stringify(payload, null, 2)));

      const dlcButton = utils.createElement("button", {
        type: "button",
        textContent: "Copy DLC IDs",
      });
      dlcButton.disabled = !payload.dlc?.length;
      dlcButton.addEventListener("click", () => {
        if (!payload.dlc?.length) {
          alert("No DLC information available for this title.");
          return;
        }
        utils.copyToClipboard(payload.dlc.join(", "));
      });

      const downloadButton = utils.createElement("button", {
        type: "button",
        textContent: "Download JSON",
      });
      downloadButton.addEventListener("click", () => {
        utils.triggerDownload(`${payload.appId}-steam-data.json`, JSON.stringify(payload, null, 2));
      });

      const refreshButton = utils.createElement("button", {
        type: "button",
        textContent: "Refresh",
      });
      refreshButton.addEventListener("click", state.onRefresh ?? (() => {}));

      footer.append(jsonButton, dlcButton, downloadButton, refreshButton);
      root.append(footer);
    }

    /**
     * Creates a reusable meta information line used in the header section.
     * @param {string} label
     * @param {string} value
     * @returns {HTMLParagraphElement}
     */
    createMetaLine(label, value) {
      return createMetaLine(label, value);
    }

    /**
     * Generates a list section for DLC and package data, automatically clamping
     * the number of entries displayed to keep the UI responsive.
     * @param {string} title
     * @param {Array<{ id: number | string, label: string, price?: number, discount?: number }>} items
     * @returns {HTMLElement}
     */
    createListSection(title, items) {
      const section = utils.createElement("section");
      const heading = utils.createElement("h3", { textContent: title });
      const list = utils.createElement("ul");

      utils.clamp(items).forEach((item) => {
        const entry = utils.createElement("li");
        entry.append(
          utils.createElement("span", { textContent: `${item.label}` }),
        );

        if (item.price !== undefined) {
          entry.append(utils.createElement("span", {
            textContent: `Price: ${item.price.toFixed(2)} (Discount: ${item.discount ?? 0}%)`,
          }));
        }

        list.append(entry);
      });

      section.append(heading, list);
      return section;
    }
  }

  /**
   * Helper factory that returns a formatted paragraph for metadata display.
   * @param {string} label
   * @param {string} value
   * @returns {HTMLParagraphElement}
   */
  function createMetaLine(label, value) {
    const paragraph = utils.createElement("p", { className: "steam-data-meta" });
    const strong = utils.createElement("strong", { textContent: `${label}:` });
    paragraph.append(strong, document.createTextNode(` ${value}`));
    return paragraph;
  }

  /**
   * Formats the platform availability section in a reader friendly way.
   * @param {{ windows?: boolean, mac?: boolean, linux?: boolean }} platforms
   */
  function formatPlatforms(platforms) {
    if (!platforms) {
      return "Unknown";
    }
    const available = Object.entries(platforms)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([name]) => name.charAt(0).toUpperCase() + name.slice(1));
    return available.length ? available.join(", ") : "Unknown";
  }

  /**
   * Discovers the relevant Steam App ID from the current page.
   * Handles Steam store, SteamDB app pages, and gracefully informs the user when the script
   * cannot operate on the current page.
   * @returns {string | null}
   */
  function detectAppId() {
    const directMatch = location.pathname.match(APP_PAGE_REGEX);
    if (directMatch) {
      return directMatch[1];
    }

    const url = new URL(location.href);
    const appIdParam = url.searchParams.get("appid");
    if (appIdParam) {
      return appIdParam;
    }

    const ogUrl = document.querySelector('meta[property="og:url"]')?.getAttribute("content");
    const ogMatch = ogUrl?.match(APP_PAGE_REGEX);
    if (ogMatch) {
      return ogMatch[1];
    }

    const appLink = document.querySelector('a[href*="store.steampowered.com/app/"]');
    const linkMatch = appLink?.getAttribute("href")?.match(APP_PAGE_REGEX);
    if (linkMatch) {
      return linkMatch[1];
    }

    return null;
  }

  /**
   * Boots the script, orchestrating detection, data retrieval, and rendering.
   */
  async function bootstrap() {
    const appId = detectAppId();
    const panel = new PanelController();
    const client = new AppDataClient();

    const isPanelOpen = (() => {
      const stored = utils.getSessionValue(PANEL_OPEN_KEY);
      if (stored === null) {
        return true;
      }
      try {
        return JSON.parse(stored);
      } catch (error) {
        return true;
      }
    })();

    /** @type {PanelState} */
    const state = {
      hidden: !isPanelOpen,
      error: null,
      onRefresh: async () => {
        state.error = null;
        panel.render(null, state);
        try {
          const payload = await client.fetchApp(appId, true);
          panel.render(payload, state);
        } catch (error) {
          console.error("[Steam Data Toolkit] Refresh failed", error);
          state.error = error instanceof Error ? error.message : String(error);
          panel.render(null, state);
        }
      },
    };

    if (!appId) {
      state.error = "Unable to identify a Steam App ID on this page.";
      panel.render(null, state);
      return;
    }

    panel.render(null, state);

    try {
      const payload = await client.fetchApp(appId, false);
      panel.render(payload, state);
    } catch (error) {
      console.error("[Steam Data Toolkit] Initial fetch failed", error);
      state.error = error instanceof Error ? error.message : String(error);
      panel.render(null, state);
    }
  }

  /**
   * Definitions for JSDoc type references used across the file. They live in the same
   * file to avoid the need for a build step while keeping type annotations precise.
   * @typedef {Object} SteamApiResponse
   * @property {boolean} success
   * @property {SteamAppData} data
   *
   * @typedef {Object} SteamAppData
   * @property {string} name
   * @property {string} type
   * @property {{ date: string, coming_soon: boolean }} [release_date]
   * @property {{ final_formatted: string }} [price_overview]
   * @property {string[]} [developers]
   * @property {string[]} [publishers]
   * @property {number[]} [dlc]
   * @property {Array<{ subs: Array<{ packageid: number, price_in_cents_with_discount: number, title: string, discount_pct: number }> }>} [package_groups]
   * @property {{ windows?: boolean, mac?: boolean, linux?: boolean }} [platforms]
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
   * @property {number[]} [dlc]
   * @property {Array<{ id: number, title: string, price: number, discount: number }>} [packages]
   * @property {{ windows?: boolean, mac?: boolean, linux?: boolean }} [platforms]
   * @property {string} fetchedAt
   *
   * @typedef {Object} PanelState
   * @property {boolean} hidden
   * @property {string | null} error
   * @property {() => void | Promise<void>} [onRefresh]
   */

  bootstrap().catch((error) => {
    console.error("[Steam Data Toolkit] Bootstrap failure", error);
  });
})();
