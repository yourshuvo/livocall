<?php
/**
 * Plugin Name:       LivoCall — Order confirmation calls
 * Plugin URI:        https://livocall.example
 * Description:       Place an AI voice confirmation call to every WooCommerce order. Configure which order statuses trigger a call, which agent handles which trigger, quiet hours, retry policy, and the metadata sent to the agent. Hooks let theme/plugin authors customize every decision.
 * Version:           0.4.0
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

define('LIVOCALL_VERSION', '0.4.0');
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
        'wpforms.submission' => __('WPForms submission', 'livocall'),
        'gravity_forms.submission' => __('Gravity Forms submission', 'livocall'),
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
        'livocall_connection_token',
        'livocall_connection_id',
        'livocall_signing_secret',
        'livocall_sync_contacts',
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
    $connection_id = (string) get_option('livocall_connection_id');
    $signing_secret_set = (string) get_option('livocall_signing_secret') !== '';
    $last_register_error = (string) get_option('livocall_last_register_error');
    ?>
    <div class="wrap">
      <h1>LivoCall — Order confirmation calls</h1>
      <p>Place an AI voice confirmation call when an order moves to a configured status. Pick a default agent in LivoCall, or override the agent per-trigger below.</p>

      <?php if (!empty($_GET['livocall_oauth']) && $_GET['livocall_oauth'] === 'connected') { ?>
        <div class="notice notice-success"><p><?php esc_html_e('LivoCall OAuth connection is active.', 'livocall'); ?></p></div>
      <?php } elseif (!empty($_GET['livocall_oauth']) && $_GET['livocall_oauth'] === 'disconnected') { ?>
        <div class="notice notice-warning"><p><?php esc_html_e('LivoCall signed connection was disconnected locally.', 'livocall'); ?></p></div>
      <?php } elseif ($last_register_error !== '') { ?>
        <div class="notice notice-error"><p><?php echo esc_html($last_register_error); ?></p></div>
      <?php } ?>

      <h2><?php esc_html_e('Connect with LivoCall', 'livocall'); ?></h2>
      <p class="description"><?php esc_html_e('Recommended setup: sign in to LivoCall, choose the default agent and outbound number there, then return connected to WordPress.', 'livocall'); ?></p>
      <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin: 12px 0 24px;">
        <input type="hidden" name="action" value="livocall_oauth_start" />
        <?php wp_nonce_field('livocall_oauth_start'); ?>
        <table class="form-table">
          <tr><th scope="row"><?php esc_html_e('LivoCall URL', 'livocall'); ?></th>
            <td><input type="url" name="livocall_api_base" value="<?php echo esc_attr($api_base); ?>" class="regular-text" placeholder="https://your-livocall-host" required /></td></tr>
          <tr><th scope="row"><?php esc_html_e('Status', 'livocall'); ?></th>
            <td>
              <?php if ($connection_id && $signing_secret_set) { ?>
                <code><?php echo esc_html($connection_id); ?></code>
                <span class="description"><?php esc_html_e('Signed OAuth/token connection is active.', 'livocall'); ?></span>
              <?php } else { ?>
                <span class="description"><?php esc_html_e('Not connected yet.', 'livocall'); ?></span>
              <?php } ?>
            </td></tr>
        </table>
        <?php submit_button($connection_id && $signing_secret_set ? __('Reconnect with LivoCall', 'livocall') : __('Connect with LivoCall', 'livocall'), 'primary', 'submit', false); ?>
      </form>

      <?php if ($connection_id || $signing_secret_set) { ?>
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin: -12px 0 24px;">
          <input type="hidden" name="action" value="livocall_oauth_disconnect" />
          <?php wp_nonce_field('livocall_oauth_disconnect'); ?>
          <?php submit_button(__('Disconnect signed connection', 'livocall'), 'delete', 'submit', false); ?>
        </form>
      <?php } ?>

      <form method="post" action="options.php">
        <?php settings_fields(LIVOCALL_OPT_NAMESPACE); ?>

        <h2><?php esc_html_e('Connection', 'livocall'); ?></h2>
        <table class="form-table">
          <tr><th scope="row"><?php esc_html_e('API base URL', 'livocall'); ?></th>
            <td><input type="url" name="livocall_api_base" value="<?php echo esc_attr($api_base); ?>" class="regular-text" placeholder="https://your-livocall-host" required /></td></tr>
          <tr><th scope="row"><?php esc_html_e('Connection token', 'livocall'); ?></th>
            <td><input type="password" name="livocall_connection_token" value="<?php echo esc_attr(get_option('livocall_connection_token')); ?>" class="regular-text" placeholder="lvo_wpconn_..." />
              <p class="description"><?php esc_html_e('Paste the one-time token from LivoCall Connections. The plugin exchanges it for a signed connection automatically after saving.', 'livocall'); ?></p>
            </td></tr>
          <tr><th scope="row"><?php esc_html_e('Signed connection', 'livocall'); ?></th>
            <td>
              <?php if ($connection_id && $signing_secret_set) { ?>
                <code><?php echo esc_html($connection_id); ?></code>
                <span class="description"><?php esc_html_e('Signed event mode is active.', 'livocall'); ?></span>
              <?php } else { ?>
                <span class="description"><?php esc_html_e('Not registered yet. Save a token above to enable signed event mode.', 'livocall'); ?></span>
              <?php } ?>
              <input type="hidden" name="livocall_connection_id" value="<?php echo esc_attr($connection_id); ?>" />
              <input type="hidden" name="livocall_signing_secret" value="<?php echo esc_attr(get_option('livocall_signing_secret')); ?>" />
            </td></tr>
          <tr><th scope="row"><?php esc_html_e('API key', 'livocall'); ?></th>
            <td><input type="password" name="livocall_api_key" value="<?php echo esc_attr(get_option('livocall_api_key')); ?>" class="regular-text" placeholder="bdv_..." />
              <?php if ($api_key_set) { ?><span class="description"><?php esc_html_e('Legacy direct-call key is saved. Signed connection mode takes priority when registered.', 'livocall'); ?></span><?php } ?>
            </td></tr>
          <tr><th scope="row"><?php esc_html_e('Default agent ID', 'livocall'); ?></th>
            <td><input type="text" name="livocall_default_agent_id" value="<?php echo esc_attr(get_option('livocall_default_agent_id')); ?>" class="regular-text" /></td></tr>
          <tr><th scope="row"><?php esc_html_e('Default from (E.164)', 'livocall'); ?></th>
            <td><input type="text" name="livocall_default_from" value="<?php echo esc_attr(get_option('livocall_default_from')); ?>" class="regular-text" placeholder="+8809610000000" /></td></tr>
          <tr><th scope="row"><?php esc_html_e('Customer sync', 'livocall'); ?></th>
            <td><input type="hidden" name="livocall_sync_contacts" value="0" /><label><input type="checkbox" name="livocall_sync_contacts" value="1" <?php checked((string) get_option('livocall_sync_contacts', '1'), '1'); ?> />
              <?php esc_html_e('Sync WooCommerce customers and form leads to LivoCall Contacts for campaigns and conversational agents.', 'livocall'); ?></label></td></tr>
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

function livocall_registered_connection()
{
    return (string) get_option('livocall_connection_id') !== '' && (string) get_option('livocall_signing_secret') !== '';
}

function livocall_sign_body($secret, $raw)
{
    $t = time();
    return 't=' . $t . ',v1=' . hash_hmac('sha256', $t . '.' . $raw, $secret);
}

function livocall_signed_api($path, $body)
{
    $base = rtrim((string) get_option('livocall_api_base'), '/');
    $secret = (string) get_option('livocall_signing_secret');
    if (!$base || !$secret) {
        return new WP_Error('livocall_unconfigured', 'LivoCall signed connection is not configured.');
    }
    $raw = wp_json_encode($body);
    return wp_remote_post($base . $path, array(
        'timeout' => 12,
        'headers' => array(
            'Content-Type' => 'application/json',
            'livocall-signature' => livocall_sign_body($secret, $raw),
        ),
        'body' => $raw,
    ));
}

function livocall_contacts_sync_enabled()
{
    return (string) get_option('livocall_sync_contacts', '1') === '1';
}

function livocall_sync_contacts($contacts)
{
    if (!livocall_registered_connection() || !livocall_contacts_sync_enabled()) {
        return null;
    }
    $clean = array();
    $seen = array();
    foreach ((array) $contacts as $contact) {
        if (!is_array($contact)) {
            continue;
        }
        $phone = isset($contact['phone']) ? trim((string) $contact['phone']) : '';
        $e164 = isset($contact['e164']) ? trim((string) $contact['e164']) : '';
        $dedupe = $e164 ?: $phone;
        if ($dedupe === '' || isset($seen[$dedupe])) {
            continue;
        }
        $seen[$dedupe] = true;
        $clean[] = $contact;
    }
    if (!$clean) {
        return null;
    }
    return livocall_signed_api('/api/v1/integrations/wordpress/customers', array(
        'connectionId' => (string) get_option('livocall_connection_id'),
        'contacts' => array_slice($clean, 0, 1000),
    ));
}

function livocall_contact_from_order($order, $trigger = '')
{
    if (!is_object($order)) {
        return null;
    }
    $phone = livocall_resolve_phone_for_order_default($order);
    if (!$phone) {
        return null;
    }
    $order_id = method_exists($order, 'get_id') ? (string) $order->get_id() : '';
    $name = method_exists($order, 'get_formatted_billing_full_name') ? (string) $order->get_formatted_billing_full_name() : '';
    $order_payload = livocall_order_payload($order, $trigger);
    $items_summary = isset($order_payload['order']['items_summary']) ? $order_payload['order']['items_summary'] : '';
    return array(
        'phone' => $phone,
        'name' => $name,
        'email' => method_exists($order, 'get_billing_email') ? (string) $order->get_billing_email() : '',
        'locale' => 'mixed',
        'tags' => array_filter(array('wordpress', 'woocommerce', 'customer', $trigger ? str_replace('.', '-', $trigger) : '')),
        'attrs' => array_filter(array(
            'source' => 'wordpress',
            'wordpressResourceType' => 'order',
            'wordpressOrderId' => $order_id,
            'wordpressOrderNumber' => method_exists($order, 'get_order_number') ? (string) $order->get_order_number() : '',
            'wordpressOrderStatus' => method_exists($order, 'get_status') ? (string) $order->get_status() : '',
            'lastOrderTotal' => method_exists($order, 'get_total') ? (string) $order->get_total() : '',
            'lastOrderCurrency' => method_exists($order, 'get_currency') ? (string) $order->get_currency() : '',
            'lastOrderItems' => $items_summary,
        ), function ($value) { return $value !== ''; }),
    );
}

function livocall_contact_from_form_payload($payload, $source, $form_title, $resource_id = '')
{
    if (!is_array($payload)) {
        return null;
    }
    $lead = isset($payload['lead']) && is_array($payload['lead']) ? $payload['lead'] : array();
    $phone = isset($lead['phone']) ? (string) $lead['phone'] : '';
    if (!$phone) {
        return null;
    }
    $attrs = array(
        'source' => 'wordpress',
        'wordpressResourceType' => 'form_lead',
        'wordpressFormSource' => $source,
        'wordpressFormTitle' => $form_title,
        'wordpressLeadId' => (string) $resource_id,
    );
    if (isset($lead['email'])) {
        $attrs['email'] = (string) $lead['email'];
    }
    if (isset($lead['message'])) {
        $attrs['message'] = (string) $lead['message'];
    }
    return array(
        'phone' => $phone,
        'name' => isset($lead['name']) ? (string) $lead['name'] : '',
        'email' => isset($lead['email']) ? (string) $lead['email'] : '',
        'locale' => 'mixed',
        'tags' => array_filter(array('wordpress', 'lead', $source)),
        'attrs' => array_filter($attrs, function ($value) { return $value !== ''; }),
    );
}

function livocall_base64url($raw)
{
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function livocall_random_url_token($bytes = 32)
{
    if (function_exists('random_bytes')) {
        try {
            return livocall_base64url(random_bytes($bytes));
        } catch (Exception $e) {
            // Fall back below.
        }
    }
    return wp_generate_password(max(32, $bytes), false, false);
}

function livocall_oauth_transient_key($state)
{
    return 'livocall_oauth_' . md5((string) $state);
}

function livocall_settings_url($args = array())
{
    return add_query_arg($args, admin_url('options-general.php?page=livocall'));
}

function livocall_oauth_redirect_error($message)
{
    update_option('livocall_last_register_error', sanitize_text_field($message));
    wp_safe_redirect(livocall_settings_url(array('livocall_oauth' => 'error')));
    exit;
}

function livocall_oauth_start()
{
    if (!current_user_can('manage_options')) {
        wp_die(esc_html__('You do not have permission to connect LivoCall.', 'livocall'));
    }
    check_admin_referer('livocall_oauth_start');
    $base = isset($_POST['livocall_api_base']) ? esc_url_raw(wp_unslash($_POST['livocall_api_base'])) : '';
    $base = rtrim($base, '/');
    $base_parts = $base ? wp_parse_url($base) : false;
    if (
        !$base_parts ||
        empty($base_parts['scheme']) ||
        empty($base_parts['host']) ||
        !in_array($base_parts['scheme'], array('http', 'https'), true)
    ) {
        livocall_oauth_redirect_error(__('Enter a valid LivoCall URL before connecting.', 'livocall'));
    }
    update_option('livocall_api_base', $base);
    $state = livocall_random_url_token(24);
    $verifier = livocall_random_url_token(48);
    $callback = admin_url('admin-post.php?action=livocall_oauth_callback');
    set_transient(
        livocall_oauth_transient_key($state),
        array(
            'code_verifier' => $verifier,
            'api_base' => $base,
            'callback_url' => $callback,
            'site_url' => home_url('/'),
        ),
        10 * MINUTE_IN_SECONDS
    );
    $authorize = add_query_arg(
        array(
            'state' => $state,
            'callbackUrl' => $callback,
            'siteUrl' => home_url('/'),
            'siteName' => get_bloginfo('name'),
            'pluginVersion' => LIVOCALL_VERSION,
            'codeChallenge' => livocall_base64url(hash('sha256', $verifier, true)),
            'codeChallengeMethod' => 'S256',
        ),
        $base . '/integrations/wordpress/oauth/authorize'
    );
    update_option('livocall_last_register_error', '');
    wp_redirect($authorize);
    exit;
}
add_action('admin_post_livocall_oauth_start', 'livocall_oauth_start');

function livocall_oauth_callback()
{
    if (!current_user_can('manage_options')) {
        wp_die(esc_html__('You do not have permission to connect LivoCall.', 'livocall'));
    }
    $error = isset($_GET['error']) ? sanitize_text_field(wp_unslash($_GET['error'])) : '';
    if ($error !== '') {
        livocall_oauth_redirect_error($error);
    }
    $state = isset($_GET['state']) ? sanitize_text_field(wp_unslash($_GET['state'])) : '';
    $code = isset($_GET['code']) ? sanitize_text_field(wp_unslash($_GET['code'])) : '';
    if (!$state || !$code) {
        livocall_oauth_redirect_error(__('LivoCall did not return an authorization code.', 'livocall'));
    }
    $transient_key = livocall_oauth_transient_key($state);
    $oauth = get_transient($transient_key);
    if (!is_array($oauth) || empty($oauth['code_verifier']) || empty($oauth['api_base'])) {
        livocall_oauth_redirect_error(__('The LivoCall connection session expired. Please try again.', 'livocall'));
    }
    $body = array(
        'code' => $code,
        'codeVerifier' => (string) $oauth['code_verifier'],
        'state' => $state,
        'callbackUrl' => (string) $oauth['callback_url'],
        'siteUrl' => (string) $oauth['site_url'],
    );
    $resp = wp_remote_post(rtrim((string) $oauth['api_base'], '/') . '/api/v1/integrations/wordpress/oauth/exchange', array(
        'timeout' => 12,
        'headers' => array('Content-Type' => 'application/json'),
        'body' => wp_json_encode($body),
    ));
    if (is_wp_error($resp)) {
        livocall_oauth_redirect_error($resp->get_error_message());
    }
    $decoded = json_decode(wp_remote_retrieve_body($resp), true);
    if (!is_array($decoded) || empty($decoded['connectionId']) || empty($decoded['signingSecret'])) {
        livocall_oauth_redirect_error(wp_remote_retrieve_body($resp) ?: __('LivoCall OAuth exchange failed.', 'livocall'));
    }
    update_option('livocall_connection_id', sanitize_text_field($decoded['connectionId']));
    update_option('livocall_signing_secret', sanitize_text_field($decoded['signingSecret']));
    update_option('livocall_connection_token', '');
    update_option('livocall_last_register_error', '');
    delete_transient($transient_key);
    livocall_sync_capabilities_and_samples();
    wp_safe_redirect(livocall_settings_url(array('livocall_oauth' => 'connected')));
    exit;
}
add_action('admin_post_livocall_oauth_callback', 'livocall_oauth_callback');

function livocall_oauth_disconnect()
{
    if (!current_user_can('manage_options')) {
        wp_die(esc_html__('You do not have permission to disconnect LivoCall.', 'livocall'));
    }
    check_admin_referer('livocall_oauth_disconnect');
    update_option('livocall_connection_id', '');
    update_option('livocall_signing_secret', '');
    update_option('livocall_connection_token', '');
    update_option('livocall_last_register_error', '');
    wp_safe_redirect(livocall_settings_url(array('livocall_oauth' => 'disconnected')));
    exit;
}
add_action('admin_post_livocall_oauth_disconnect', 'livocall_oauth_disconnect');

function livocall_platform_register_if_needed()
{
    if (!is_admin() || !current_user_can('manage_options')) {
        return;
    }
    if (livocall_registered_connection()) {
        return;
    }
    $base = rtrim((string) get_option('livocall_api_base'), '/');
    $token = trim((string) get_option('livocall_connection_token'));
    if (!$base || !$token) {
        return;
    }
    $body = array(
        'token' => $token,
        'siteUrl' => home_url('/'),
        'siteName' => get_bloginfo('name'),
        'pluginVersion' => LIVOCALL_VERSION,
    );
    $resp = wp_remote_post($base . '/api/v1/integrations/wordpress/register', array(
        'timeout' => 12,
        'headers' => array('Content-Type' => 'application/json'),
        'body' => wp_json_encode($body),
    ));
    if (is_wp_error($resp)) {
        update_option('livocall_last_register_error', $resp->get_error_message());
        return;
    }
    $decoded = json_decode(wp_remote_retrieve_body($resp), true);
    if (!is_array($decoded) || empty($decoded['connectionId']) || empty($decoded['signingSecret'])) {
        update_option('livocall_last_register_error', wp_remote_retrieve_body($resp));
        return;
    }
    update_option('livocall_connection_id', sanitize_text_field($decoded['connectionId']));
    update_option('livocall_signing_secret', sanitize_text_field($decoded['signingSecret']));
    update_option('livocall_connection_token', '');
    update_option('livocall_last_register_error', '');
    livocall_sync_capabilities_and_samples();
}
add_action('admin_init', 'livocall_platform_register_if_needed', 20);

function livocall_capabilities_payload()
{
    return array(
        'woocommerce' => class_exists('WooCommerce') || function_exists('wc_get_order'),
        'forms' => array(
            'contact_form_7' => defined('WPCF7_VERSION') || class_exists('WPCF7_ContactForm'),
            'wpforms' => function_exists('wpforms') || class_exists('WPForms'),
            'gravity_forms' => class_exists('GFForms'),
        ),
        'pluginVersion' => LIVOCALL_VERSION,
        'siteUrl' => home_url('/'),
    );
}

function livocall_sync_capabilities_and_samples()
{
    if (!livocall_registered_connection()) {
        return;
    }
    $connection_id = (string) get_option('livocall_connection_id');
    livocall_signed_api('/api/v1/integrations/wordpress/capabilities', array(
        'connectionId' => $connection_id,
        'capabilities' => livocall_capabilities_payload(),
        'site' => array('name' => get_bloginfo('name'), 'url' => home_url('/')),
    ));
    $samples = array();
    if (function_exists('wc_get_orders')) {
        $orders = wc_get_orders(array('limit' => 1, 'orderby' => 'date', 'order' => 'DESC'));
        if (!empty($orders[0])) {
            $samples[] = array('kind' => 'woocommerce_order', 'sample' => livocall_order_payload($orders[0], 'sample'));
        }
    }
    if (!$samples) {
        $samples[] = array(
            'kind' => 'woocommerce_order',
            'sample' => array(
                'order' => array('id' => '1234', 'number' => 'LC-1234', 'total' => '2450', 'currency' => 'BDT', 'items_summary' => 'Black Panjabi x 1'),
                'customer' => array('name' => 'Rahim Uddin', 'phone' => '+8801711000000'),
                'products' => array(array('name' => 'Black Panjabi', 'quantity' => 1)),
            ),
        );
    }
    $samples[] = array(
        'kind' => 'form_lead',
        'sample' => array(
            'lead' => array('name' => 'Lead name', 'phone' => '+8801711000000', 'email' => 'customer@example.com', 'message' => 'I need a call back'),
        ),
    );
    livocall_signed_api('/api/v1/integrations/wordpress/samples', array(
        'connectionId' => $connection_id,
        'samples' => $samples,
    ));
    if (function_exists('wc_get_orders')) {
        $orders = wc_get_orders(array('limit' => 50, 'orderby' => 'date', 'order' => 'DESC'));
        $contacts = array();
        foreach ($orders as $order) {
            $contact = livocall_contact_from_order($order, 'sync');
            if ($contact) {
                $contacts[] = $contact;
            }
        }
        livocall_sync_contacts($contacts);
    }
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

function livocall_order_payload($order, $trigger)
{
    $products = array();
    $items_summary = array();
    if (is_object($order) && method_exists($order, 'get_items')) {
        foreach ($order->get_items() as $item) {
            $product = method_exists($item, 'get_product') ? $item->get_product() : null;
            $name = method_exists($item, 'get_name') ? (string) $item->get_name() : '';
            $qty = method_exists($item, 'get_quantity') ? (int) $item->get_quantity() : 1;
            $products[] = array(
                'name' => $name,
                'quantity' => $qty,
                'sku' => is_object($product) && method_exists($product, 'get_sku') ? (string) $product->get_sku() : '',
            );
            $items_summary[] = trim($name . ' x ' . $qty);
        }
    }
    $billing_address = is_object($order) && method_exists($order, 'get_formatted_billing_address')
        ? wp_strip_all_tags((string) $order->get_formatted_billing_address())
        : '';
    $shipping_address = is_object($order) && method_exists($order, 'get_formatted_shipping_address')
        ? wp_strip_all_tags((string) $order->get_formatted_shipping_address())
        : '';
    return array(
        'trigger' => $trigger,
        'order' => array(
            'id' => is_object($order) && method_exists($order, 'get_id') ? (string) $order->get_id() : '',
            'number' => is_object($order) && method_exists($order, 'get_order_number') ? (string) $order->get_order_number() : '',
            'status' => is_object($order) && method_exists($order, 'get_status') ? (string) $order->get_status() : '',
            'currency' => is_object($order) && method_exists($order, 'get_currency') ? (string) $order->get_currency() : '',
            'total' => is_object($order) && method_exists($order, 'get_total') ? (string) $order->get_total() : '',
            'payment_method' => is_object($order) && method_exists($order, 'get_payment_method_title') ? (string) $order->get_payment_method_title() : '',
            'items_summary' => implode(', ', array_filter($items_summary)),
        ),
        'customer' => array(
            'name' => is_object($order) && method_exists($order, 'get_formatted_billing_full_name') ? (string) $order->get_formatted_billing_full_name() : '',
            'phone' => livocall_resolve_phone_for_order_default($order),
            'email' => is_object($order) && method_exists($order, 'get_billing_email') ? (string) $order->get_billing_email() : '',
        ),
        'billing' => array('address' => $billing_address),
        'shipping' => array('address' => $shipping_address ?: $billing_address),
        'products' => $products,
    );
}

function livocall_event_id_for_order($order, $trigger)
{
    $id = is_object($order) && method_exists($order, 'get_id') ? (string) $order->get_id() : '0';
    $modified = '';
    if (is_object($order) && method_exists($order, 'get_date_modified') && $order->get_date_modified()) {
        $modified = (string) $order->get_date_modified()->getTimestamp();
    }
    return 'order:' . $id . ':' . $trigger . ':' . ($modified ?: time());
}

function livocall_send_event($event_id, $event_type, $trigger, $resource_type, $resource_id, $phone, $agent_id, $payload)
{
    if (!livocall_registered_connection()) {
        return new WP_Error('livocall_unregistered', 'LivoCall signed connection is not registered.');
    }
    return livocall_signed_api('/api/v1/events/wordpress', array(
        'connectionId' => (string) get_option('livocall_connection_id'),
        'eventId' => $event_id,
        'eventType' => $event_type,
        'trigger' => $trigger,
        'resource' => array('type' => $resource_type, 'id' => (string) $resource_id),
        'phone' => $phone,
        'agentId' => $agent_id,
        'payload' => $payload,
    ));
}

function livocall_dispatch_order_trigger($trigger, $order)
{
    $contact = livocall_contact_from_order($order, $trigger);
    if ($contact) {
        livocall_sync_contacts(array($contact));
    }

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
    $contact = livocall_contact_from_order($order, $trigger);
    if ($contact) {
        livocall_sync_contacts(array($contact));
    }

    $default_agent = (string) get_option('livocall_default_agent_id');
    $cfg = livocall_get_trigger_config($trigger);
    $agent_id = $cfg['agent_id'] !== '' ? $cfg['agent_id'] : $default_agent;
    $agent_id = (string) apply_filters('livocall_agent_for_trigger', $agent_id, $trigger, $order);
    if (!$agent_id && !livocall_registered_connection()) {
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
    if (livocall_registered_connection()) {
        $resp = livocall_send_event(
            livocall_event_id_for_order($order, $trigger),
            'woocommerce.order',
            $trigger,
            'order',
            method_exists($order, 'get_id') ? $order->get_id() : 0,
            $phone,
            $agent_id,
            livocall_order_payload($order, $trigger)
        );
    } else {
        $resp = livocall_api('/api/v1/calls', $payload);
    }
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

function livocall_string_value($value)
{
    if (is_array($value)) {
        $parts = array();
        foreach ($value as $item) {
            $parts[] = livocall_string_value($item);
        }
        return trim(implode(', ', array_filter($parts)));
    }
    if (is_object($value)) {
        return '';
    }
    return trim(wp_strip_all_tags((string) $value));
}

function livocall_normalize_form_fields($fields)
{
    $out = array();
    foreach ((array) $fields as $key => $value) {
        if ($key === '' || is_int($key)) {
            $key = 'field_' . $key;
        }
        $safe_key = sanitize_key((string) $key);
        if ($safe_key === '' || in_array($safe_key, array('g-recaptcha-response', 'recaptcha', 'captcha'), true)) {
            continue;
        }
        $safe_key = str_replace('-', '_', $safe_key);
        $text = livocall_string_value($value);
        if ($text !== '') {
            $out[$safe_key] = $text;
        }
    }
    return $out;
}

function livocall_form_field_value($fields, $candidates)
{
    foreach ($candidates as $candidate) {
        $candidate = sanitize_key($candidate);
        if (isset($fields[$candidate]) && $fields[$candidate] !== '') {
            return $fields[$candidate];
        }
        $candidate = str_replace('-', '_', $candidate);
        if (isset($fields[$candidate]) && $fields[$candidate] !== '') {
            return $fields[$candidate];
        }
    }
    foreach ($fields as $key => $value) {
        foreach ($candidates as $candidate) {
            if (false !== strpos((string) $key, sanitize_key($candidate)) && $value !== '') {
                return $value;
            }
        }
    }
    return '';
}

function livocall_form_payload($source, $form_id, $form_title, $fields)
{
    $normalized = livocall_normalize_form_fields($fields);
    $first = livocall_form_field_value($normalized, array('first_name', 'firstname', 'name', 'your_name'));
    $last = livocall_form_field_value($normalized, array('last_name', 'lastname'));
    $name = trim($first . ' ' . $last);
    $phone = livocall_form_field_value($normalized, array('phone', 'your_phone', 'tel', 'mobile', 'whatsapp'));
    $email = livocall_form_field_value($normalized, array('email', 'your_email', 'mail'));
    $message = livocall_form_field_value($normalized, array('message', 'your_message', 'comments', 'comment'));

    return array(
        'trigger' => $source . '.submission',
        'form' => array(
            'source' => $source,
            'id' => (string) $form_id,
            'title' => (string) $form_title,
        ),
        'lead' => array_filter(array(
            'name' => $name,
            'phone' => $phone,
            'email' => $email,
            'message' => $message,
        ), function ($value) { return $value !== ''; }),
        'fields' => $normalized,
    );
}

function livocall_event_id_for_form($source, $form_id, $entry_id, $fields)
{
    if ($entry_id !== '') {
        return 'form:' . $source . ':' . $form_id . ':' . $entry_id;
    }
    return 'form:' . $source . ':' . $form_id . ':' . md5(wp_json_encode($fields) . ':' . time());
}

function livocall_send_form_submission($trigger, $source, $form_id, $form_title, $fields, $entry_id = '')
{
    $payload = livocall_form_payload($source, $form_id, $form_title, $fields);
    $phone = isset($payload['lead']['phone']) ? (string) $payload['lead']['phone'] : '';
    if (!$phone) {
        return;
    }
    $contact = livocall_contact_from_form_payload($payload, $source, $form_title, $entry_id);
    if ($contact) {
        livocall_sync_contacts(array($contact));
    }
    $cfg = livocall_get_trigger_config($trigger);
    if (!$cfg['enabled']) {
        return;
    }
    $agent_id = $cfg['agent_id'] !== '' ? $cfg['agent_id'] : (string) get_option('livocall_default_agent_id');
    $agent_id = (string) apply_filters('livocall_agent_for_trigger', $agent_id, $trigger, null);
    if (!$agent_id && !livocall_registered_connection()) {
        return;
    }
    if (livocall_registered_connection()) {
        livocall_send_event(
            livocall_event_id_for_form($source, $form_id, (string) $entry_id, $payload['fields']),
            'form.lead',
            $trigger,
            'form_lead',
            $entry_id !== '' ? $entry_id : md5(wp_json_encode($payload['fields'])),
            $phone,
            $agent_id,
            $payload
        );
        return;
    }
    livocall_originate_call($phone, $agent_id, array(
        'trigger' => $trigger,
        'form_source' => $source,
        'form_title' => $form_title,
    ));
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
    livocall_send_form_submission(
        'cf7.submission',
        'cf7',
        method_exists($contact_form, 'id') ? $contact_form->id() : '',
        method_exists($contact_form, 'title') ? $contact_form->title() : '',
        $data
    );
});

add_action('wpforms_process_complete', function ($fields, $entry, $form_data, $entry_id) {
    $flat = array();
    foreach ((array) $fields as $field) {
        if (!is_array($field)) {
            continue;
        }
        $label = !empty($field['name']) ? $field['name'] : 'field_' . (isset($field['id']) ? $field['id'] : count($flat));
        $flat[$label] = isset($field['value']) ? $field['value'] : '';
    }
    $form_id = is_array($form_data) && isset($form_data['id']) ? $form_data['id'] : '';
    $title = '';
    if (is_array($form_data) && isset($form_data['settings']['form_title'])) {
        $title = $form_data['settings']['form_title'];
    }
    livocall_send_form_submission('wpforms.submission', 'wpforms', $form_id, $title, $flat, (string) $entry_id);
}, 10, 4);

add_action('gform_after_submission', function ($entry, $form) {
    $flat = array();
    $fields = is_array($form) && isset($form['fields']) ? (array) $form['fields'] : array();
    foreach ($fields as $field) {
        $id = isset($field->id) ? (string) $field->id : '';
        $label = isset($field->label) && $field->label !== '' ? $field->label : 'field_' . $id;
        $value = function_exists('rgar') ? rgar($entry, $id) : (isset($entry[$id]) ? $entry[$id] : '');
        if ($value === '' && isset($field->inputs) && is_array($field->inputs)) {
            $parts = array();
            foreach ($field->inputs as $input) {
                $input_id = is_array($input) && isset($input['id']) ? (string) $input['id'] : '';
                if ($input_id === '') {
                    continue;
                }
                $parts[] = function_exists('rgar') ? rgar($entry, $input_id) : (isset($entry[$input_id]) ? $entry[$input_id] : '');
            }
            $value = implode(' ', array_filter($parts));
        }
        $flat[$label] = $value;
    }
    $form_id = is_array($form) && isset($form['id']) ? $form['id'] : '';
    $title = is_array($form) && isset($form['title']) ? $form['title'] : '';
    $entry_id = function_exists('rgar') ? rgar($entry, 'id') : (isset($entry['id']) ? $entry['id'] : '');
    livocall_send_form_submission('gravity_forms.submission', 'gravity_forms', $form_id, $title, $flat, (string) $entry_id);
}, 10, 2);

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

    register_rest_route('livocall/v1', '/actions', array(
        'methods'             => 'POST',
        'permission_callback' => '__return_true',
        'callback'            => function (WP_REST_Request $req) {
            $secret = (string) get_option('livocall_signing_secret');
            $sig = $req->get_header('livocall-signature') ?: '';
            $raw = $req->get_body();
            if (!$secret || !livocall_verify_signature($secret, $raw, $sig)) {
                return new WP_REST_Response(array('error' => 'bad_signature'), 401);
            }
            $payload = json_decode($raw, true);
            if (!is_array($payload)) {
                return new WP_REST_Response(array('error' => 'invalid_json'), 400);
            }
            $connection_id = isset($payload['connectionId']) ? (string) $payload['connectionId'] : '';
            if ($connection_id !== '' && $connection_id !== (string) get_option('livocall_connection_id')) {
                return new WP_REST_Response(array('error' => 'wrong_connection'), 403);
            }
            $idempotency_key = isset($payload['idempotencyKey']) ? (string) $payload['idempotencyKey'] : '';
            if ($idempotency_key !== '') {
                $transient_key = 'livocall_action_' . md5($idempotency_key);
                $previous = get_transient($transient_key);
                if ($previous) {
                    return new WP_REST_Response(array('ok' => true, 'duplicate' => true, 'result' => $previous), 200);
                }
            } else {
                $transient_key = '';
            }
            $result = livocall_execute_writeback_action($payload);
            if (is_wp_error($result)) {
                return new WP_REST_Response(array('error' => $result->get_error_code(), 'message' => $result->get_error_message()), 400);
            }
            if ($transient_key !== '') {
                set_transient($transient_key, $result, DAY_IN_SECONDS);
            }
            return new WP_REST_Response(array('ok' => true, 'result' => $result), 200);
        },
    ));
});

function livocall_execute_writeback_action($payload)
{
    $action = isset($payload['action']) && is_array($payload['action']) ? $payload['action'] : array();
    $resource = isset($payload['resource']) && is_array($payload['resource']) ? $payload['resource'] : array();
    $type = isset($action['type']) ? sanitize_key((string) $action['type']) : '';
    if ($type === '') {
        return new WP_Error('missing_action', 'Missing action type.');
    }
    if ($type === 'notify_admin') {
        $message = livocall_writeback_message($payload);
        wp_mail((string) get_option('admin_email'), 'LivoCall action', $message);
        return array('applied' => true, 'type' => $type);
    }
    $resource_type = isset($resource['type']) ? sanitize_key((string) $resource['type']) : '';
    if ($resource_type !== 'order') {
        return new WP_Error('unsupported_resource', 'Only WooCommerce order writeback is supported.');
    }
    if (!function_exists('wc_get_order')) {
        return new WP_Error('woocommerce_missing', 'WooCommerce is not available.');
    }
    $order_id = isset($resource['id']) ? absint($resource['id']) : 0;
    if (!$order_id) {
        return new WP_Error('missing_order', 'Missing order id.');
    }
    $order = wc_get_order($order_id);
    if (!$order) {
        return new WP_Error('order_not_found', 'Order not found.');
    }
    $note = livocall_writeback_message($payload);
    if ($type === 'add_order_note') {
        $order->add_order_note($note);
        return array('applied' => true, 'type' => $type, 'orderId' => $order_id);
    }
    if ($type === 'update_order_status') {
        $status = isset($action['status']) ? sanitize_key((string) $action['status']) : '';
        $status = preg_replace('/^wc-/', '', $status);
        if ($status === '') {
            return new WP_Error('missing_status', 'Missing target order status.');
        }
        $order->update_status($status, $note);
        return array('applied' => true, 'type' => $type, 'orderId' => $order_id, 'status' => $status);
    }
    if ($type === 'store_call_result') {
        $order->update_meta_data('_livocall_last_call_result', array(
            'callId' => isset($payload['callId']) ? sanitize_text_field((string) $payload['callId']) : '',
            'digit' => isset($payload['digit']) ? sanitize_text_field((string) $payload['digit']) : '',
            'message' => $note,
            'time' => current_time('mysql'),
        ));
        $order->save();
        return array('applied' => true, 'type' => $type, 'orderId' => $order_id);
    }
    return new WP_Error('unsupported_action', 'Unsupported writeback action.');
}

function livocall_writeback_message($payload)
{
    $action = isset($payload['action']) && is_array($payload['action']) ? $payload['action'] : array();
    $note = '';
    foreach (array('note', 'noteTemplate', 'message') as $key) {
        if (isset($action[$key]) && (string) $action[$key] !== '') {
            $note = (string) $action[$key];
            break;
        }
    }
    if ($note === '') {
        $note = 'LivoCall action';
    }
    $call_id = isset($payload['callId']) ? sanitize_text_field((string) $payload['callId']) : '';
    $digit = isset($payload['digit']) ? sanitize_text_field((string) $payload['digit']) : '';
    if ($call_id !== '' || $digit !== '') {
        $note .= "\n\n";
        if ($call_id !== '') {
            $note .= 'Call ID: ' . $call_id . "\n";
        }
        if ($digit !== '') {
            $note .= 'DTMF: ' . $digit . "\n";
        }
    }
    return wp_strip_all_tags($note);
}

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
