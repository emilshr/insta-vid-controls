import browser from "webextension-polyfill";

/**
 * Instagram Video Controller
 * Adds HTML5 controls and rotation functionality to Instagram videos
 */

class InstagramVideoController {
  private processedVideos = new WeakSet<HTMLVideoElement>();
  private observer: MutationObserver | null = null;
  private rotationStates = new WeakMap<HTMLVideoElement, number>();
  private flipStates = new WeakMap<HTMLVideoElement, boolean>();
  private customControls = new WeakMap<HTMLVideoElement, HTMLElement>();
  private isEnabled = true;

  // Volume Management
  private intendedVolume = new WeakMap<HTMLVideoElement, number>();
  private intendedMuted = new WeakMap<HTMLVideoElement, boolean>();

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    // Load initial state
    const data = await browser.storage.sync.get({ extensionEnabled: true });
    this.isEnabled = data.extensionEnabled;

    if (this.isEnabled) {
      document.documentElement.classList.add("insta-control-active");
    }

    // Watch for dynamic changes from the popup
    this.setupStorageListener();

    if (!this.isEnabled) {
      console.log("[InstaControl] Extension is disabled");
      return;
    }

    // Process existing videos on page load
    this.processExistingVideos();

    // Watch for dynamically added videos
    this.observeVideoAdditions();

    console.log("[InstaControl] Initialized");
  }

  private setupStorageListener(): void {
    browser.storage.onChanged.addListener((changes) => {
      if (changes.extensionEnabled) {
        const newValue = changes.extensionEnabled.newValue;
        if (newValue === this.isEnabled) return;

        this.isEnabled = newValue;
        console.log(
          "[InstaControl] Extension enabled state changed to:",
          newValue
        );

        if (this.isEnabled) {
          document.documentElement.classList.add("insta-control-active");
          // Re-enable: re-process videos and start observer
          this.processExistingVideos();
          this.observeVideoAdditions();
        } else {
          document.documentElement.classList.remove("insta-control-active");
          // Disable: stop observer and remove UI elements
          if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
          }
          this.removeAllControls();
        }
      }
    });
  }

  private removeAllControls(): void {
    console.log("[InstaControl] Removing all custom controls");
    const videos = document.querySelectorAll<HTMLVideoElement>("video");
    videos.forEach((video) => {
      // Remove custom control bar
      const bar = this.customControls.get(video);
      if (bar && bar.parentElement) {
        bar.parentElement.removeChild(bar);
      }
      this.customControls.delete(video);

      // Remove rotation button
      const container = this.findVideoContainer(video);
      if (container) {
        const rotateBtn = container.querySelector(".insta-control-rotate-btn");
        if (rotateBtn) rotateBtn.parentElement?.removeChild(rotateBtn);

        const rotateMenu = container.querySelector(
          ".insta-control-rotate-menu"
        );
        if (rotateMenu) rotateMenu.parentElement?.removeChild(rotateMenu);

        // Reset video classes and styles
        container.classList.remove("insta-control-enhanced");
        container.style.height = "";
      }

      // Reset video styles
      video.style.transform = "";
      video.style.width = "";
      video.style.height = "";
      video.style.marginTop = "";
      video.style.marginLeft = "";
      video.controls = true; // Restore native controls if they were hidden

      this.processedVideos.delete(video);
    });
  }

  private processExistingVideos(): void {
    const videos = document.querySelectorAll<HTMLVideoElement>("video");
    console.log(`[InstaControl] Found ${videos.length} existing video(s)`);
    videos.forEach((video) => {
      this.enhanceVideo(video);
    });
  }

  private observeVideoAdditions(): void {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            // Check if the node itself is a video
            if (node.tagName === "VIDEO") {
              this.enhanceVideo(node as HTMLVideoElement);
            }
            // Check for videos within added nodes
            const videos = node.querySelectorAll<HTMLVideoElement>("video");
            videos.forEach((video) => {
              this.enhanceVideo(video);
            });
          }
        });
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    console.log("[InstaControl] MutationObserver active");
  }

  private enhanceVideo(video: HTMLVideoElement): void {
    if (!this.isEnabled) return;
    // Prevent double-processing
    if (this.processedVideos.has(video)) return;

    // Skip stories
    if (this.isStoryVideo(video)) {
      console.log("[InstaControl] Skipping story video");
      return;
    }

    this.processedVideos.add(video);

    // Initialize rotation state
    this.rotationStates.set(video, 0);

    // Initialize intent state
    this.intendedVolume.set(video, video.volume);
    this.intendedMuted.set(video, video.muted);

    // Suppress Instagram's native Play/Pause on click
    this.suppressNativeClick(video);

    // Disable native controls in favor of custom ones
    video.controls = false;

    // Initialize custom controls first
    this.addCustomControls(video);

    // Add rotation button second (so it stacks on top in DOM order)
    this.addRotationButton(video);

    console.log("[InstaControl] Enhanced video:", video);
  }

  private isStoryVideo(video: HTMLVideoElement): boolean {
    // 1. Check URL (Most reliable for direct navigation)
    if (window.location.pathname.startsWith("/stories/")) {
      return true;
    }

    // 2. Check parents for semantic story markers
    let parent = video.parentElement;
    let depth = 0;
    while (parent && depth < 12) {
      // Stories almost always have a progress bar cluster at the top
      // This is a very stable accessibility marker
      if (parent.querySelector('div[role="progressbar"]')) {
        return true;
      }

      // Check for common story navigation elements in the same container
      if (
        parent.querySelector('button[aria-label="Close"]') ||
        parent.querySelector('button[aria-label="Story"]')
      ) {
        // Double check if this is a dialog (Stories are usually in a modal/dialog)
        if (
          parent.getAttribute("role") === "dialog" ||
          parent.tagName === "SECTION"
        ) {
          return true;
        }
      }

      parent = parent.parentElement;
      depth++;
    }

    return false;
  }

  private suppressNativeClick(video: HTMLVideoElement): void {
    // Hijack click events on the video element
    // This prevents Instagram's listeners from firing (which usually toggle play + show overlay)
    // And allows us to implement our own simple toggle
    video.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();

        if (video.paused) {
          video.play().catch((e) => console.error("Play error:", e));
        } else {
          video.pause();
        }
      },
      true
    ); // Capture phase to get it before ANY bubble listeners

    console.log("[InstaControl] Native click suppressed");
  }

  private addRotationButton(video: HTMLVideoElement): void {
    const container = this.findVideoContainer(video);
    if (!container) {
      console.warn(
        "[InstaControl] Could not find container for rotation button"
      );
      return;
    }

    // Ensure container has positioning context
    const computedStyle = window.getComputedStyle(container);
    if (computedStyle.position === "static") {
      container.style.position = "relative";
    }

    // Create rotation button overlay
    const rotateBtn = document.createElement("button");
    rotateBtn.className = "insta-control-rotate-btn";
    rotateBtn.innerHTML = "↻"; // Unicode rotation symbol
    rotateBtn.title = "Rotation options";
    rotateBtn.setAttribute("aria-label", "Rotation options");
    rotateBtn.setAttribute("aria-hidden", "false"); // Override Instagram's aria-hidden

    // Create rotation menu - will be attached to body when opened
    const rotateMenu = document.createElement("div");
    rotateMenu.className = "insta-control-rotate-menu";
    rotateMenu.setAttribute("aria-hidden", "false"); // Override Instagram's aria-hidden

    // Shared state for interaction debouncing
    // This prevents double-firing when both mousedown and click events are triggered
    let lastInteractionTime = 0;

    // Helper to handle events safely with debounce
    const processInteraction = (e: Event, action: () => void) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.cancelable) {
        e.preventDefault();
      }

      const now = Date.now();
      // 300ms debounce to prevent mousedown+click double-fire logic loops
      if (now - lastInteractionTime < 300) {
        return;
      }
      lastInteractionTime = now;
      action();
    };

    // Prevent all background events on the menu from propagating to Instagram
    // USE BUBBLE PHASE (false) so children can handle events first
    const stopPropagationOnly = (e: Event) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      // We don't necessarily want to prevent default on background clicks
      // as that might mess with scrolling etc, but generally inside the menu we do.
    };

    rotateMenu.addEventListener("click", stopPropagationOnly, false);
    rotateMenu.addEventListener("mousedown", stopPropagationOnly, false);
    rotateMenu.addEventListener("mouseup", stopPropagationOnly, false);
    rotateMenu.addEventListener("touchstart", stopPropagationOnly, false);
    rotateMenu.addEventListener("touchend", stopPropagationOnly, false);

    // Menu items
    const menuItems = [
      { label: "↶ Rotate left 90°", degrees: -90 },
      { label: "↷ Rotate right 90°", degrees: 90 },
      { label: "↔ Flip Horizontally", isFlip: true },
    ];

    menuItems.forEach((item) => {
      const menuItem = document.createElement("button");
      menuItem.className = "insta-control-rotate-menu-item";
      menuItem.textContent = item.label;
      menuItem.setAttribute("aria-hidden", "false");

      const handleItemAction = () => {
        console.log("[InstaControl] Menu item clicked:", item.label);

        if ("isFlip" in item) {
          const currentFlip = this.flipStates.get(video) || false;
          this.flipStates.set(video, !currentFlip);
        } else {
          // Calculate new rotation (relative to current)
          const currentRotation = this.rotationStates.get(video) || 0;
          let newRotation = (currentRotation + (item.degrees || 0)) % 360;

          // Normalize to 0-359 range
          if (newRotation < 0) newRotation += 360;
          this.rotationStates.set(video, newRotation);
        }

        this.applyRotation(video, this.rotationStates.get(video) || 0);

        // Close menu and move back to container
        rotateMenu.classList.remove("active");
        if (rotateMenu.parentElement === document.body) {
          container.appendChild(rotateMenu);
          // Clear inline positioning styles
          rotateMenu.style.removeProperty("position");
          rotateMenu.style.removeProperty("top");
          rotateMenu.style.removeProperty("right");
          rotateMenu.style.removeProperty("left");
        }
      };

      const handleEvent = (e: Event) => processInteraction(e, handleItemAction);

      // Listen for both mousedown and click, relying on debounce
      menuItem.addEventListener("mousedown", handleEvent, true);
      menuItem.addEventListener("touchstart", handleEvent, true);
      menuItem.addEventListener("click", handleEvent, true);

      rotateMenu.appendChild(menuItem);
    });

    // Toggle menu logic
    const toggleMenu = () => {
      const isActive = rotateMenu.classList.contains("active");

      if (isActive) {
        // Close menu and move back to container
        rotateMenu.classList.remove("active");
        if (rotateMenu.parentElement === document.body) {
          container.appendChild(rotateMenu);
          // Clear inline positioning styles when moving back
          rotateMenu.style.removeProperty("position");
          rotateMenu.style.removeProperty("top");
          rotateMenu.style.removeProperty("right");
          rotateMenu.style.removeProperty("left");
        }
      } else {
        // Open menu and move to body for better accessibility
        rotateMenu.classList.add("active");

        // Move to body to escape aria-hidden containers
        document.body.appendChild(rotateMenu);

        // Position menu near the button using setProperty with priority
        const btnRect = rotateBtn.getBoundingClientRect();
        const topPosition = btnRect.bottom + 5;
        const rightPosition = window.innerWidth - btnRect.right;

        rotateMenu.style.setProperty("position", "fixed", "important");
        rotateMenu.style.setProperty("top", `${topPosition}px`, "important");
        rotateMenu.style.setProperty(
          "right",
          `${rightPosition}px`,
          "important"
        );
        rotateMenu.style.setProperty("left", "auto", "important");

        console.log(
          "[InstaControl] Menu opened, moved to body, positioned at:",
          {
            top: `${topPosition}px`,
            right: `${rightPosition}px`,
            btnRect: btnRect,
          }
        );
      }

      console.log("[InstaControl] Rotation menu toggled:", !isActive);
    };

    const handleBtnEvent = (e: Event) => processInteraction(e, toggleMenu);

    rotateBtn.addEventListener("mousedown", handleBtnEvent, true);
    rotateBtn.addEventListener("touchstart", handleBtnEvent, true);
    rotateBtn.addEventListener("click", handleBtnEvent, true);

    // Check if we need to stop mouseup specifically if standard clicks are suppressed
    // But since we handle mousedown/click with debounce, extra mouseups shouldn't hurt unless they propagate.
    // Let's stop mouseup on the button too just to be safe (no prop to Instagram)
    rotateBtn.addEventListener("mouseup", stopPropagationOnly, true);

    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (!rotateBtn.contains(target) && !rotateMenu.contains(target)) {
        if (rotateMenu.classList.contains("active")) {
          rotateMenu.classList.remove("active");
          // Move back to container
          if (rotateMenu.parentElement === document.body) {
            container.appendChild(rotateMenu);
            // Clear inline positioning styles
            rotateMenu.style.removeProperty("position");
            rotateMenu.style.removeProperty("top");
            rotateMenu.style.removeProperty("right");
            rotateMenu.style.removeProperty("left");
          }
        }
      }
    });

    container.appendChild(rotateBtn);
    container.appendChild(rotateMenu);
    console.log("[InstaControl] Added rotation button and menu to container");
  }

  private addCustomControls(video: HTMLVideoElement): void {
    const container = this.findVideoContainer(video);
    if (!container) return;

    // Create control bar
    const bar = document.createElement("div");
    bar.className = "insta-control-bar";
    bar.style.display = "flex"; // Always visible

    // Play/Pause Button
    const playBtn = document.createElement("button");
    playBtn.className = "insta-control-btn";
    playBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`; // Play icon default
    playBtn.title = "Play/Pause";

    // Time Display
    const timeDisplay = document.createElement("div");
    timeDisplay.className = "insta-control-time";
    timeDisplay.textContent = "0:00 / 0:00";

    // Progress Bar
    const progressContainer = document.createElement("div");
    progressContainer.className = "insta-control-progress-container";
    const progressTrack = document.createElement("div");
    progressTrack.className = "insta-control-progress-track";
    const progressFill = document.createElement("div");
    progressFill.className = "insta-control-progress-fill";
    const progressHandle = document.createElement("div");
    progressHandle.className = "insta-control-progress-handle";

    progressFill.appendChild(progressHandle);
    progressTrack.appendChild(progressFill);
    progressContainer.appendChild(progressTrack);

    // Volume Control
    const volumeGroup = document.createElement("div");
    volumeGroup.className = "insta-control-volume-group";
    const volumeBtn = document.createElement("button");
    volumeBtn.className = "insta-control-btn";
    volumeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
    volumeBtn.title = "Mute/Unmute";

    const volumeSliderContainer = document.createElement("div");
    volumeSliderContainer.className = "insta-control-volume-slider-container";
    const volumeTrack = document.createElement("div");
    volumeTrack.className = "insta-control-volume-track";
    const volumeFill = document.createElement("div");
    volumeFill.className = "insta-control-volume-fill";

    volumeTrack.appendChild(volumeFill);
    volumeSliderContainer.appendChild(volumeTrack);
    volumeGroup.appendChild(volumeBtn);
    volumeGroup.appendChild(volumeSliderContainer);

    // Fullscreen Button
    const fsBtn = document.createElement("button");
    fsBtn.className = "insta-control-btn";
    fsBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`;
    fsBtn.title = "Fullscreen";

    // Assemble Bar
    bar.appendChild(playBtn);
    bar.appendChild(timeDisplay);
    bar.appendChild(progressContainer);
    bar.appendChild(volumeGroup);
    bar.appendChild(fsBtn);

    // Helper to safely handle interactions
    const addInteraction = (
      element: HTMLElement,
      handler: (e: Event) => void
    ) => {
      element.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handler(e);
      });
    };

    // Play/Pause Logic
    const togglePlay = async () => {
      try {
        if (video.paused) {
          await video.play();
        } else {
          video.pause();
        }
      } catch (err) {
        console.error("[InstaControl] Play toggle error:", err);
      }
    };
    addInteraction(playBtn, togglePlay);

    // Fullscreen Logic
    const toggleFs = async () => {
      try {
        const container = this.findVideoContainer(video);
        const target = container || video;

        if (!document.fullscreenElement) {
          if (target.requestFullscreen) {
            await target.requestFullscreen();
          } else if ((target as any).webkitRequestFullscreen) {
            await (target as any).webkitRequestFullscreen();
          }
        } else {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if ((document as any).webkitExitFullscreen) {
            await (document as any).webkitExitFullscreen();
          }
        }
      } catch (err) {
        console.error("[InstaControl] Fullscreen error:", err);
      }
    };
    addInteraction(fsBtn, toggleFs);

    // Listen for fullscreen changes to adjust scaling if rotated
    const handleFsChange = () => {
      const degree = this.rotationStates.get(video) || 0;
      if (degree !== 0) {
        // Use RAF to wait for layout updates
        requestAnimationFrame(() => {
          this.applyRotation(video, degree);
        });
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);

    // Time Update & Seek Bar UI
    const formatTime = (seconds: number) => {
      if (!Number.isFinite(seconds)) return "0:00";
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const updateTime = () => {
      const current = video.currentTime;
      const duration = video.duration || 0;
      timeDisplay.textContent = `${formatTime(current)} / ${formatTime(
        duration
      )}`;

      let percent = 0;
      if (duration > 0 && Number.isFinite(duration)) {
        percent = (current / duration) * 100;
      }
      progressFill.style.width = `${percent}%`;

      // Update Play Icon
      if (video.paused) {
        playBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
        bar.classList.add("paused");
      } else {
        playBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
        bar.classList.remove("paused");
      }
    };

    video.addEventListener("timeupdate", updateTime);
    video.addEventListener("play", updateTime);
    video.addEventListener("pause", updateTime);
    video.addEventListener("loadedmetadata", updateTime);

    // Seek Logic
    const handleSeek = (e: MouseEvent | TouchEvent) => {
      const rect = progressTrack.getBoundingClientRect();
      // Guard against hidden element
      if (rect.width === 0) return;

      const clientX =
        "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      let pos = (clientX - rect.left) / rect.width;
      pos = Math.max(0, Math.min(1, pos));

      const targetTime = pos * video.duration;
      if (Number.isFinite(targetTime)) {
        video.currentTime = targetTime;
      }
    };

    // Separate mousedown specifically for progress container to allow dragging
    progressContainer.addEventListener("mousedown", (e) => {
      e.stopPropagation(); // Don't let bar handler eat it if it prevents default
      // But we DO want to prevent Instagram from seeing it
      e.stopImmediatePropagation();

      handleSeek(e);

      const onMouseMove = (moveEvent: MouseEvent) => {
        handleSeek(moveEvent);
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });

    // Handle clicks on track directly (jump)
    progressContainer.addEventListener("click", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      handleSeek(e);
    });

    // Volume Logic
    const enforceVolumeState = () => {
      const intentVol = this.intendedVolume.get(video);
      const intentMute = this.intendedMuted.get(video);

      if (intentVol !== undefined && intentMute !== undefined) {
        // If actual state differs from intent, ONLY restore if it looks like an unwanted reset
        // Unwanted reset usually means volume goes to 0 or muted becomes true unexpectedly
        // But strict enforcement is safer for now
        if (
          Math.abs(video.volume - intentVol) > 0.01 ||
          video.muted !== intentMute
        ) {
          // Avoid restoring if the change came from our own slider (which updates intent first)
          // We can solve this by updating intent immediately on slider interaction
          console.log(
            "[InstaControl] Restoring volume to",
            intentVol,
            "muted:",
            intentMute
          );
          video.volume = intentVol;
          video.muted = intentMute;
        }
      }
    };

    const updateVolumeUI = () => {
      // Also update intent if this was a valid change (we assume user interaction if not playing/reset?)
      // Actually, we should only update intent on explicit interactions

      const vol = video.volume;
      const isMuted = video.muted || vol === 0;
      volumeFill.style.width = `${isMuted ? 0 : vol * 100}%`;

      if (isMuted) {
        volumeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
      } else {
        volumeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
      }
    };

    addInteraction(volumeBtn, () => {
      const newMuted = !video.muted;
      this.intendedMuted.set(video, newMuted);
      // Volume doesn't change on mute toggle usually, but let's keep it sync
      this.intendedVolume.set(video, video.volume);
      video.muted = newMuted;
    });

    volumeTrack.addEventListener("click", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      const rect = volumeTrack.getBoundingClientRect();
      if (rect.width === 0) return;
      let pos = (e.clientX - rect.left) / rect.width;
      pos = Math.max(0, Math.min(1, pos));

      // Update intent first!
      this.intendedVolume.set(video, pos);
      this.intendedMuted.set(video, false);

      video.volume = pos;
      video.muted = false;
    });

    video.addEventListener("volumechange", updateVolumeUI);

    // Guardian Listeners
    video.addEventListener("play", enforceVolumeState);
    video.addEventListener("playing", enforceVolumeState);
    // video.addEventListener("seeked", enforceVolumeState); // Maybe too aggressive?

    updateVolumeUI(); // Init

    // Store controls
    this.customControls.set(video, bar);
    container.appendChild(bar);
  }

  private findVideoContainer(video: HTMLVideoElement): HTMLElement | null {
    // Instagram typically wraps videos in containers
    // We look for a parent that has reasonable sizing
    let parent = video.parentElement;
    let depth = 0;
    const maxDepth = 10; // Prevent infinite loop

    while (parent && depth < maxDepth) {
      // Look for container that has reasonable sizing
      // Most Instagram video containers are larger than 200px
      if (parent.clientHeight > 200 && parent.clientWidth > 200) {
        return parent;
      }
      parent = parent.parentElement;
      depth++;
    }

    // Fallback to immediate parent
    return video.parentElement;
  }

  private applyRotation(video: HTMLVideoElement, degrees: number): void {
    console.log(`[InstaControl] Rotating video to ${degrees}°`);
    const container = this.findVideoContainer(video);
    if (!container) return;

    const isFlipped = this.flipStates.get(video) || false;

    if (degrees === 0 && !isFlipped) {
      // Reset
      video.style.transform = "";
      video.style.width = "";
      video.style.height = "";
      video.style.marginTop = "";
      video.style.marginLeft = "";
      container.style.height = ""; // Reset container height
      return;
    }

    // Determine context: Inline or Fullscreen
    const isFullscreen = !!document.fullscreenElement;

    // Get dimensions
    const videoWidth = video.videoWidth || video.clientWidth;
    const videoHeight = video.videoHeight || video.clientHeight;

    // Target dimensions
    let targetWidth: number;
    let targetHeight: number;

    if (isFullscreen) {
      targetWidth = window.innerWidth;
      targetHeight = window.innerHeight;
    } else {
      // Inline: fit to container width
      targetWidth = container.clientWidth;
      // For inline 90/270, we rely on width fitting.
      targetHeight = container.clientHeight || targetWidth;
    }

    video.style.transition = "transform 0.3s ease, margin 0.3s ease";
    video.style.transformOrigin = "center center";

    const flipTransform = isFlipped ? "scaleX(-1)" : "";

    if (degrees === 180 || degrees === 0) {
      // 0 if only flipped
      video.style.transform = `rotate(${degrees}deg) ${flipTransform}`;
      if (!isFullscreen) container.style.height = "";
    } else {
      // 90 or 270 (Landscape)
      // Inline scale fixed at 0.55 per user request
      let scale = 0.55;

      if (isFullscreen) {
        // COVER logic for Fullscreen
        const scaleCoverX = targetWidth / videoHeight;
        const scaleCoverY = targetHeight / videoWidth;
        // Use MAX to cover
        scale = Math.max(scaleCoverX, scaleCoverY);
      } else {
        // Inline: Adjust container height to avoid huge whitespace
        // Visual Height = VideoWidth * Scale
        // (VideoWidth is the height in rotated view)
        const visualHeight = videoWidth * scale;
        container.style.height = `${visualHeight}px`;
      }

      video.style.transform = `rotate(${degrees}deg) scale(${scale}) ${flipTransform}`;
    }
  }

  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    console.log("[InstaControl] Destroyed");
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new InstagramVideoController();
  });
} else {
  // DOM is already ready
  new InstagramVideoController();
}

// Export for debugging
(window as any).__instaControl = InstagramVideoController;
