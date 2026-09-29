/**
 * Retractable Curved-Edge Control Sidebar Management
 */

const STORAGE_KEY = "epochlab-sidebar-collapsed";

export interface SidebarController {
  isCollapsed: () => boolean;
  toggle: () => void;
  collapse: () => void;
  expand: () => void;
}

export function initSidebar(): SidebarController {
  const sidebar = document.getElementById("control-sidebar");
  const toggleBtn = document.getElementById("sidebar-toggle");
  const sidebarContent = document.getElementById("sidebar-content");
  const backdrop = document.getElementById("sidebar-backdrop");

  if (!sidebar || !toggleBtn) {
    return {
      isCollapsed: () => false,
      toggle: () => {},
      collapse: () => {},
      expand: () => {}
    };
  }

  // Determine initial state: collapsed by default on mobile screens (< 768px),
  // otherwise respect stored user preference or default to expanded.
  const isMobile = window.innerWidth < 768;
  const saved = localStorage.getItem(STORAGE_KEY);
  let collapsed = saved !== null ? saved === "true" : isMobile;

  function updateSidebarTop() {
    const header = document.querySelector("header");
    if (header) {
      const rect = header.getBoundingClientRect();
      const top = Math.max(0, Math.round(rect.bottom));
      document.documentElement.style.setProperty("--sidebar-top", `${top}px`);
    }
  }

  function applyState(isCol: boolean, save = true) {
    collapsed = isCol;
    if (save) {
      try {
        localStorage.setItem(STORAGE_KEY, String(collapsed));
      } catch (e) {
        // Ignore quota/private browsing issues
      }
    }

    if (collapsed) {
      sidebar.classList.add("collapsed");
      document.body.classList.add("sidebar-collapsed");
      document.body.classList.remove("sidebar-expanded");
      document.documentElement.classList.add("sidebar-is-collapsed");
      document.documentElement.classList.remove("sidebar-is-expanded");
      toggleBtn.setAttribute("aria-expanded", "false");
      toggleBtn.setAttribute("aria-label", "Expand controls");
      toggleBtn.setAttribute("title", "Expand controls (Press [ to toggle)");
      const icon = toggleBtn.querySelector(".toggle-icon");
      if (icon) {
        icon.textContent = "chevron_left";
      }
      if (sidebarContent) {
        sidebarContent.setAttribute("aria-hidden", "true");
        (sidebarContent as any).inert = true;
      }
    } else {
      sidebar.classList.remove("collapsed");
      document.body.classList.remove("sidebar-collapsed");
      document.body.classList.add("sidebar-expanded");
      document.documentElement.classList.remove("sidebar-is-collapsed");
      document.documentElement.classList.add("sidebar-is-expanded");
      toggleBtn.setAttribute("aria-expanded", "true");
      toggleBtn.setAttribute("aria-label", "Collapse controls");
      toggleBtn.setAttribute("title", "Collapse controls (Press [ to toggle)");
      const icon = toggleBtn.querySelector(".toggle-icon");
      if (icon) {
        icon.textContent = "chevron_right";
      }
      if (sidebarContent) {
        sidebarContent.setAttribute("aria-hidden", "false");
        (sidebarContent as any).inert = false;
      }
    }

    // Trigger canvas and network recalculation after transition
    window.dispatchEvent(new Event("resize"));
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 150);
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 320);
  }

  // Initial state setup
  applyState(collapsed, false);
  updateSidebarTop();

  // Scroll & Resize listeners for header tracking
  window.addEventListener("scroll", updateSidebarTop, { passive: true });
  window.addEventListener("resize", updateSidebarTop, { passive: true });

  // Toggle button click handler
  toggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    applyState(!collapsed);
  });

  // Mobile backdrop click to close
  if (backdrop) {
    backdrop.addEventListener("click", () => {
      if (!collapsed) {
        applyState(true);
      }
    });
  }

  // Keyboard navigation & shortcuts
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target) {
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
      }
    }

    // Toggle on '[' or 'Ctrl+B'
    if (e.key === "[" || (e.ctrlKey && e.key.toLowerCase() === "b")) {
      e.preventDefault();
      applyState(!collapsed);
    } else if (e.key === "Escape" && !collapsed && window.innerWidth < 1200) {
      e.preventDefault();
      applyState(true);
    }
  });

  // Also listen for transitionend on transform
  sidebar.addEventListener("transitionend", (e: TransitionEvent) => {
    if (e.target === sidebar && e.propertyName === "transform") {
      window.dispatchEvent(new Event("resize"));
    }
  });

  return {
    isCollapsed: () => collapsed,
    toggle: () => applyState(!collapsed),
    collapse: () => applyState(true),
    expand: () => applyState(false)
  };
}
