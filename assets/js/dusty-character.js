class DustyCharacter {
    constructor(options) {
        this.container = this.resolveElement(options.container);
        this.speechBubble = this.resolveElement(options.speechBubble);
        this.button = this.resolveElement(options.button);
        this.facts = Array.isArray(options.facts) ? options.facts : [];
        this.audioFiles = Array.isArray(options.audioFiles) ? options.audioFiles : [];
        this.images = options.images || {};
        this.placement = options.placement || {};
        this.idleMessage = options.idleMessage || "Press the button and Dusty will share another fact.";

        this.currentAudio = null;
        this.lastPlayedIndex = -1;
        this.mouthTimer = null;
        this.blinkTimer = null;
        this.handleResize = this.positionParts.bind(this);

        this.widget = null;
        this.base = null;
        this.eyes = null;
        this.mouth = null;
        this.hand = null;
        this.brow1 = null;
        this.brow2 = null;
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
        this.container.innerHTML = `
            <div class="dusty-widget">
                <img class="dusty-base" data-part="base" src="${this.images.base}" alt="Dusty">
                <img class="dusty-full dusty-eyes" data-part="eyes" src="${this.images.eyesClosed}" alt="">
                <img class="dusty-full dusty-mouth" data-part="mouth" src="${this.images.mouthClosed}" alt="">
                <img class="dusty-part dusty-hand" data-part="hand" src="${this.images.hand}" alt="">
                <img class="dusty-part dusty-brow-1" data-part="brow1" src="${this.images.brow1}" alt="">
                <img class="dusty-part dusty-brow-2" data-part="brow2" src="${this.images.brow2}" alt="">
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

    waitForImage(img) {
        return new Promise((resolve, reject) => {
            if (img.complete && img.naturalWidth > 0) {
                resolve();
                return;
            }

            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => reject(new Error(`Failed to load ${img.src}`)), { once: true });
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

    blinkOnce(duration = 150) {
        if (!this.eyes) {
            return;
        }

        this.eyes.style.opacity = "1";

        window.setTimeout(() => {
            if (this.eyes) {
                this.eyes.style.opacity = "0";
            }
        }, duration);
    }

    scheduleBlinkLoop() {
        window.clearTimeout(this.blinkTimer);

        const queueBlink = () => {
            const delay = 2600 + Math.random() * 2600;

            this.blinkTimer = window.setTimeout(() => {
                this.blinkOnce();
                queueBlink();
            }, delay);
        };

        queueBlink();
    }

    lowerBrows() {
        this.brow1.classList.remove("lower");
        this.brow2.classList.remove("lower");

        void this.brow1.offsetWidth;
        void this.brow2.offsetWidth;

        this.brow1.classList.add("lower");
        this.brow2.classList.add("lower");
    }

    startTalking() {
        this.stopTalking();
        this.widget.classList.add("is-speaking");

        this.mouthTimer = window.setInterval(() => {
            this.mouth.style.opacity = this.mouth.style.opacity === "1" ? "0" : "1";
        }, 170);
    }

    stopTalking() {
        if (this.mouthTimer) {
            window.clearInterval(this.mouthTimer);
            this.mouthTimer = null;
        }

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
        if (!this.currentAudio) {
            this.stopTalking();
            return;
        }

        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio = null;
        this.stopTalking();
    }

    playRandomFact() {
        this.stopCurrentAudio();

        const index = this.getRandomIndex();
        if (index < 0) {
            this.speechBubble.textContent = "No facts are configured.";
            return;
        }

        const file = this.audioFiles[index];
        const fact = this.facts[index] || "Did you know?";
        const audio = new Audio(file);

        this.currentAudio = audio;
        this.lastPlayedIndex = index;
        this.speechBubble.textContent = fact;
        this.button.disabled = true;

        audio.addEventListener("play", () => {
            this.startTalking();
            this.lowerBrows();
        });

        audio.addEventListener("ended", () => {
            this.stopTalking();
            this.speechBubble.textContent = this.idleMessage;
            this.currentAudio = null;
        });

        audio.addEventListener("pause", () => {
            if (this.currentAudio === audio) {
                this.stopTalking();
            }
        });

        audio.addEventListener("error", () => {
            this.stopTalking();
            this.speechBubble.textContent = `I couldn't play ${file}. Check assets/audio/.`;
            this.currentAudio = null;
        });

        audio.play().catch(() => {
            this.stopTalking();
            this.speechBubble.textContent = `Playback failed for ${file}.`;
            this.currentAudio = null;
        });
    }

    async init() {
        this.validate();
        this.buildMarkup();
        await this.preload();
        this.positionParts();

        this.mouth.style.opacity = "1";
        this.widget.classList.add("is-ready");

        window.addEventListener("resize", this.handleResize);
        this.button.addEventListener("click", () => this.playRandomFact());

        this.scheduleBlinkLoop();
    }
}
