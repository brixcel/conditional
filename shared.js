/**
 * shared.js - Shared Navigation & Academic UI Utilities
 * Data Structures & Algorithms Educational Suite
 */

(function () {
    const navCategories = [
        {
            category: "General",
            items: [
                { label: "Overview & Dashboard", href: "index.html", icon: "🏛️" }
            ]
        },
        {
            category: "Linear Structures",
            items: [
                { label: "Stack (LIFO)", href: "stack.html", icon: "📚" },
                { label: "Regular Queue (FIFO)", href: "regular-queue.html", icon: "🚶" },
                { label: "Circular Queue", href: "circular-queue.html", icon: "🔄" },
                { label: "Priority Queue", href: "priority-queue.html", icon: "⭐" }
            ]
        },
        {
            category: "Linked Lists",
            items: [
                { label: "Singly Linked List", href: "singly-linked-list.html", icon: "➡️" },
                { label: "Doubly Linked List", href: "doubly-linked-list.html", icon: "↔️" },
                { label: "Circular Linked List", href: "circular-linked-list.html", icon: "🔁" }
            ]
        },
        {
            category: "Tree Structures",
            items: [
                { label: "AVL Tree (Self-Balancing)", href: "avl-tree.html", icon: "🌲" }
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
                <div>
                    <div class="side-navbar-brand">DSA Visualizer</div>
                    <div class="side-navbar-sub">Academic Workbench</div>
                </div>
                <button class="side-navbar-close" id="closeBtn" aria-label="Close menu">&times;</button>
            </div>
            <div class="side-navbar-scroll">
        `;

        navCategories.forEach(cat => {
            navHtml += `<div class="side-navbar-category">${cat.category}</div>`;
            navHtml += `<div class="side-navbar-links">`;
            cat.items.forEach(item => {
                const isActive = (currentPage === item.href || (currentPage === "" && item.href === "index.html"));
                navHtml += `
                    <a href="${item.href}" class="side-navbar-link ${isActive ? 'active' : ''}">
                        <span class="side-navbar-icon">${item.icon}</span>
                        <span>${item.label}</span>
                    </a>
                `;
            });
            navHtml += `</div>`;
        });

        navHtml += `</div>`;
        sidebar.innerHTML = navHtml;

        // Create open menu button if not present
        let openBtn = document.getElementById("openBtn") || document.getElementById("menuBtn");
        if (!openBtn) {
            openBtn = document.createElement("button");
            openBtn.id = "openBtn";
            openBtn.className = "nav-open-btn";
            openBtn.innerHTML = "☰ <span>Modules</span>";
            openBtn.setAttribute("aria-label", "Open navigation menu");
            document.body.prepend(openBtn);
        } else {
            openBtn.classList.add("nav-open-btn");
        }

        const closeBtn = document.getElementById("closeBtn");
        const mainContent = document.querySelector(".page-container") || document.querySelector(".main-content");

        function openMenu() {
            sidebar.classList.add("active");
            overlay.classList.add("active");
            if (mainContent) mainContent.classList.add("shifted");
            document.body.classList.add("nav-open");
        }

        function closeMenu() {
            sidebar.classList.remove("active");
            overlay.classList.remove("active");
            if (mainContent) mainContent.classList.remove("shifted");
            document.body.classList.remove("nav-open");
        }

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

    window.DSA_UI = {
        showToast: function (message, type = "info", duration = 4000) {
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
