# Watermelon UI components

Adapted from [Watermelon UI](https://ui.watermelon.sh) (open source, Tailwind + motion):

| File | Based on | Changes |
|---|---|---|
| `nav-pill.tsx` | `continuous-tabs` | Links + current route instead of local state; TicketRush colours |
| `checkout-steps.tsx` | `step-indicator` | Shows real progress (done / current / upcoming) instead of hover-only |
| `queue-progress.tsx` | `labeled-progress-indicator` | Real progress value, rotating status labels, reduced-motion safe |
| `copy-confirm.tsx` | `copy-confirm` | Compact inline version for payment references |
| `event-poster-card.tsx` | `expandable-event-card` | Generated poster art, event details and a "Choose seats" action |
| `faq-accordion.tsx` | `faq-1` | Motion accordion, no Radix dependency |
| `inline-notice.tsx` | `inline-toast` | Status and error messages with the same spring transitions |
| Shimmer on `.btn-primary` | `shimmer-button` | Implemented in CSS so every primary button shares it |
