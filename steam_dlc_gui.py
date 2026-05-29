#!/usr/bin/env python3
"""
Steam DLC Manager - GUI Application
Simple GUI for scanning Steam games and generating DLC configs
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
import threading
from pathlib import Path
from steam_dlc_manager import SteamDLCManager


class SteamDLCManagerGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Steam DLC Manager - Unified Tool")
        self.root.geometry("900x650")
        self.root.resizable(True, True)

        self.manager = SteamDLCManager()
        self.games_data = {}
        self.selected_games = []

        self._setup_ui()
        self._start_scan()

    def _setup_ui(self):
        """Setup the GUI layout"""
        # Header
        header_frame = ttk.Frame(self.root)
        header_frame.pack(fill=tk.X, padx=10, pady=10)

        title_label = ttk.Label(
            header_frame,
            text="Steam DLC Manager",
            font=("Arial", 16, "bold")
        )
        title_label.pack(side=tk.LEFT)

        subtitle_label = ttk.Label(
            header_frame,
            text="Scan Steam games • Fetch DLC • Generate CreamAPI/Goldberg configs",
            font=("Arial", 9)
        )
        subtitle_label.pack(side=tk.LEFT, padx=20)

        # Search frame
        search_frame = ttk.Frame(self.root)
        search_frame.pack(fill=tk.X, padx=10, pady=5)

        ttk.Label(search_frame, text="Search:").pack(side=tk.LEFT, padx=5)

        self.search_var = tk.StringVar()
        self.search_var.trace('w', self._on_search)

        search_entry = ttk.Entry(search_frame, textvariable=self.search_var, width=40)
        search_entry.pack(side=tk.LEFT, padx=5)

        ttk.Button(
            search_frame,
            text="Refresh Library",
            command=self._start_scan
        ).pack(side=tk.LEFT, padx=5)

        self.status_label = ttk.Label(search_frame, text="Ready", foreground="gray")
        self.status_label.pack(side=tk.RIGHT, padx=10)

        # Games list frame
        list_frame = ttk.LabelFrame(self.root, text="Installed Steam Games", padding=10)
        list_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        # Create Treeview with columns
        columns = ("appid", "name")
        self.tree = ttk.Treeview(list_frame, columns=columns, show='tree headings', selectmode='extended')

        self.tree.heading("#0", text="☑", anchor=tk.W)
        self.tree.heading("appid", text="AppID", anchor=tk.W)
        self.tree.heading("name", text="Game Name", anchor=tk.W)

        self.tree.column("#0", width=30, minwidth=30, stretch=False)
        self.tree.column("appid", width=80, minwidth=80, stretch=False)
        self.tree.column("name", width=500, minwidth=200, stretch=True)

        # Scrollbar
        scrollbar = ttk.Scrollbar(list_frame, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)

        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        # Bind selection
        self.tree.bind('<ButtonRelease-1>', self._on_tree_select)

        # Options frame
        options_frame = ttk.LabelFrame(self.root, text="Options", padding=10)
        options_frame.pack(fill=tk.X, padx=10, pady=5)

        # Output directory
        dir_frame = ttk.Frame(options_frame)
        dir_frame.pack(fill=tk.X, pady=5)

        ttk.Label(dir_frame, text="Output Directory:").pack(side=tk.LEFT, padx=5)

        self.output_dir_var = tk.StringVar(value="./output")
        ttk.Entry(dir_frame, textvariable=self.output_dir_var, width=40).pack(side=tk.LEFT, padx=5)

        ttk.Button(
            dir_frame,
            text="Browse...",
            command=self._browse_output_dir
        ).pack(side=tk.LEFT)

        # Action buttons
        action_frame = ttk.Frame(self.root)
        action_frame.pack(fill=tk.X, padx=10, pady=10)

        self.process_btn = ttk.Button(
            action_frame,
            text="Process Selected Games",
            command=self._process_selected,
            state=tk.DISABLED
        )
        self.process_btn.pack(side=tk.LEFT, padx=5)

        ttk.Button(
            action_frame,
            text="Process All Games",
            command=self._process_all
        ).pack(side=tk.LEFT, padx=5)

        ttk.Button(
            action_frame,
            text="Select All",
            command=self._select_all
        ).pack(side=tk.LEFT, padx=5)

        ttk.Button(
            action_frame,
            text="Clear Selection",
            command=self._clear_selection
        ).pack(side=tk.LEFT, padx=5)

        # Progress frame
        progress_frame = ttk.Frame(self.root)
        progress_frame.pack(fill=tk.X, padx=10, pady=5)

        self.progress = ttk.Progressbar(progress_frame, mode='indeterminate')
        self.progress.pack(fill=tk.X)

        # Log frame
        log_frame = ttk.LabelFrame(self.root, text="Log", padding=5)
        log_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        self.log_text = scrolledtext.ScrolledText(log_frame, height=8, wrap=tk.WORD, font=("Consolas", 9))
        self.log_text.pack(fill=tk.BOTH, expand=True)

    def _log(self, message: str, force_update: bool = False):
        """Add message to log (optimized to reduce UI LAG)"""
        self.log_text.insert(tk.END, message + "\n")
        self.log_text.see(tk.END)
        # Only force UI update when explicitly needed (reduces LAG)
        if force_update:
            self.root.update_idletasks()

    def _set_status(self, text: str, color: str = "gray", force_update: bool = False):
        """Update status label (optimized to reduce UI LAG)"""
        self.status_label.config(text=text, foreground=color)
        # Only force UI update when explicitly needed
        if force_update:
            self.root.update_idletasks()

    def _start_scan(self):
        """Start scanning Steam library"""
        self._set_status("Scanning Steam library...", "blue")
        self._log("Scanning Steam library...")
        self.progress.start()

        def scan_thread():
            try:
                self.games_data = self.manager.scan_games()
                self.root.after(0, self._populate_games_list)
            except Exception as e:
                self.root.after(0, lambda: self._log(f"❌ Error scanning: {e}"))
                self.root.after(0, lambda: self._set_status("Error", "red"))
            finally:
                self.root.after(0, self.progress.stop)

        threading.Thread(target=scan_thread, daemon=True).start()

    def _populate_games_list(self):
        """Populate the games treeview"""
        self.tree.delete(*self.tree.get_children())

        for app_id, game in sorted(self.games_data.items(), key=lambda x: x[1]['name']):
            self.tree.insert("", tk.END, iid=app_id, text="", values=(app_id, game['name']), tags=('unchecked',))

        count = len(self.games_data)
        self._log(f"✓ Found {count} installed games")
        self._set_status(f"{count} games found", "green")

    def _on_search(self, *args):
        """Filter games based on search query"""
        query = self.search_var.get().lower()

        for item in self.tree.get_children():
            values = self.tree.item(item)['values']
            app_id, name = values[0], values[1]

            if query in name.lower() or query in str(app_id):
                self.tree.reattach(item, '', tk.END)
            else:
                self.tree.detach(item)

    def _on_tree_select(self, event):
        """Handle tree item selection"""
        self.selected_games = self.tree.selection()
        count = len(self.selected_games)

        if count > 0:
            self.process_btn.config(state=tk.NORMAL)
            self._set_status(f"{count} game(s) selected", "blue")
        else:
            self.process_btn.config(state=tk.DISABLED)
            self._set_status("Ready", "gray")

    def _select_all(self):
        """Select all visible games"""
        for item in self.tree.get_children():
            self.tree.selection_add(item)
        self._on_tree_select(None)

    def _clear_selection(self):
        """Clear all selections"""
        self.tree.selection_remove(*self.tree.selection())
        self._on_tree_select(None)

    def _browse_output_dir(self):
        """Browse for output directory"""
        directory = filedialog.askdirectory(
            title="Select Output Directory",
            initialdir=self.output_dir_var.get()
        )
        if directory:
            self.output_dir_var.set(directory)

    def _process_selected(self):
        """Process selected games"""
        if not self.selected_games:
            messagebox.showwarning("No Selection", "Please select at least one game")
            return

        self._process_games(self.selected_games)

    def _process_all(self):
        """Process all games"""
        if not self.games_data:
            messagebox.showwarning("No Games", "No games found. Please scan library first.")
            return

        confirm = messagebox.askyesno(
            "Confirm",
            f"Process all {len(self.games_data)} games?\n\nThis may take a while."
        )

        if confirm:
            self._process_games(list(self.games_data.keys()))

    def _process_games(self, app_ids: list):
        """Process list of game AppIDs"""
        output_dir = self.output_dir_var.get()

        self._set_status("Processing games...", "blue")
        self.progress.start()
        self.process_btn.config(state=tk.DISABLED)

        def process_thread():
            success_count = 0
            total = len(app_ids)

            for idx, app_id in enumerate(app_ids, 1):
                game = self.games_data.get(app_id)
                if not game:
                    continue

                self.root.after(0, lambda i=idx, t=total: self._set_status(
                    f"Processing {i}/{t}...", "blue"
                ))

                self.root.after(0, lambda g=game: self._log(
                    f"\n[{idx}/{total}] Processing: {g['name']} (AppID: {app_id})"
                ))

                try:
                    # Fetch DLC
                    self.root.after(0, lambda: self._log("  Fetching DLC information..."))
                    dlc_list = self.manager.api_client.get_dlc_list(app_id)

                    if not dlc_list:
                        self.root.after(0, lambda: self._log("  ⚠ No DLC found"))
                        continue

                    self.root.after(0, lambda c=len(dlc_list): self._log(f"  ✓ Found {c} DLC items"))

                    # Generate configs
                    from steam_dlc_manager import ConfigGenerator
                    saved_files = ConfigGenerator.save_configs(
                        app_id, game['name'], dlc_list, Path(output_dir)
                    )

                    self.root.after(0, lambda f=saved_files: self._log(
                        f"  ✓ Saved {len(f)} config files"
                    ))

                    success_count += 1

                except Exception as e:
                    self.root.after(0, lambda err=e: self._log(f"  ❌ Error: {err}"))

            # Complete
            self.root.after(0, lambda s=success_count, t=total: self._log(
                f"\n=== Complete ===\nSuccessfully processed {s}/{t} games"
            ))
            self.root.after(0, lambda s=success_count, t=total: messagebox.showinfo(
                "Complete",
                f"Successfully processed {s}/{t} games\n\nFiles saved to: {output_dir}"
            ))
            self.root.after(0, lambda: self._set_status("Complete", "green"))
            self.root.after(0, self.progress.stop)
            self.root.after(0, lambda: self.process_btn.config(state=tk.NORMAL))

        threading.Thread(target=process_thread, daemon=True).start()


def main():
    root = tk.Tk()
    app = SteamDLCManagerGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
