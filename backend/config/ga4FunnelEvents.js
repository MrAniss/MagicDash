const DEFAULT_FUNNEL_EVENTS = [
  { key: 'add_to_cart',       label: 'Panier',             order: 1 },
  { key: 'begin_checkout',    label: 'Début checkout',     order: 2 },
  { key: 'add_shipping_info', label: 'Choix transporteur', order: 3 },
  { key: 'add_payment_info',  label: 'Choix paiement',     order: 4 },
  { key: 'purchase',          label: 'Confirmation',       order: 5 },
];

// Per-brand overrides: map step key → actual GA4 event name used on that property
// Example: COCOONCENTER: { add_to_cart: 'step_cart' }
const BRAND_OVERRIDES = {};

export function getFunnelEvents(brand) {
  const overrides = BRAND_OVERRIDES[brand] || {};
  return DEFAULT_FUNNEL_EVENTS.map(step => ({
    ...step,
    eventName: overrides[step.key] || step.key,
  }));
}

export { DEFAULT_FUNNEL_EVENTS };
