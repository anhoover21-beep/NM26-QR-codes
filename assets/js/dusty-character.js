class DustyCharacter {
    constructor(options = {}) {
        this.container = this.resolveElement(options.container);
        this.speechBubble = this.resolveElement(options.speechBubble);
        this.button = this.resolveElement(options.button);

        this.facts = Array.isArray(options.facts) ? options.facts : [];
        this.audioFiles = Array.isArray(options.audioFiles) ? options.audioFiles : [];
        this.images = options.images || {};
        this.placement = options.placement || {};

        this.idleMessage =
            options.idleMessage || "Press the button and Dusty will share another fact.";
        this.baseAlt = options.baseAlt || "Dusty";

        this.currentAudio = null;
        this.lastPlayedIndex = -1;

        this.blinkTimer = null;
        this.browTimer = null;
        this.mouthTimer = null;
        this.mouthFrame = null;

        this.audioContext = null;
        this.analyser = null;
        this.sourceNode = null;
        this.dataArray = null;

        this.widget = null;
        this.base = null;
        this.eyes = null;
        this.mouth = null;
        this.hand = null;
        this.brow1 = null;
        this.brow2 = null;

        this.isInitialized = false;
        this.isDestroyed = false;

        this.handleResize = this.positionParts.bind(this);
        this.handleButtonClick = this.playRandomFact.bind(this);

        this.motionQuery =
            typeof window !== "undefined" && "matchMedia" in window
                ? window.matchMedia("(prefers-reduced-motion: reduce)")
                : null;

        this.reduceMotion = this.motionQuery ? this.motionQuery.matches : false;

        this.handleMotionChange = (event) => {
            this.reduceMotion = event.matches;

            if (this.reduceMotion) {
                window.clearTimeout(this.blinkTimer);
                window.clearTimeout(this.browTimer);
                this.blinkTimer = null;
                this.browTimer = null;

                if (this.eyes) {
                    this.eyes.style.opacity = "0";
                }

                if (this.mouth) {
                    this.mouth.style.opacity = "1";
                }
            } else if (this.isInitialized && !this.isDestroyed) {
                this.scheduleBlinkLoop();
                this.scheduleBrowLoop();

                if (this.currentAudio && !this.currentAudio.paused) {
                    this.startTalking();
                }
            }
        };
    }

    resolveElement(target) {
        if (typeof target === "string") {
            return document.querySelector(target);
        }

        return target instanceof Element ? target : null;
    }

    validate() {
        if (!this.container) {
            throw new Error("Dusty container not found.");
        }

        if (!this.speechBubble) {
            throw new Error("Speech bubble not found.");
        }

        if (!this.button) {
            throw new Error("Button not found.");
        }

        if (this.facts.length !== this.audioFiles.length) {
            throw new Error("facts and audioFiles must be the same length.");
        }

        const requiredImages = ["base", "eyesClosed", "mouthClosed", "hand", "brow1", "brow2"];
        for (const key of requiredImages) {
            if (!this.images[key]) {
                throw new Error(`Missing image path: ${key}`);
            }
        }

        const requiredParts = ["hand", "brow1", "brow2"];
        for (const key of requiredParts) {
            if (!this.placement[key]) {
                throw new Error(`Missing placement config: ${key}`);
            }
        }
    }

    buildMarkup() {
        this.container.classList.add("dusty-mount");

        this.container.innerHTML = `
            <div class="dusty-widget" aria-live="polite">
                <img class="dusty-base" data-part="base" src="${this.images.base}" alt="${this.escapeAttribute(this.baseAlt)}">
                <img class="dusty-full dusty-eyes" data-part="eyes" src="${this.images.eyesClosed}" alt="" aria-hidden="true">
                <img class="dusty-full dusty-mouth" data-part="mouth" src="${this.images.mouthClosed}" alt="" aria-hidden="true">
                <img class="dusty-part dusty-hand" data-part="hand" src="${this.images.hand}" alt="" aria-hidden="true">
                <img class="dusty-part dusty-brow-1" data-part="brow1" src="${this.images.brow1}" alt="" aria-hidden="true">
                <img class="dusty-part dusty-brow-2" data-part="brow2" src="${this.images.brow2}" alt="" aria-hidden="true">
            </div>
        `;

        this.widget = this.container.querySelector(".dusty-widget");
        this.base = this.container.querySelector('[data-part="base"]');
        this.eyes = this.container.querySelector('[data-part="eyes"]');
        this.mouth = this.container.querySelector('[data-part="mouth"]');
        this.hand = this.container.querySelector('[data-part="hand"]');
        this.brow1 = this.container.querySelector('[data-part="brow1"]');
        this.brow2 = this.container.querySelector('[data-part="brow2"]');
    }

    escapeAttribute(value) {
        return String(value).replace(/"/g, "&quot;");
    }

    waitForImage(img) {
        return new Promise((resolve, reject) => {
            if (!img) {
                reject(new Error("Image element is missing."));
                return;
            }

            if (img.complete && img.naturalWidth > 0) {
                resolve();
                return;
            }

            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener(
                "error",
                () => reject(new Error(`Failed to load ${img.src}`)),
                { once: true }
            );
        });
    }

    async preload() {
        await Promise.all([
            this.waitForImage(this.base),
            this.waitForImage(this.eyes),
            this.waitForImage(this.mouth),
            this.waitForImage(this.hand),
            this.waitForImage(this.brow1),
            this.waitForImage(this.brow2)
        ]);
    }

    placePart(element, part, baseWidth, baseHeight) {
        if (!element || !part || !baseWidth || !baseHeight) {
            return;
        }

        element.style.width = `${(part.width / baseWidth) * 100}%`;
        element.style.left = `${(part.left / baseWidth) * 100}%`;
        element.style.top = `${(part.top / baseHeight) * 100}%`;
    }

    positionParts() {
        const baseWidth = this.base?.naturalWidth;
        const baseHeight = this.base?.naturalHeight;

        if (!baseWidth || !baseHeight) {
            return;
        }

        this.placePart(this.hand, this.placement.hand, baseWidth, baseHeight);
        this.placePart(this.brow1, this.placement.brow1, baseWidth, baseHeight);
        this.placePart(this.brow2, this.placement.brow2, baseWidth, baseHeight);
    }

    delay(ms) {
        return new Promise((resolve) => {
            window.setTimeout(resolve, ms);
        });
    }

    blinkOnce(duration = 120) {
        if (this.reduceMotion || !this.eyes) {
            return Promise.resolve();
        }

        this.eyes.style.opacity = "1";

        return new Promise((resolve) => {
            window.setTimeout(() => {
                if (this.eyes) {
                    this.eyes.style.opacity = "0";
                }
                resolve();
            }, duration);
        });
    }

    async blinkCluster() {
        if (this.reduceMotion) {
            return;
        }

        const roll = Math.random();

        if (roll < 0.72) {
            await this.blinkOnce(120);
            return;
        }

        if (roll < 0.94) {
            await this.blinkOnce(105);
            await this.delay(90);
            await this.blinkOnce(95);
            return;
        }

        await this.blinkOnce(95);
        await this.delay(80);
        await this.blinkOnce(85);
        await this.delay(70);
        await this.blinkOnce(80);
    }

    scheduleBlinkLoop() {
        if (this.reduceMotion) {
            return;
        }

        window.clearTimeout(this.blinkTimer);

        const queueBlink = () => {
            const delay = 2200 + Math.random() * 3200;

            this.blinkTimer = window.setTimeout(async () => {
                if (this.isDestroyed || this.reduceMotion) {
                    return;
                }

                await this.blinkCluster();
                queueBlink();
            }, delay);
        };

        queueBlink();
    }

    lowerBrows() {
        if (this.reduceMotion || !this.brow1 || !this.brow2) {
            return;
        }

        this.brow1.classList.remove("lower");
        this.brow2.classList.remove("lower");

        void this.brow1.offsetWidth;
        void this.brow2.offsetWidth;

        this.brow1.classList.add("lower");
        this.brow2.classList.add("lower");
    }

    async browDropBurst() {
        if (this.reduceMotion) {
            return;
        }

        const roll = Math.random();

        this.lowerBrows();

        if (roll > 0.72) {
            await this.delay(180 + Math.random() * 120);
            this.lowerBrows();
        }
    }

    scheduleBrowLoop() {
        if (this.reduceMotion) {
            return;
        }

        window.clearTimeout(this.browTimer);

        const queueDrop = () => {
            const delay = 2400 + Math.random() * 3600;

            this.browTimer = window.setTimeout(async () => {
                if (this.isDestroyed || this.reduceMotion) {
                    return;
                }

                const isSpeaking = Boolean(this.currentAudio && !this.currentAudio.paused);

                if (!isSpeaking && Math.random() > 0.2) {
                    await this.browDropBurst();
                }

                queueDrop();
            }, delay);
        };

        queueDrop();
    }

    ensureAudioContext() {
        if (!this.audioContext) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;

            if (!AudioContextClass) {
                return false;
            }

            this.audioContext = new AudioContextClass();
        }

        return true;
    }

    async resumeAudioContext() {
        if (!this.audioContext) {
            return;
        }

        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }
    }

    connectAudioAnalysis(audio) {
        if (!this.ensureAudioContext()) {
            return false;
        }

        this.cleanupAudioNodes();

        try {
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.82;

            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.sourceNode = this.audioContext.createMediaElementSource(audio);

            this.sourceNode.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            return true;
        } catch {
            this.cleanupAudioNodes();
            return false;
        }
    }

    cleanupAudioNodes() {
        if (this.sourceNode) {
            try {
                this.sourceNode.disconnect();
            } catch {
                // Ignore cleanup disconnect errors.
            }
            this.sourceNode = null;
        }

        if (this.analyser) {
            try {
                this.analyser.disconnect();
            } catch {
                // Ignore cleanup disconnect errors.
            }
            this.analyser = null;
        }

        this.dataArray = null;
    }

    getAverageVolume() {
        if (!this.analyser || !this.dataArray) {
            return 0;
        }

        this.analyser.getByteFrequencyData(this.dataArray);

        let total = 0;
        for (let i = 0; i < this.dataArray.length; i += 1) {
            total += this.dataArray[i];
        }

        return total / this.dataArray.length;
    }

    startFallbackMouth() {
        if (this.reduceMotion || !this.mouth) {
            return;
        }

        this.stopMouthSync();

        this.mouthTimer = window.setInterval(() => {
            this.mouth.style.opacity = this.mouth.style.opacity === "1" ? "0" : "1";
        }, 220);
    }

    startAudioReactiveMouth() {
        if (this.reduceMotion || !this.mouth) {
            return;
        }

        this.stopMouthSync();

        let smoothed = 0;
        let chatterOpen = false;
        let lastToggleTime = 0;

        const tick = (now) => {
            const isSpeaking = Boolean(this.currentAudio && !this.currentAudio.paused);

            if (!isSpeaking || this.reduceMotion) {
                this.mouth.style.opacity = "1";
                this.mouthFrame = null;
                return;
            }

            const volume = this.getAverageVolume();
            smoothed = smoothed * 0.68 + volume * 0.32;

            const talking = smoothed > 12;

            if (!talking) {
                this.mouth.style.opacity = "1";
                this.mouthFrame = window.requestAnimationFrame(tick);
                return;
            }

            let interval = 220;

            if (smoothed > 30) {
                interval = 110;
            } else if (smoothed > 24) {
                interval = 140;
            } else if (smoothed > 18) {
                interval = 170;
            } else {
                interval = 200;
            }

            if (now - lastToggleTime >= interval) {
                chatterOpen = !chatterOpen;
                lastToggleTime = now;
            }

            this.mouth.style.opacity = chatterOpen ? "0" : "1";
            this.mouthFrame = window.requestAnimationFrame(tick);
        };

        this.mouthFrame = window.requestAnimationFrame(tick);
    }

    stopMouthSync() {
        if (this.mouthTimer) {
            window.clearInterval(this.mouthTimer);
            this.mouthTimer = null;
        }

        if (this.mouthFrame) {
            window.cancelAnimationFrame(this.mouthFrame);
            this.mouthFrame = null;
        }
    }

    startTalking() {
        this.stopMouthSync();

        if (this.widget) {
            this.widget.classList.add("is-speaking");
        }

        if (this.mouth) {
            this.mouth.style.opacity = "1";
        }

        if (this.reduceMotion) {
            return;
        }

        if (this.analyser) {
            this.startAudioReactiveMouth();
            return;
        }

        this.startFallbackMouth();
    }

    stopTalking() {
        this.stopMouthSync();

        if (this.widget) {
            this.widget.classList.remove("is-speaking");
        }

        if (this.mouth) {
            this.mouth.style.opacity = "1";
        }

        if (this.button) {
            this.button.disabled = false;
        }
    }

    getRandomIndex() {
        if (this.audioFiles.length === 0) {
            return -1;
        }

        if (this.audioFiles.length === 1) {
            return 0;
        }

        let nextIndex = this.lastPlayedIndex;

        while (nextIndex === this.lastPlayedIndex) {
            nextIndex = Math.floor(Math.random() * this.audioFiles.length);
        }

        return nextIndex;
    }

    stopCurrentAudio() {
        const audio = this.currentAudio;
        this.currentAudio = null;

        if (!audio) {
            this.cleanupAudioNodes();
            this.stopTalking();
            return;
        }

        audio.pause();
        audio.currentTime = 0;

        this.cleanupAudioNodes();
        this.stopTalking();
    }

    async playRandomFact() {
        if (this.isDestroyed) {
            return;
        }

        this.stopCurrentAudio();

        const index = this.getRandomIndex();

        if (index < 0) {
            this.speechBubble.textContent = "No facts are configured.";
            return;
        }

        const file = this.audioFiles[index];
        const fact = this.facts[index] || "Did you know?";
        const audio = new Audio(file);

        audio.preload = "auto";

        this.currentAudio = audio;
        this.lastPlayedIndex = index;
        this.speechBubble.textContent = fact;
        this.button.disabled = true;

        const hasAnalysis = this.connectAudioAnalysis(audio);
        await this.resumeAudioContext();

        audio.addEventListener("play", () => {
            if (this.currentAudio !== audio || this.isDestroyed) {
                return;
            }

            this.startTalking();
            this.lowerBrows();
        });

        audio.addEventListener("ended", () => {
            if (this.currentAudio !== audio) {
                return;
            }

            this.cleanupAudioNodes();
            this.stopTalking();
            this.speechBubble.textContent = this.idleMessage;
            this.currentAudio = null;
        });

        audio.addEventListener("pause", () => {
            if (this.currentAudio !== audio) {
                return;
            }

            this.stopTalking();
        });

        audio.addEventListener("error", () => {
            if (this.currentAudio !== audio) {
                return;
            }

            this.cleanupAudioNodes();
            this.stopTalking();
            this.speechBubble.textContent = `I couldn't play ${file}. Check assets/audio/.`;
            this.currentAudio = null;
        });

        try {
            await audio.play();
        } catch {
            if (this.currentAudio === audio) {
                this.cleanupAudioNodes();
                this.stopTalking();
                this.speechBubble.textContent = `Playback failed for ${file}.`;
                this.currentAudio = null;
            }
            return;
        }

        if (!hasAnalysis && this.currentAudio === audio && !audio.paused && !this.reduceMotion) {
            this.startFallbackMouth();
        }
    }

    bindEvents() {
        window.addEventListener("resize", this.handleResize);
        this.button.addEventListener("click", this.handleButtonClick);

        if (this.motionQuery) {
            if ("addEventListener" in this.motionQuery) {
                this.motionQuery.addEventListener("change", this.handleMotionChange);
            } else if ("addListener" in this.motionQuery) {
                this.motionQuery.addListener(this.handleMotionChange);
            }
        }
    }

    unbindEvents() {
        window.removeEventListener("resize", this.handleResize);
        this.button?.removeEventListener("click", this.handleButtonClick);

        if (this.motionQuery) {
            if ("removeEventListener" in this.motionQuery) {
                this.motionQuery.removeEventListener("change", this.handleMotionChange);
            } else if ("removeListener" in this.motionQuery) {
                this.motionQuery.removeListener(this.handleMotionChange);
            }
        }
    }

    async init() {
        if (this.isInitialized) {
            return;
        }

        this.validate();
        this.buildMarkup();
        await this.preload();
        this.positionParts();

        if (this.speechBubble && !this.speechBubble.textContent.trim()) {
            this.speechBubble.textContent = this.idleMessage;
        }

        if (this.mouth) {
            this.mouth.style.opacity = "1";
        }

        if (this.eyes) {
            this.eyes.style.opacity = "0";
        }

        this.widget.classList.add("is-ready");

        this.bindEvents();

        if (!this.reduceMotion) {
            this.scheduleBlinkLoop();
            this.scheduleBrowLoop();
        }

        this.isInitialized = true;
        this.isDestroyed = false;
    }

    destroy() {
        if (!this.isInitialized) {
            return;
        }

        this.isDestroyed = true;

        window.clearTimeout(this.blinkTimer);
        window.clearTimeout(this.browTimer);

        this.blinkTimer = null;
        this.browTimer = null;

        this.stopCurrentAudio();
        this.stopMouthSync();
        this.cleanupAudioNodes();
        this.unbindEvents();

        if (this.widget) {
            this.widget.classList.remove("is-speaking", "is-ready");
        }

        if (this.eyes) {
            this.eyes.style.opacity = "0";
        }

        if (this.mouth) {
            this.mouth.style.opacity = "1";
        }

        this.isInitialized = false;
    }
}

// Optional global export for non-module usage.
window.DustyCharacter = DustyCharacter;
