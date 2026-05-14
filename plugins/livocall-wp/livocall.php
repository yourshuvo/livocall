<?php
/**
 * Plugin Name:       LivoCall — Order confirmation calls
 * Plugin URI:        https://livocall.example
 * Description:       Place an AI voice confirmation call to every WooCommerce order. Configure which order statuses trigger a call, which agent handles which trigger, quiet hours, retry policy, and the metadata sent to the agent. Hooks let theme/plugin authors customize every decision.
 * Version:           0.2.0
 * Author:            LivoCall
 * License:           MIT
 * Requires at least: 6.0
 * Requires PHP:      7.4
 *
 * Customisation surface (filters / actions):
 *   apply_filters('livocall_should_call_order',        $bool, $order, $trigger)
 *   apply_filters('livocall_resolve_phone_for_order',  $phone, $order)
 *   apply_filters('livocall_agent_for_trigger',        $agent_id, $trigger, $order)
 *   apply_filters('livocall_metadata_for_order',       $array, $order, $trigger)
 *   apply_filters('livocall_in_quiet_hours',           $bool, $now_ts, $order)
 *   do_action    ('livocall_before_call',              $order, $trigger, $payload)
 *   do_action    ('livocall_after_call',               $order, $trigger, $response)
 *   do_action    ('livocall_event',                    $event)        // every webhook payload
 */

if (!defined('ABSPATH')) {
    exit;
}

// ---------------------------------------------------------------------------
// 0. Constants
// ---------------------------------------------------------------------------

define('LIVOCALL_VERSION', '0.2.0');
define('LIVOCALL_OPT_NAMESPACE', 'livocall'); // settings group

/** All Woo statuses we offer per-status toggles for. Filterable. */
function livocall_supported_triggers()
{
    return apply_filters('livocall_supported_triggers', array(
        'order.processing' => __('Order received (processing)', 'livocall'),
        'order.completed'  => __('Order completed', 'livocall'),
        'order.on-hold'    => __('Order on hold', 'livocall'),
        'order.cancelled'  => __('Order cancelled', 'livocall'),
        'order.refunded'   => __('Order refunded', 'livocall'),
        'order.failed'     => __('Order failed', 'livocall'),
        'cf7.submission'   => __('Contact Form 7 submission', 'livocall'),
        'manual'           => __('Manual call (admin button)', 'livocall'),
    ));
}

// ---------------------------------------------------------------------------
// 1. Settings registration
// ---------------------------------------------------------------------------

add_action('admin_menu', function () {
    add_options_page(
        'LivoCall',
        'LivoCall',
        'manage_options',
        'livocall',
        'livocall_render_settings'
    );
});

add_action('admin_init', function () {
    foreach (array(
        'livocall_api_base',
        'livocall_api_key',
        'livocall_default_agent_id',
        'livocall_default_from',
        'livocall_webhook_secret',
        'livocall_quiet_start',
        'livocall_quiet_end',
        'livocall_max_attempts',
        'livocall_retry_minutes',
        'livocall_triggers',     // serialized array<trigger_id, {enabled, agent_id, delay_seconds}>
        'livocall_metadata_extra', // textarea: key=value lines, sent verbatim with every call
    ) as $opt) {
        register_setting(LIVOCALL_OPT_NAMESPACE, $opt);
    }
});

function livocall_render_settings()
{
    if (!current_user_can('manage_options')) {
        return;
    }
    $triggers     = livocall_supported_triggers();
    $current_cfg  = (array) get_option('livocall_triggers', array());
    $api_base     = (string) get_option('livocall_api_base');
    $api_key_set  = (string) get_option('livocall_api_key') !== '';
    ?>
    <div class="wrap">
      <h1>LivoCall — Order confirmation calls</h1>
      <p>Place an AI voice confirmation call when an order moves to a configured status. Pick a default agent in LivoCall, or override the agent per-trigger below.</p>

      <form method="post" action="options.php">
        <?php settings_fields(LIVOCALL_OPT_NAMESPACE); ?>

        <h2><?php esc_html_e('Connection', 'livocall'); ?></h2>
        <table class="form-table">
          <tr><th scope="row"><?php esc_html_e('API base URL', 'livocall'); ?></th>
            <td><input type="url" name="livocall_api_base" value="<?php echo esc_attr($api_base); ?>" class="regular-text" placeholder="https://your-livocall-host" required /></td></tr>
          <tr><th scope="row"><?php esc_html_e('API key', 'livocall'); ?></th>
            <td><input type="password" name="livocall_api_key" value="<?php echo esc_attr(get_option('livocall_api_key')); ?>" class="regular-text" placeholder="bdv_..." />
              <?php if ($api_key_set) { ?><span class="description"><?php esc_html_e('A key is saved. Re-enter to change.', 'livocall'); ?></span><?php } ?>
            </td></tr>
          <tr><th scope="row"><?php esc_html_e('Default agent ID', 'livocall'); ?></th>
            <td><input type="text" name="livocall_default_agent_id" value="<?php echo esc_attr(get_option('livocall_default_agent_id')); ?>" class="regular-text" /></td></tr>
          <tr><th scope="row"><?php esc_html_e('Default from (E.164)', 'livocall'); ?></th>
            <td><input type="text" name="livocall_default_from" value="<?php echo esc_attr(get_option('livocall_default_from')); ?>" class="regular-text" placeholder="+8809610000000" /></td></tr>
        </table>

        <h2><?php esc_html_e('Triggers', 'livocall'); ?></h2>
        <p class="description"><?php esc_html_e('Pick which order events should originate a confirmation call. Each row can override the default agent and delay the call by N seconds.', 'livocall'); ?></p>
        <table class="widefat striped">
          <thead><tr>
            <th><?php esc_html_e('Trigger', 'livocall'); ?></th>
            <th><?php esc_html_e('Enabled', 'livocall'); ?></th>
            <th><?php esc_html_e('Agent override', 'livocall'); ?></th>
            <th><?php esc_html_e('Delay (seconds)', 'livocall'); ?></th>
          </tr></thead>
          <tbody>
            <?php foreach ($triggers as $tid => $tlabel) {
                $row = isset($current_cfg[$tid]) && is_array($current_cfg[$tid]) ? $current_cfg[$tid] : array();
                $enabled = !empty($row['enabled']);
                $agent_override = isset($row['agent_id']) ? (string) $row['agent_id'] : '';
                $delay = isset($row['delay_seconds']) ? (int) $row['delay_seconds'] : 0; ?>
              <tr>
                <td><strong><?php echo esc_html($tlabel); ?></strong><br><code><?php echo esc_html($tid); ?></code></td>
                <td><input type="checkbox" name="livocall_triggers[<?php echo esc_attr($tid); ?>][enabled]" value="1" <?php checked($enabled); ?> /></td>
                <td><input type="text" name="livocall_triggers[<?php echo esc_attr($tid); ?>][agent_id]" value="<?php echo esc_attr($agent_override); ?>" placeholder="(use default)" class="regular-text" /></td>
                <td><input type="number" min="0" max="86400" name="livocall_triggers[<?php echo esc_attr($tid); ?>][delay_seconds]" value="<?php echo esc_attr((string) $delay); ?>" /></td>
              </tr>
            <?php } ?>
          </tbody>
        </table>

        <h2><?php esc_html_e('Quiet hours', 'livocall'); ?></h2>
        <p class="description"><?php esc_html_e('Calls that fall in this window are deferred until the next allowed minute. Times are in WP site timezone.', 'livocall'); ?></p>
        <table class="form-table">
          <tr>
            <th scope="row"><?php esc_html_e('Do not call between', 'livocall'); ?></th>
            <td>
              <input type="time" name="livocall_quiet_start" value="<?php echo esc_attr(get_option('livocall_quiet_start', '22:00')); ?>" />
              &nbsp;–&nbsp;
              <input type="time" name="livocall_quiet_end" value="<?php echo esc_attr(get_option('livocall_quiet_end', '08:00')); ?>" />
            </td>
          </tr>
          <tr><th scope="row"><?php esc_html_e('Max attempts per order', 'livocall'); ?></th>
            <td><input type="number" min="1" max="10" name="livocall_max_attempts" value="<?php echo esc_attr((string) (int) get_option('livocall_max_attempts', 2)); ?>" /></td></tr>
          <tr><th scope="row"><?php esc_html_e('Retry interval (minutes)', 'livocall'); ?></th>
            <td><input type="number" min="1" max="1440" name="livocall_retry_minutes" value="<?php echo esc_attr((string) (int) get_option('livocall_retry_minutes', 30)); ?>" /></td></tr>
        </table>

        <h2><?php esc_html_e('Custom metadata', 'livocall'); ?></h2>
        <p class="description"><?php esc_html_e('Lines of key=value sent verbatim as call metadata (e.g. for prompt template variables).', 'livocall'); ?></p>
        <textarea name="livocall_metadata_extra" rows="4" cols="60" class="large-text code" placeholder="store_name=Acme Co
support_phone=+8801711000000"><?php echo esc_textarea((string) get_option('livocall_metadata_extra', '')); ?></textarea>

        <h2><?php esc_html_e('Webhooks', 'livocall'); ?></h2>
        <table class="form-table">
          <tr><th scope="row"><?php esc_html_e('Webhook signing secret', 'livocall'); ?></th>
            <td><input type="password" name="livocall_webhook_secret" value="<?php echo esc_attr(get_option('livocall_webhook_secret')); ?>" class="regular-text" placeholder="whsec_..." />
              <p class="description"><?php
                printf(
                    /* translators: %s is the webhook URL */
                    esc_html__('Verifies signed webhook deliveries to %s', 'livocall'),
                    '<code>' . esc_html(home_url('/wp-json/livocall/v1/incoming')) . '</code>'
                );
              ?></p></td></tr>
        </table>

        <?php submit_button(); ?>
      </form>
    </div>
    <?php
}

// ---------------------------------------------------------------------------
// 2. Outbound API helpers
// ---------------------------------------------------------------------------

function livocall_api($path, $body = null, $method = 'POST')
{
    $base = rtrim((string) get_option('livocall_api_base'), '/');
    $key  = (string) get_option('livocall_api_key');
    if (!$base || !$key) {
        return new WP_Error('livocall_unconfigured', 'LivoCall plugin is not configured.');
    }
    $resp = wp_remote_request($base . $path, array(
        'method'  => $method,
        'timeout' => 10,
        'headers' => array(
            'Authorization' => 'Bearer ' . $key,
            'Content-Type'  => 'application/json',
        ),
        'body'    => $body ? wp_json_encode($body) : null,
    ));
    return $resp;
}

function livocall_originate_call($to_e164, $agent_id = '', $metadata = array())
{
    if (!$agent_id) {
        $agent_id = (string) get_option('livocall_default_agent_id');
    }
    return livocall_api('/api/v1/calls', array(
        'agent_id'  => $agent_id,
        'to_e164'   => $to_e164,
        'from_e164' => get_option('livocall_default_from') ?: null,
        'metadata'  => array_merge(array('source' => 'wordpress'), (array) $metadata),
    ));
}

function livocall_optout($e164, $note = 'WordPress opt-out')
{
    return livocall_api('/api/v1/dnc', array(
        'e164'   => $e164,
        'reason' => 'user_request',
        'note'   => $note,
    ));
}

// ---------------------------------------------------------------------------
// 3. WooCommerce — order trigger handling
// ---------------------------------------------------------------------------

/** Read parsed trigger config (with sensible defaults). */
function livocall_get_trigger_config($trigger)
{
    $cfg = (array) get_option('livocall_triggers', array());
    $row = isset($cfg[$trigger]) && is_array($cfg[$trigger]) ? $cfg[$trigger] : array();
    return array(
        'enabled'       => !empty($row['enabled']),
        'agent_id'      => isset($row['agent_id']) ? trim((string) $row['agent_id']) : '',
        'delay_seconds' => isset($row['delay_seconds']) ? max(0, (int) $row['delay_seconds']) : 0,
    );
}

function livocall_parse_metadata_extra()
{
    $raw = (string) get_option('livocall_metadata_extra', '');
    $out = array();
    foreach (preg_split('/\r?\n/', $raw) as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '=') === false) {
            continue;
        }
        list($k, $v) = array_map('trim', explode('=', $line, 2));
        if ($k !== '') {
            $out[$k] = $v;
        }
    }
    return $out;
}

function livocall_in_quiet_hours_default($now_ts)
{
    $start = (string) get_option('livocall_quiet_start', '22:00');
    $end   = (string) get_option('livocall_quiet_end', '08:00');
    $tz    = function_exists('wp_timezone') ? wp_timezone() : new DateTimeZone(get_option('timezone_string') ?: 'UTC');
    $dt    = new DateTime('@' . $now_ts);
    $dt->setTimezone($tz);
    $minutes = ((int) $dt->format('H')) * 60 + (int) $dt->format('i');
    list($sh, $sm) = array_map('intval', explode(':', $start));
    list($eh, $em) = array_map('intval', explode(':', $end));
    $sm_total = $sh * 60 + $sm;
    $em_total = $eh * 60 + $em;
    if ($sm_total === $em_total) {
        return false; // disabled
    }
    if ($sm_total < $em_total) {
        return $minutes >= $sm_total && $minutes < $em_total;
    }
    // window wraps midnight
    return $minutes >= $sm_total || $minutes < $em_total;
}

function livocall_resolve_phone_for_order_default($order)
{
    if (!is_object($order)) {
        return '';
    }
    $billing = method_exists($order, 'get_billing_phone') ? (string) $order->get_billing_phone() : '';
    $shipping = method_exists($order, 'get_shipping_phone') ? (string) $order->get_shipping_phone() : '';
    return $billing ?: $shipping;
}

function livocall_metadata_for_order_default($order, $trigger)
{
    if (!is_object($order)) {
        return array();
    }
    $items = array();
    if (method_exists($order, 'get_items')) {
        foreach ($order->get_items() as $item) {
            $items[] = sprintf('%s × %d', $item->get_name(), $item->get_quantity());
        }
    }
    return array_filter(array(
        'trigger'      => $trigger,
        'order_id'     => method_exists($order, 'get_id') ? (string) $order->get_id() : '',
        'order_number' => method_exists($order, 'get_order_number') ? (string) $order->get_order_number() : '',
        'currency'     => method_exists($order, 'get_currency') ? (string) $order->get_currency() : '',
        'total'        => method_exists($order, 'get_total') ? (string) $order->get_total() : '',
        'customer'     => method_exists($order, 'get_formatted_billing_full_name') ? (string) $order->get_formatted_billing_full_name() : '',
        'items'        => $items ? implode(', ', $items) : '',
    ), function ($v) { return $v !== ''; });
}

function livocall_dispatch_order_trigger($trigger, $order)
{
    $cfg = livocall_get_trigger_config($trigger);
    if (!$cfg['enabled']) {
        return;
    }

    if (!apply_filters('livocall_should_call_order', true, $order, $trigger)) {
        return;
    }

    if (apply_filters('livocall_in_quiet_hours', livocall_in_quiet_hours_default(time()), time(), $order)) {
        // Defer to retry cron with the configured retry interval.
        $delay_seconds = max(60, (int) get_option('livocall_retry_minutes', 30) * 60);
        wp_schedule_single_event(time() + $delay_seconds, 'livocall_retry_order_trigger', array($trigger, method_exists($order, 'get_id') ? $order->get_id() : 0));
        return;
    }

    if ($cfg['delay_seconds'] > 0) {
        wp_schedule_single_event(time() + $cfg['delay_seconds'], 'livocall_retry_order_trigger', array($trigger, method_exists($order, 'get_id') ? $order->get_id() : 0));
        return;
    }

    livocall_run_order_call($trigger, $order);
}

function livocall_run_order_call($trigger, $order)
{
    $phone = apply_filters('livocall_resolve_phone_for_order', livocall_resolve_phone_for_order_default($order), $order);
    if (!$phone) {
        return;
    }

    $default_agent = (string) get_option('livocall_default_agent_id');
    $cfg = livocall_get_trigger_config($trigger);
    $agent_id = $cfg['agent_id'] !== '' ? $cfg['agent_id'] : $default_agent;
    $agent_id = (string) apply_filters('livocall_agent_for_trigger', $agent_id, $trigger, $order);
    if (!$agent_id) {
        return;
    }

    $metadata = array_merge(
        livocall_parse_metadata_extra(),
        livocall_metadata_for_order_default($order, $trigger)
    );
    $metadata = (array) apply_filters('livocall_metadata_for_order', $metadata, $order, $trigger);

    $payload = array(
        'agent_id'  => $agent_id,
        'to_e164'   => $phone,
        'from_e164' => get_option('livocall_default_from') ?: null,
        'metadata'  => array_map('strval', $metadata),
    );

    do_action('livocall_before_call', $order, $trigger, $payload);
    $resp = livocall_api('/api/v1/calls', $payload);
    do_action('livocall_after_call', $order, $trigger, $resp);

    if (is_object($order) && method_exists($order, 'add_order_note') && !is_wp_error($resp)) {
        $body = wp_remote_retrieve_body($resp);
        $decoded = json_decode($body, true);
        $cid = is_array($decoded) && !empty($decoded['callId']) ? $decoded['callId'] : '';
        $order->add_order_note(sprintf(
            /* translators: 1 trigger key, 2 phone, 3 call id */
            __('LivoCall triggered (%1$s) → %2$s, callId=%3$s', 'livocall'),
            $trigger,
            $phone,
            $cid ?: 'unknown'
        ));
    }
}

// Cron handler for delayed / quiet-hour-deferred calls.
add_action('livocall_retry_order_trigger', function ($trigger, $order_id) {
    if (!function_exists('wc_get_order')) {
        return;
    }
    $order = wc_get_order((int) $order_id);
    if ($order) {
        livocall_run_order_call($trigger, $order);
    }
}, 10, 2);

// Map every Woo status transition to a LivoCall trigger.
foreach (array('processing', 'completed', 'on-hold', 'cancelled', 'refunded', 'failed') as $status) {
    add_action("woocommerce_order_status_{$status}", function ($order_id) use ($status) {
        if (!function_exists('wc_get_order')) {
            return;
        }
        $order = wc_get_order((int) $order_id);
        if ($order) {
            livocall_dispatch_order_trigger("order.{$status}", $order);
        }
    });
}

// ---------------------------------------------------------------------------
// 4. CF7 trigger
// ---------------------------------------------------------------------------

add_action('wpcf7_mail_sent', function ($contact_form) {
    if (!function_exists('WPCF7_Submission')) {
        return;
    }
    $sub = WPCF7_Submission::get_instance();
    if (!$sub) {
        return;
    }
    $cfg = livocall_get_trigger_config('cf7.submission');
    if (!$cfg['enabled']) {
        return;
    }
    $data = $sub->get_posted_data();
    foreach (array('your-phone', 'phone', 'tel', 'mobile') as $field) {
        if (!empty($data[$field])) {
            $agent_id = $cfg['agent_id'] !== '' ? $cfg['agent_id'] : (string) get_option('livocall_default_agent_id');
            livocall_originate_call((string) $data[$field], $agent_id, array(
                'trigger'    => 'cf7.submission',
                'form_title' => $contact_form->title(),
            ));
            break;
        }
    }
});

// ---------------------------------------------------------------------------
// 5. Manual "Call this customer" button on the order edit page
// ---------------------------------------------------------------------------

add_action('woocommerce_order_actions', function ($actions) {
    $actions['livocall_manual_call'] = __('Call customer with LivoCall', 'livocall');
    return $actions;
});

add_action('woocommerce_order_action_livocall_manual_call', function ($order) {
    if ($order) {
        livocall_run_order_call('manual', $order);
    }
});

// ---------------------------------------------------------------------------
// 6. Webhook receiver (signed)
// ---------------------------------------------------------------------------

add_action('rest_api_init', function () {
    register_rest_route('livocall/v1', '/incoming', array(
        'methods'             => 'POST',
        'permission_callback' => '__return_true',
        'callback'            => function (WP_REST_Request $req) {
            $secret = (string) get_option('livocall_webhook_secret');
            $sig    = $req->get_header('livocall-signature') ?: '';
            $raw    = $req->get_body();
            if ($secret) {
                if (!livocall_verify_signature($secret, $raw, $sig)) {
                    return new WP_REST_Response(array('error' => 'bad_signature'), 401);
                }
            }
            $event = json_decode($raw, true);
            do_action('livocall_event', $event);
            return array('ok' => true);
        },
    ));
});

function livocall_verify_signature($secret, $raw, $header)
{
    $parts = array();
    foreach (explode(',', (string) $header) as $kv) {
        $kv = trim($kv);
        if (false !== strpos($kv, '=')) {
            list($k, $v) = explode('=', $kv, 2);
            $parts[$k]   = $v;
        }
    }
    if (empty($parts['t']) || empty($parts['v1'])) {
        return false;
    }
    if (abs(time() - intval($parts['t'])) > 300) {
        return false;
    }
    $expected = hash_hmac('sha256', $parts['t'] . '.' . $raw, $secret);
    return hash_equals($expected, $parts['v1']);
}
