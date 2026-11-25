/**
 * StepPlayer — reusable playback controller for recorded algorithm steps.
 *
 * Algorithms run for real and record a snapshot per step (see src/algorithms).
 * The player only moves an index through those snapshots, so the picture on
 * screen is always a state the real algorithm actually produced.
 *
 * DOM-free: timers are injectable so the player can be unit-tested in Node.
 */
export class StepPlayer {
    /**
     * @param {object} opts
     * @param {(step: any, index: number, player: StepPlayer) => void} opts.onStep
     * @param {number} [opts.baseDelay=700] milliseconds per step at 1x speed
     * @param {(fn: Function, ms: number) => any} [opts.setTimer]
     * @param {(id: any) => void} [opts.clearTimer]
     */
    constructor({ onStep, baseDelay = 700, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
        if (typeof onStep !== "function") throw new TypeError("StepPlayer requires an onStep callback");
        this.onStep = onStep;
        this.baseDelay = baseDelay;
        this.setTimer = setTimer;
        this.clearTimer = clearTimer;
        this.steps = [];
        this.index = 0;
        this.speed = 1;
        this.timer = null;
    }

    get length() { return this.steps.length; }
    get current() { return this.steps[this.index]; }
    get isPlaying() { return this.timer !== null; }
    get atStart() { return this.index === 0; }
    get atEnd() { return this.steps.length === 0 || this.index === this.steps.length - 1; }

    load(steps) {
        if (!Array.isArray(steps) || steps.length === 0) throw new Error("StepPlayer.load needs a non-empty steps array");
        this.pause();
        this.steps = steps;
        this.index = 0;
        this.emit();
    }

    goTo(i) {
        if (this.steps.length === 0) return;
        const clamped = Math.max(0, Math.min(this.steps.length - 1, i));
        if (clamped === this.index) return;
        this.index = clamped;
        this.emit();
    }

    next() {
        if (this.atEnd) { this.pause(); return false; }
        this.goTo(this.index + 1);
        return true;
    }

    prev() {
        this.pause();
        this.goTo(this.index - 1);
    }

    reset() {
        this.pause();
        if (this.index !== 0) { this.index = 0; this.emit(); }
    }

    play() {
        if (this.isPlaying || this.steps.length === 0) return;
        if (this.atEnd) { this.index = 0; this.emit(); }
        this.scheduleNext();
        this.emit();
    }

    pause() {
        if (this.timer !== null) {
            this.clearTimer(this.timer);
            this.timer = null;
            this.emit();
        }
    }

    toggle() { this.isPlaying ? this.pause() : this.play(); }

    /** @param {number} multiplier e.g. 0.5, 1, 2, 4 */
    setSpeed(multiplier) {
        if (!(multiplier > 0)) throw new RangeError("speed must be > 0");
        this.speed = multiplier;
    }

    get delay() { return Math.round(this.baseDelay / this.speed); }

    scheduleNext() {
        this.timer = this.setTimer(() => {
            this.timer = null;
            const moved = this.next();
            if (moved && !this.atEnd) this.scheduleNext();
            else this.emit(); // final render with isPlaying === false
        }, this.delay);
    }

    emit() {
        if (this.steps.length) this.onStep(this.current, this.index, this);
    }
}
