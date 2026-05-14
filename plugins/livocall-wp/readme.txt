=== LivoCall — Order confirmation calls ===
Contributors: livocall
Tags: voice, ai, woocommerce, order confirmation, call, ivr, telephony
Requires at least: 6.0
Tested up to: 6.5
Requires PHP: 7.4
Stable tag: 0.2.0
License: MIT

Place an AI voice confirmation call to every WooCommerce order. Per-status triggers, per-trigger agent + delay, quiet hours, retry, manual "Call customer" button, full filter/action surface for theme & plugin authors.

== Description ==

* Configurable triggers — Order processing / completed / on-hold / cancelled / refunded / failed, plus Contact Form 7 submission and a manual button on the order edit page. Pick which ones fire calls, with a per-trigger agent override and an optional delay.
* Quiet hours — Defer any call that lands inside the do-not-call window (e.g. 22:00–08:00) until the next allowed minute via `wp_schedule_single_event`.
* Custom metadata — Lines of `key=value` are sent verbatim as call metadata so your LivoCall agent's prompt template can reference order details.
* Webhooks — A signed receiver at `/wp-json/livocall/v1/incoming` fires the `livocall_event` action on every payload LivoCall sends.
* Manual button — Every WooCommerce order edit page gains a "Call customer with LivoCall" entry in the Order actions box.
* Order notes — Every successful trigger writes a note on the order with the LivoCall call id.

== Customisation surface ==

Filters:
* `livocall_supported_triggers`     — array<trigger_id, label>
* `livocall_should_call_order`      — return false to veto a call
* `livocall_resolve_phone_for_order` — override which phone to dial
* `livocall_agent_for_trigger`      — override which agent handles the trigger
* `livocall_metadata_for_order`     — mutate the metadata sent to the agent
* `livocall_in_quiet_hours`         — override the quiet-hours decision

Actions:
* `livocall_before_call` (order, trigger, payload) — observe / mutate just before sending
* `livocall_after_call`  (order, trigger, response) — handle the API response
* `livocall_event`       (event)                   — every signed webhook payload

== Installation ==

1. Upload the plugin folder to `wp-content/plugins/`.
2. Activate "LivoCall — Order confirmation calls".
3. In WP-Admin → Settings → LivoCall paste your LivoCall API base + API key (mint one in LivoCall → Connections → WordPress).
4. Tick the order statuses you want to confirm and pick a default agent.

== Changelog ==

= 0.2.0 =
* Refocused around WooCommerce order-confirmation calls
* Per-trigger agent + delay; quiet hours; max attempts + retry interval
* Manual "Call customer" order action button
* Order notes on every dispatched call
* Filter/action surface for theme & plugin authors

= 0.1.0 =
* Initial release.
