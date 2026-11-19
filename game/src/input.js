// input.js — keyboard, mouse and drag-orbit state for Ember Isle.
// Edges ("just pressed") fire for one frame only; dragging the mouse with the
// left button held orbits the third-person camera (orbitDelta accumulates the
// drag and the camera consumes it).
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this.orbitDelta = { x: 0, y: 0 };
    this.dragging = false;
    this.lastDrag = { x: 0, y: 0 };
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.justPressed.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.dragging = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      if (this.dragging) {
        this.orbitDelta.x += e.clientX - this.lastDrag.x;
        this.orbitDelta.y += e.clientY - this.lastDrag.y;
        this.lastDrag.x = e.clientX;
        this.lastDrag.y = e.clientY;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.down = true;
      this.mouse.clicked = true;
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      if (e.button === 0) {
        this.dragging = true;
        this.lastDrag.x = e.clientX;
        this.lastDrag.y = e.clientY;
      }
    });
    window.addEventListener('mouseup', () => {
      this.mouse.down = false;
      this.dragging = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(...names) {
    return names.some((n) => this.keys.has(n));
  }

  pressed(...names) {
    return names.some((n) => this.justPressed.has(n));
  }

  // Swallow an edge so a fixed-timestep frame with several sub-steps does not
  // act on the same press twice (exit a car, then instantly climb back in).
  consume(...names) {
    for (const n of names) this.justPressed.delete(n);
  }

  // Take and clear this frame's accumulated camera-orbit drag, in pixels.
  takeOrbit() {
    const d = { x: this.orbitDelta.x, y: this.orbitDelta.y };
    this.orbitDelta.x = 0;
    this.orbitDelta.y = 0;
    return d;
  }

  // Call once per frame after the update, so edges only fire for one frame.
  endFrame() {
    this.justPressed.clear();
    this.mouse.clicked = false;
  }
}
