/**
 * Guided tour engine.
 *
 * Spotlights a target, shows the line to say, and optionally drives the real
 * controls before a step is shown. Deliberately small: one overlay, one card,
 * no dependencies.
 *
 * Presenter mode is for recording. It enlarges the narration, pins the card to
 * the bottom of the screen so it never covers the interface, and shows the
 * running time so a two minute script stays a two minute script.
 */
import { TOUR, TOUR_SECONDS, type TourStep } from "./steps";

const PRESENTER_KEY = "hitch.tour.presenter";

let index = -1;
let running = false;
let presenter = false;
let root: HTMLElement | null = null;
let spot: HTMLElement | null = null;
let card: HTMLElement | null = null;
let busy = false;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const esc = (text: string) =>
  text.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

function readPresenter(): boolean {
  try {
    return localStorage.getItem(PRESENTER_KEY) === "1";
  } catch {
    return false;
  }
}

function writePresenter(value: boolean) {
  try {
    localStorage.setItem(PRESENTER_KEY, value ? "1" : "0");
  } catch {
    /* private browsing, not worth failing over */
  }
}

/* ------------------------------ scaffolding ------------------------------ */

function build() {
  if (root) return;

  root = document.createElement("div");
  root.className = "tour-root";
  root.setAttribute("aria-live", "polite");

  spot = document.createElement("div");
  spot.className = "tour-spot";

  card = document.createElement("div");
  card.className = "tour-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Guided tour");

  root.append(spot, card);
  document.body.append(root);

  card.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>("[data-tour]")?.dataset.tour;
    if (action === "next") void go(index + 1);
    if (action === "back") void go(index - 1);
    if (action === "exit") stop();
    if (action === "presenter") togglePresenter();
  });
}

function togglePresenter() {
  presenter = !presenter;
  writePresenter(presenter);
  root?.classList.toggle("presenting", presenter);
  render();
}

/* -------------------------------- geometry ------------------------------- */

function place(step: TourStep) {
  if (!spot || !card) return;

  const target = step.target ? document.querySelector<HTMLElement>(step.target) : null;

  if (!target) {
    spot.style.opacity = "0";
    card.classList.add("centered");
    card.style.removeProperty("top");
    card.style.removeProperty("left");
    return;
  }

  card.classList.remove("centered");

  const rect = target.getBoundingClientRect();
  const pad = 8;

  spot.style.opacity = "1";
  spot.style.top = `${rect.top - pad}px`;
  spot.style.left = `${rect.left - pad}px`;
  spot.style.width = `${rect.width + pad * 2}px`;
  spot.style.height = `${rect.height + pad * 2}px`;

  // In presenter mode the card is pinned low so it never covers the interface
  // being filmed. CSS handles that; skip positioning entirely.
  if (presenter) {
    card.style.removeProperty("top");
    card.style.removeProperty("left");
    return;
  }

  const cardRect = card.getBoundingClientRect();
  const gap = 16;
  const below = rect.bottom + gap;
  const above = rect.top - cardRect.height - gap;

  const preferBelow =
    step.placement === "bottom" ||
    (step.placement !== "top" && below + cardRect.height < window.innerHeight - 12);

  const top = preferBelow ? below : Math.max(12, above);
  const left = clamp(
    rect.left + rect.width / 2 - cardRect.width / 2,
    12,
    Math.max(12, window.innerWidth - cardRect.width - 12),
  );

  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
}

function scrollTo(step: TourStep) {
  const target = step.target ? document.querySelector<HTMLElement>(step.target) : null;
  if (!target) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const rect = target.getBoundingClientRect();
  const fullyVisible = rect.top > 90 && rect.bottom < window.innerHeight - 200;
  if (!fullyVisible) target.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* -------------------------------- rendering ------------------------------ */

function render() {
  if (!card) return;
  const step = TOUR[index];
  if (!step) return;

  const elapsed = TOUR.slice(0, index).reduce((total, s) => total + s.seconds, 0);
  const mmss = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  card.innerHTML = `
    <div class="tour-head">
      <span class="tour-step">${index + 1} / ${TOUR.length}</span>
      <span class="tour-title">${esc(step.title)}</span>
      <span class="tour-clock" title="Where this step falls in a ${mmss(TOUR_SECONDS)} script">
        ${mmss(elapsed)}<span class="tour-clock-dim"> / ${mmss(TOUR_SECONDS)}</span>
      </span>
    </div>

    <p class="tour-say">${esc(step.say)}</p>

    ${step.note ? `<p class="tour-note"><b>Do:</b> ${esc(step.note)}</p>` : ""}

    <div class="tour-foot">
      <button class="tour-btn ghost" data-tour="exit">Exit</button>
      <button class="tour-btn ghost" data-tour="presenter" aria-pressed="${presenter}">
        ${presenter ? "Presenter on" : "Presenter"}
      </button>
      <span class="tour-spacer"></span>
      <button class="tour-btn ghost" data-tour="back" ${index === 0 ? "disabled" : ""}>Back</button>
      <button class="tour-btn primary" data-tour="next">
        ${index === TOUR.length - 1 ? "Finish" : "Next"}
      </button>
    </div>

    <div class="tour-progress"><span style="width:${((index + 1) / TOUR.length) * 100}%"></span></div>
  `;
}

/* ------------------------------- navigation ------------------------------ */

async function go(next: number) {
  if (busy) return;

  if (next < 0) return;
  if (next >= TOUR.length) {
    stop();
    return;
  }

  const step = TOUR[next];
  busy = true;
  card?.classList.add("working");

  try {
    await step.before?.();
  } catch {
    /* a step that cannot drive the UI should not end the tour */
  }

  index = next;
  card?.classList.remove("working");
  busy = false;

  render();
  scrollTo(step);
  // Let the smooth scroll settle before measuring.
  setTimeout(() => place(step), 260);
}

function onKey(event: KeyboardEvent) {
  if (!running) return;
  if (event.key === "Escape") stop();
  if (event.key === "ArrowRight" || event.key === " ") {
    event.preventDefault();
    void go(index + 1);
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    void go(index - 1);
  }
}

function reposition() {
  if (running && TOUR[index]) place(TOUR[index]);
}

/* --------------------------------- public -------------------------------- */

export function startTour(from = 0) {
  build();
  running = true;
  presenter = readPresenter();
  root!.classList.add("open");
  root!.classList.toggle("presenting", presenter);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, { passive: true });
  void go(from);
}

export function stop() {
  running = false;
  root?.classList.remove("open");
  document.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", reposition);
  window.removeEventListener("scroll", reposition);
  index = -1;
}

export function isTourRunning() {
  return running;
}

/** `?tour=1` starts the tour, `?tour=5` starts at a given step. */
export function tourFromUrl(): number | null {
  const value = new URLSearchParams(location.search).get("tour");
  if (value === null) return null;
  const step = Number.parseInt(value, 10);
  return Number.isFinite(step) && step > 0 ? step - 1 : 0;
}

export { TOUR_SECONDS };
