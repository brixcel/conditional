/**
 * shared.js - Shared Navigation & Academic UI Utilities
 * Data Structures & Algorithms Educational Suite
 */

(function () {
    // Clean SVG icon system (replacing casual emojis with professional vector geometry)
    const SVG_ICONS = {
        overview: `<svg class="nav-svg-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>`,
        stack: `<svg class="nav-svg-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 10 5-10 5L2 7l10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>`,
        regularQueue: `<svg class="nav-svg-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="5" height="10" rx="1"/><rect x="9.5" y="7" width="5" height="10" rx="1"/><rect x="17" y="7" width="5" height="10" rx="1"/><path d="M2 12h20"/><polyline points="18 8 22 12 18 16"/></svg>`,
        circularQueue: `<svg class="nav-svg-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>`,
        priorityQueue: `<svg class="nav-svg-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
        singlyList: `<svg class="nav-svg-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="3"/><circle cx="19" cy="12" r="3"/><line x1="8" y1="12" x2="16" y2="12"/><polyline points="13 9 16 12 13 15"/></svg>`,
        doublyList: `<svg class="nav-svg-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="12" r="2.5"/><circle cx="20" cy="12" r="2.5"/><line x1="6.5" y1="10" x2="17.5" y2="10"/><polyline points="15 7 17.5 10 15 13"/><line x1="17.5" y1="14" x2="6.5" y2="14"/><polyline points="9 11 6.5 14 9 17"/></svg>`,
        circularList: `<svg class="nav-svg-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.5"/><circle cx="19" cy="16" r="2.5"/><circle cx="5" cy="16" r="2.5"/><path d="M14.5 6.5l3 6.5"/><path d="M16.5 17.5l-9 0"/><path d="M6.5 13.5l3.5-6.5"/></svg>`,
        avlTree: `<svg class="nav-svg-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M10 6.5 7.5 15.5"/><path d="M14 6.5 16.5 15.5"/></svg>`,
        sorting: `<svg class="nav-svg-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="20" x2="5" y2="14"/><line x1="10" y1="20" x2="10" y2="10"/><line x1="15" y1="20" x2="15" y2="7"/><line x1="20" y1="20" x2="20" y2="4"/></svg>`,
        bst: `<svg class="nav-svg-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.5"/><circle cx="6" cy="13" r="2.5"/><circle cx="18" cy="13" r="2.5"/><circle cx="14" cy="20" r="2.5"/><line x1="10.4" y1="6.9" x2="7.5" y2="11"/><line x1="13.6" y1="6.9" x2="16.5" y2="11"/><line x1="16.9" y1="15.2" x2="15.1" y2="17.8"/></svg>`,
        trie: `<svg class="nav-svg-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="4" cy="20" r="2"/><circle cx="10" cy="20" r="2"/><circle cx="18" cy="20" r="2"/><line x1="10.8" y1="5.6" x2="7.2" y2="10.4"/><line x1="13.2" y1="5.6" x2="16.8" y2="10.4"/><line x1="5.5" y1="14" x2="4.5" y2="18"/><line x1="7" y1="13.8" x2="9.1" y2="18.2"/><line x1="18" y1="14" x2="18" y2="18"/></svg>`,
        heap: `<svg class="nav-svg-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><line x1="10.5" y1="7.5" x2="7.5" y2="15.5"/><line x1="13.5" y1="7.5" x2="16.5" y2="15.5"/></svg>`,
        hashTable: `<svg class="nav-svg-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`,
        searching: `<svg class="nav-svg-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
        menu: `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>`,
        sun: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`,
        moon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
        close: `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
    };

    // ---- Theme -------------------------------------------------------------
    // main.css follows the OS setting by default. `data-theme` on <html> is set
    // only after the user picks a theme, and that choice is remembered.
    const THEME_KEY = "dsa-theme";
    const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

    function readStoredTheme() {
        try {
            const value = localStorage.getItem(THEME_KEY);
            return value === "light" || value === "dark" ? value : null;
        } catch (e) {
            return null; // storage blocked (private mode, file://, etc.)
        }
    }

    function storeTheme(value) {
        try { localStorage.setItem(THEME_KEY, value); } catch (e) { /* not remembered, still applied */ }
    }

    function currentTheme() {
        return readStoredTheme() || (darkQuery && darkQuery.matches ? "dark" : "light");
    }

    const storedTheme = readStoredTheme();
    if (storedTheme) document.documentElement.setAttribute("data-theme", storedTheme);

    function initThemeToggle(afterEl) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = "themeToggle";
        btn.className = "theme-toggle-btn";
        btn.setAttribute("aria-label", "Dark theme");

        function render() {
            const isDark = currentTheme() === "dark";
            btn.setAttribute("aria-pressed", String(isDark));
            btn.title = isDark ? "Switch to light theme" : "Switch to dark theme";
            btn.innerHTML = isDark ? SVG_ICONS.sun : SVG_ICONS.moon;
        }

        btn.addEventListener("click", function () {
            const next = currentTheme() === "dark" ? "light" : "dark";
            document.documentElement.setAttribute("data-theme", next);
            storeTheme(next);
            render();
        });

        // With no saved choice the page follows the OS, so keep the button in sync.
        if (darkQuery) {
            const onChange = function () { if (!readStoredTheme()) render(); };
            if (darkQuery.addEventListener) darkQuery.addEventListener("change", onChange);
            else if (darkQuery.addListener) darkQuery.addListener(onChange);
        }

        render();
        afterEl.after(btn);
    }

    // ---- Skip link -----------------------------------------------------------
    function initSkipLink(target) {
        if (!target || document.querySelector(".skip-link")) return;
        if (!target.id) target.id = "main-content";
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");

        const link = document.createElement("a");
        link.className = "skip-link";
        link.href = "#" + target.id;
        link.textContent = "Skip to main content";
        link.addEventListener("click", function (e) {
            e.preventDefault();
            target.focus({ preventScroll: true });
            target.scrollIntoView({ block: "start" });
        });
        document.body.prepend(link); // first Tab stop on the page
    }

    const navCategories = [
        {
            category: "General",
            items: [
                { label: "Overview & Dashboard", href: "index.html", iconKey: "overview" }
            ]
        },
        {
            category: "Linear Structures",
            items: [
                { label: "Stack (LIFO)", href: "stack.html", iconKey: "stack" },
                { label: "Regular Queue (FIFO)", href: "regular-queue.html", iconKey: "regularQueue" },
                { label: "Circular Queue", href: "circular-queue.html", iconKey: "circularQueue" },
                { label: "Priority Queue", href: "priority-queue.html", iconKey: "priorityQueue" }
            ]
        },
        {
            category: "Linked Lists",
            items: [
                { label: "Singly Linked List", href: "singly-linked-list.html", iconKey: "singlyList" },
                { label: "Doubly Linked List", href: "doubly-linked-list.html", iconKey: "doublyList" },
                { label: "Circular Linked List", href: "circular-linked-list.html", iconKey: "circularList" }
            ]
        },
        {
            category: "Tree Structures",
            items: [
                { label: "AVL Tree (Self-Balancing)", href: "avl-tree.html", iconKey: "avlTree" },
                { label: "Binary Heap (Min / Max)", href: "heap.html", iconKey: "heap" },
                { label: "Binary Search Tree (BST)", href: "bst.html", iconKey: "bst" },
                { label: "Trie (Prefix Tree)", href: "trie.html", iconKey: "trie" }
            ]
        },
        {
            category: "Hashing",
            items: [
                { label: "Hash Table", href: "hash-table.html", iconKey: "hashTable" }
            ]
        },
        {
            category: "Algorithms",
            items: [
                { label: "Sorting Algorithms", href: "sorting.html", iconKey: "sorting" },
                { label: "Searching Algorithms", href: "searching.html", iconKey: "searching" }
            ]
        }
    ];

    function initNavigation() {
        const currentPath = window.location.pathname;
        const currentPage = currentPath.substring(currentPath.lastIndexOf("/") + 1) || "index.html";

        // Create overlay
        let overlay = document.getElementById("navOverlay") || document.getElementById("overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "navOverlay";
            overlay.className = "nav-overlay";
            document.body.appendChild(overlay);
        } else {
            overlay.className = "nav-overlay";
        }

        // Create sidebar
        let sidebar = document.getElementById("sideNavbar");
        if (!sidebar) {
            sidebar = document.createElement("nav");
            sidebar.id = "sideNavbar";
            sidebar.className = "side-navbar";
            document.body.prepend(sidebar);
        } else {
            sidebar.className = "side-navbar";
        }

        let navHtml = `
            <div class="side-navbar-header">
                <div class="side-navbar-brand-wrap">
                    <svg class="brand-icon" aria-hidden="true" focusable="false" viewBox="0 0 32 32" width="24" height="24">
                        <circle cx="16" cy="7" r="4.5" fill="#2563EB"/>
                        <circle cx="8" cy="23" r="3.5" fill="#38BDF8"/>
                        <circle cx="24" cy="23" r="3.5" fill="#38BDF8"/>
                        <line x1="16" y1="7" x2="8" y2="23" stroke="#94A3B8" stroke-width="2"/>
                        <line x1="16" y1="7" x2="24" y2="23" stroke="#94A3B8" stroke-width="2"/>
                    </svg>
                    <div>
                        <div class="side-navbar-brand">DSA Visualizer</div>
                        <div class="side-navbar-sub">Academic Workbench</div>
                    </div>
                </div>
                <button type="button" class="side-navbar-close" id="closeBtn" aria-label="Close menu">${SVG_ICONS.close}</button>
            </div>
            <div class="side-navbar-scroll">
        `;

        navCategories.forEach(cat => {
            navHtml += `<div class="side-navbar-category">${cat.category}</div>`;
            navHtml += `<div class="side-navbar-links">`;
            cat.items.forEach(item => {
                const isActive = (currentPage === item.href || (currentPage === "" && item.href === "index.html"));
                navHtml += `
                    <a href="${item.href}" class="side-navbar-link ${isActive ? 'active' : ''}"${isActive ? ' aria-current="page"' : ''}>
                        <span class="side-navbar-icon">${SVG_ICONS[item.iconKey] || ''}</span>
                        <span>${item.label}</span>
                    </a>
                `;
            });
            navHtml += `</div>`;
        });

        navHtml += `</div>`;
        sidebar.innerHTML = navHtml;
        sidebar.setAttribute("aria-label", "Modules");
        // Closed sidebar sits off-screen; `inert` keeps its links out of the Tab order
        // and away from screen readers until it is opened.
        sidebar.inert = true;

        // Create open menu button if not present
        let openBtn = document.getElementById("openBtn") || document.getElementById("menuBtn");
        if (!openBtn) {
            openBtn = document.createElement("button");
            openBtn.type = "button";
            openBtn.id = "openBtn";
            openBtn.className = "nav-open-btn";
            openBtn.innerHTML = `${SVG_ICONS.menu} <span>Modules</span>`;
            // No aria-label: the visible text "Modules" is the name (WCAG 2.5.3), and
            // aria-expanded below tells screen readers whether the menu is open.
            document.body.prepend(openBtn);
        } else {
            openBtn.classList.add("nav-open-btn");
            openBtn.innerHTML = `${SVG_ICONS.menu} <span>Modules</span>`;
        }
        openBtn.setAttribute("aria-controls", "sideNavbar");
        openBtn.setAttribute("aria-expanded", "false");

        const closeBtn = document.getElementById("closeBtn");
        const mainContent = document.querySelector(".page-container") || document.querySelector(".main-content");
        if (mainContent && !mainContent.closest("main") && !mainContent.hasAttribute("role")) {
            mainContent.setAttribute("role", "main");
        }

        initThemeToggle(openBtn);
        initSkipLink(mainContent);

        function focusableIn(el) {
            return [...el.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        }

        function openMenu() {
            sidebar.inert = false;
            sidebar.classList.add("active");
            overlay.classList.add("active");
            if (mainContent) mainContent.classList.add("shifted");
            document.body.classList.add("nav-open");
            openBtn.setAttribute("aria-expanded", "true");
            const target = sidebar.querySelector(".side-navbar-link.active") || closeBtn;
            if (target) target.focus();
        }

        function closeMenu() {
            const hadFocus = sidebar.contains(document.activeElement);
            sidebar.classList.remove("active");
            overlay.classList.remove("active");
            if (mainContent) mainContent.classList.remove("shifted");
            document.body.classList.remove("nav-open");
            openBtn.setAttribute("aria-expanded", "false");
            sidebar.inert = true;
            if (hadFocus) openBtn.focus();
        }

        // Keep Tab inside the open sidebar (it covers the page like a dialog).
        sidebar.addEventListener("keydown", function (e) {
            if (e.key !== "Tab") return;
            const items = focusableIn(sidebar);
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        });

        openBtn.onclick = function (e) {
            e.stopPropagation();
            if (sidebar.classList.contains("active")) {
                closeMenu();
            } else {
                openMenu();
            }
        };

        if (closeBtn) {
            closeBtn.onclick = function (e) {
                e.stopPropagation();
                closeMenu();
            };
        }

        overlay.onclick = function () {
            closeMenu();
        };

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && sidebar.classList.contains("active")) {
                closeMenu();
            }
        });
    }

    // ---- Screen-reader announcer ---------------------------------------------
    // One polite and one assertive live region, created as soon as this script runs
    // (it is loaded at the end of <body>, before the page modules). A live region
    // must already be in the accessibility tree when its text changes; the visible
    // banners are [hidden] until their first message, so they were often not read.
    // Pages call DSA_UI.announce(); the banners stay purely visual.
    const liveRegions = {};
    let announceTimer = null;

    function liveRegion(politeness) {
        const existing = liveRegions[politeness];
        if (existing && existing.isConnected) return existing;
        const el = document.createElement("div");
        el.className = "visually-hidden";
        el.setAttribute("role", politeness === "assertive" ? "alert" : "status");
        el.setAttribute("aria-live", politeness);
        el.setAttribute("aria-atomic", "true");
        el.setAttribute("data-announcer", politeness);
        document.body.appendChild(el);
        liveRegions[politeness] = el;
        return el;
    }

    function initAnnouncer() {
        liveRegion("polite");
        liveRegion("assertive");
    }

    /**
     * Read `message` to screen readers. `politeness` is "polite" (default: results,
     * info) or "assertive" (errors). An empty message cancels a pending one.
     */
    function announce(message, politeness) {
        if (!document.body) return;
        const kind = politeness === "assertive" ? "assertive" : "polite";
        const target = liveRegion(kind);
        const other = liveRegion(kind === "assertive" ? "polite" : "assertive");
        clearTimeout(announceTimer);
        target.textContent = "";
        other.textContent = "";
        if (!message) return;
        // Write on a later tick so the same message twice in a row is still read.
        announceTimer = setTimeout(function () { target.textContent = String(message); }, 60);
    }

    if (document.body) initAnnouncer();
    else document.addEventListener("DOMContentLoaded", initAnnouncer);

    window.DSA_UI = {
        announce: announce,

        /**
         * Call at the end of a re-render with the element that was focused before it.
         * If that element is now disabled or was removed, focus the first usable
         * fallback so keyboard and screen-reader users do not drop to <body>.
         */
        rescueFocus: function (previous) {
            if (!previous || previous === document.body || previous === document.documentElement) return;
            if (previous.isConnected && !previous.disabled) return;
            const fallbacks = Array.prototype.slice.call(arguments, 1);
            const target = fallbacks.find(function (el) { return el && el.isConnected && !el.disabled; });
            if (target) target.focus();
        },

        showToast: function (message, type = "info", duration = 3500) {
            let toastContainer = document.getElementById("toastContainer");
            if (!toastContainer) {
                toastContainer = document.createElement("div");
                toastContainer.id = "toastContainer";
                toastContainer.className = "toast-container";
                document.body.appendChild(toastContainer);
            }

            const toast = document.createElement("div");
            toast.className = `toast-message toast-${type}`;
            toast.textContent = message;

            toastContainer.appendChild(toast);
            setTimeout(() => toast.classList.add("toast-show"), 10);

            setTimeout(() => {
                toast.classList.remove("toast-show");
                setTimeout(() => {
                    if (toast.parentNode) toast.parentNode.removeChild(toast);
                }, 300);
            }, duration);
        },

        setOutput: function (elementId, message) {
            const el = document.getElementById(elementId);
            if (el) el.textContent = message;
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initNavigation);
    } else {
        initNavigation();
    }
})();
