/* ---------------------------------------------------------------------------
 * CTA conversion tracking
 *
 * Requirement: every WhatsApp CTA carries `data-cta`, and a click fires an
 * analytics event BEFORE the visitor is handed to WhatsApp.
 *
 * Two things make this harder than a naive onClick, and both are handled here.
 *
 * 1. CTAs live in two worlds. Most are plain <a> tags in prerendered .astro
 *    markup (nav, footer, hero, closing band). Only a few are React islands.
 *    If tracking lived solely inside WhatsAppButton.tsx, every static CTA would
 *    silently report nothing — and those are the majority. So we install one
 *    delegated listener on `document` that catches ANY [data-cta] element, and
 *    have the React component route through the same function. A WeakSet of
 *    native events guarantees a click is never counted twice, regardless of
 *    which listener sees it first.
 *
 * 2. "Fire before redirecting" must not mean preventDefault(). Intercepting the
 *    click and then setting window.location adds latency and, on iOS Safari,
 *    breaks the wa.me deep-link handoff: the navigation is no longer inside the
 *    user-gesture window, so the WhatsApp app may not open. Instead we use
 *    navigator.sendBeacon(), which the browser guarantees to flush even as the
 *    page unloads, and we let the click proceed completely untouched.
 * ------------------------------------------------------------------------- */

export type CtaPayload = {
  /** Stable identifier, e.g. "hero-primary" or "case-study-footer". */
  ctaId: string;
  /** Where on the page the CTA sits, e.g. "hero", "nav", "footer". */
  location?: string;
  /** Case-study slug when the CTA is on a project page. */
  project?: string;
  /** Free-form label for ad-platform reporting. */
  label?: string;
  /** Destination the visitor is being sent to. */
  destination?: string;
};

type Provider = 'gtag' | 'dataLayer' | 'plausible' | 'cloudflare';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    plausible?: (event: string, opts?: { props?: Record<string, unknown> }) => void;
    __RR_ANALYTICS__?: {
      provider: Provider;
      endpoint?: string;
      debug?: boolean;
    };
    __RR_CTA_BOUND__?: boolean;
  }
}

const EVENT_NAME = 'whatsapp_cta_click';

/** Clicks already accounted for. Keyed on the native event so the React island
 *  and the document-level listener can both call in without double counting. */
const seen = new WeakSet<Event>();

function config() {
  return (
    window.__RR_ANALYTICS__ ?? { provider: 'gtag' as Provider, debug: false }
  );
}

/**
 * Ship the event. Provider-agnostic on purpose — the studio has not committed
 * to a vendor, and ad campaigns tend to force one late. Everything vendor
 * specific is contained in this one function; adding Meta Pixel or TikTok is a
 * new `case`, not a refactor.
 */
function dispatch(payload: CtaPayload) {
  const { provider, endpoint, debug } = config();

  if (debug) {
    // eslint-disable-next-line no-console
    console.info('[cta]', EVENT_NAME, payload);
  }

  switch (provider) {
    case 'gtag':
      // `transport_type: 'beacon'` is what makes GA4 survive the navigation.
      window.gtag?.('event', EVENT_NAME, {
        ...payload,
        transport_type: 'beacon',
        event_category: 'conversion',
      });
      break;

    case 'dataLayer':
      window.dataLayer?.push({ event: EVENT_NAME, ...payload });
      break;

    case 'plausible':
      window.plausible?.(EVENT_NAME, { props: payload as Record<string, unknown> });
      break;

    case 'cloudflare':
      // Cloudflare Web Analytics has no custom-event API on the free plan, so
      // there is nothing to call here. The optional endpoint below still runs.
      break;
  }

  /* Optional first-party sink. A Cloudflare Worker or Pages Function can log
     conversions independently of any third-party script — which keeps the data
     intact for visitors running an ad blocker, and those are exactly the
     high-intent visitors worth measuring. sendBeacon is fire-and-forget and
     never blocks the navigation. */
  if (endpoint && typeof navigator.sendBeacon === 'function') {
    try {
      navigator.sendBeacon(
        endpoint,
        new Blob([JSON.stringify({ event: EVENT_NAME, ts: Date.now(), ...payload })], {
          type: 'application/json',
        })
      );
    } catch {
      /* Never let telemetry break a conversion. */
    }
  }
}

/** Read the payload off the element's data attributes. */
export function payloadFromElement(el: HTMLElement): CtaPayload {
  return {
    ctaId: el.dataset.cta ?? 'unknown',
    location: el.dataset.ctaLocation,
    project: el.dataset.ctaProject,
    label: el.dataset.ctaLabel ?? el.textContent?.trim().slice(0, 80),
    destination: (el as HTMLAnchorElement).href,
  };
}

/**
 * Single entry point. Both the delegated listener and WhatsAppButton call this.
 * Does NOT preventDefault — see the header note.
 */
export function trackCta(el: HTMLElement, nativeEvent?: Event) {
  if (nativeEvent) {
    if (seen.has(nativeEvent)) return;
    seen.add(nativeEvent);
  }
  dispatch(payloadFromElement(el));
}

/**
 * Install the global delegated listener. Idempotent — safe to call from a
 * layout that also renders React islands.
 *
 * Capture phase so we run before any component-level handler could stop
 * propagation, and `passive` because we never call preventDefault.
 */
export function initCtaTracking() {
  if (typeof document === 'undefined' || window.__RR_CTA_BOUND__) return;
  window.__RR_CTA_BOUND__ = true;

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement | null;
      const cta = target?.closest<HTMLElement>('[data-cta]');
      if (!cta) return;
      trackCta(cta, event);
    },
    { capture: true, passive: true }
  );

  /* Middle-click and cmd+click open a new tab without firing a plain click in
     some browsers. `auxclick` catches those so the numbers stay honest. */
  document.addEventListener(
    'auxclick',
    (event) => {
      if ((event as MouseEvent).button !== 1) return;
      const target = event.target as HTMLElement | null;
      const cta = target?.closest<HTMLElement>('[data-cta]');
      if (!cta) return;
      trackCta(cta, event);
    },
    { capture: true, passive: true }
  );
}
