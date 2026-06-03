# Billing — production readiness (CP-8)

Maps reviewer #9's "billing must prove" list to where each is satisfied.

| Requirement | Where | Notes |
|---|---|---|
| Real checkout session | `BillingService.startCheckout` → `StripeService.createCheckoutSession` | Real Stripe Checkout when keys present. |
| Real customer portal | `openPortal` → `createBillingPortalSession` | Real Stripe Billing Portal. |
| Webhook signature verification | `BillingController.webhook` → `StripeService.constructWebhookEvent` | Verifies `stripe-signature` against `STRIPE_WEBHOOK_SECRET` over the raw body (`rawBody: true`); bad signature → 400. |
| Subscription status updates | `handleWebhook` → `applySubscriptionState` | Idempotent (dedupe on Stripe event id); maps Stripe status → plan/status; `customer.subscription.deleted` → FREE/CANCELED. |
| Plan enforcement | `@RequirePlan` decorator + `require-plan.guard` + `resolveEffectivePlan` | A plan only confers entitlement while in an ENTITLED status, else FREE. |
| Usage limits / partner API billing | `partner-keys` plan-limits | Partner API keys carry a quota plan. |
| Enterprise invoice support | `setManualInvoice` (SUPER_ADMIN) | MANUAL status + `manualInvoice` flag. |
| Audit log for billing changes | `recordBillingAudit` → `AuditLog` (+ Evidence Vault + `BillingEvent`) | Every checkout/portal/manual-invoice/webhook state change writes a `BILLING_*` AuditLog row. `GET /billing/events` exposes the trail. |

## Production guard (the key CP-8 change)
`assertBillingConfiguredInProduction()` runs at the top of `startCheckout` and
`openPortal`: **in `NODE_ENV=production`, if Stripe isn't configured it throws
503** instead of returning the dev `stub.billing.local` placeholder URLs
(reviewer: "remove placeholder checkout/portal behavior from production mode").
Stub mode stays available in dev/test so the flow is exercisable without keys.

## To go live
Set on the backend container app: `STRIPE_SECRET_KEY` (sk_live_…),
`STRIPE_WEBHOOK_SECRET` (the **snapshot** destination secret),
`STRIPE_PRICE_BASIC` / `STRIPE_PRICE_FAMILY_GUARDIAN` / `STRIPE_PRICE_PREMIUM_SHIELD`.
Verified by `GET /billing/subscription` → `stripeConfigured: true`.
