# Get Data from Steam / SteamDB (_ex Get DLC Info from SteamDB_)

[forum cs.rin.ru support](https://cs.rin.ru/forum/viewtopic.php?f=29&t=71837)

### **STATUS: DISCONTINUED.**

## Installation

1. Install a userscript manager:

   - **[Tampermonkey](https://tampermonkey.net)** _(CLOSED SOURCE)_
   - **[Violentmonkey](https://violentmonkey.github.io)** _(OPEN SOURCE)_

2. Install **[Get Data from Steam / SteamDB](dist/sak32009-get-data-from-steam-steamdb.user.js?raw=true)** userscript.

3. Visit [store.steampowered.com](https://store.steampowered.com/app/218620) or [steamdb.info](https://steamdb.info/app/218620)
   and look for the floating toolkit in the bottom-right corner.

### 2024 overhaul

- Fully rewritten userscript with no third-party runtime dependencies.
- Modern floating panel that summarises price, platform, DLC, depot and achievement data.
- SteamDB DOM scraper with debounced observers to pick up DLC, achievements and depot tables as they load.
- One-click exports for cream_api.ini, achievement watcher files, depot CSV and raw store JSON.
- Clipboard and download helpers that avoid blocking alerts and handle browsers without async clipboard support.

## Updating

The script should update automatically through your userscript manager. Alternatively, click the installation link again to get
the latest version.

## License

> **_Get Data from Steam / SteamDB_** is released under the following license: [MIT](LICENSE)
