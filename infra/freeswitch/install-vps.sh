#!/usr/bin/env bash
set -euo pipefail

# Install host-network FreeSWITCH for LivoCall on a single VPS.
#
# Required env:
#   VOICE_SERVICE_TOKEN  Bearer token accepted by the voice service.
#   FS_ESL_PASSWORD      FreeSWITCH event_socket password; must match voice env.
#
# Optional env:
#   ENV_FILE             Path to a .env-style file. Non KEY=value lines are ignored.
#   FREESWITCH_IMAGE     Defaults to drachtio/drachtio-freeswitch-mrf:0.9.6.
#   VPS_PUBLIC_IP        Defaults to 163.227.239.163.
#   VOICE_SERVICE_URL    Defaults to https://voice.livocall.com.
#   SIP_PROVIDER_CIDRS   Space-separated SIP signalling CIDRs to allow.
#   ESL_ALLOWED_CIDRS    Space-separated CIDRs allowed to connect to ESL.

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root on the VPS." >&2
  exit 1
fi

if [[ -n "${ENV_FILE:-}" ]]; then
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "ENV_FILE does not exist: ${ENV_FILE}" >&2
    exit 1
  fi
  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line%$'\r'}"
    [[ "${line}" =~ ^[[:space:]]*# ]] && continue
    [[ "${line}" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    key="${line%%=*}"
    value="${line#*=}"
    if [[ ${#value} -ge 2 ]]; then
      first="${value:0:1}"
      last="${value: -1}"
      if [[ "${first}" == '"' && "${last}" == '"' ]]; then
        value="${value:1:${#value}-2}"
      elif [[ "${first}" == "'" && "${last}" == "'" ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi
    export "${key}=${value}"
  done < "${ENV_FILE}"
fi

if [[ -z "${VOICE_SERVICE_TOKEN:-}" && -n "${INBOUND_ROUTE_TOKEN:-}" ]]; then
  VOICE_SERVICE_TOKEN="${INBOUND_ROUTE_TOKEN}"
  export VOICE_SERVICE_TOKEN
fi

: "${VOICE_SERVICE_TOKEN:?Set VOICE_SERVICE_TOKEN before running this script.}"
: "${FS_ESL_PASSWORD:?Set FS_ESL_PASSWORD before running this script.}"

VPS_PUBLIC_IP="${VPS_PUBLIC_IP:-163.227.239.163}"
VOICE_SERVICE_URL="${VOICE_SERVICE_URL:-https://voice.livocall.com}"
FREESWITCH_IMAGE="${FREESWITCH_IMAGE:-drachtio/drachtio-freeswitch-mrf:0.9.6}"
SIP_PROVIDER_CIDRS="${SIP_PROVIDER_CIDRS:-}"
ESL_ALLOWED_CIDRS="${ESL_ALLOWED_CIDRS:-127.0.0.1/32 172.16.0.0/12 10.0.0.0/8 192.168.0.0/16}"
FS_ROOT="/opt/livocall/freeswitch"
export FREESWITCH_IMAGE

if [[ -n "${WEB_SHARED_SECRET:-}" && -n "${VOICE_SHARED_SECRET:-}" && "${WEB_SHARED_SECRET}" != "${VOICE_SHARED_SECRET}" ]]; then
  cat >&2 <<'EOF'
Warning: WEB_SHARED_SECRET and VOICE_SHARED_SECRET differ in the loaded env.
For LivoCall callbacks, voice WEB_SHARED_SECRET must equal web VOICE_SHARED_SECRET.
This installer can continue because FreeSWITCH uses VOICE_SERVICE_TOKEN, but fix
the web/voice app env before expecting webhook/call events to authenticate.
EOF
fi

if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg docker.io docker-compose-plugin || \
    apt-get install -y ca-certificates curl gnupg docker.io docker-compose
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required. Install docker-compose-plugin, then rerun." >&2
  exit 1
fi

mkdir -p \
  "${FS_ROOT}/dialplan/default" \
  "${FS_ROOT}/dialplan/public" \
  "${FS_ROOT}/sip_profiles/external" \
  "${FS_ROOT}/scripts" \
  /opt/livocall

if command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  ufw allow 5080/udp || true
  ufw allow 5080/tcp || true
  ufw allow 16384:32768/udp || true
  for cidr in ${ESL_ALLOWED_CIDRS}; do
    ufw allow from "${cidr}" to any port 8021 proto tcp || true
  done
  ufw deny 8021/tcp || true
fi

cat > "${FS_ROOT}/event_socket.conf.xml" <<EOF
<configuration name="event_socket.conf" description="Socket Client">
  <settings>
    <param name="nat-map" value="false"/>
    <param name="listen-ip" value="0.0.0.0"/>
    <param name="listen-port" value="8021"/>
    <param name="password" value="${FS_ESL_PASSWORD}"/>
    <param name="apply-inbound-acl" value="livocall_esl"/>
  </settings>
</configuration>
EOF

{
  cat <<'EOF'
<configuration name="acl.conf" description="Network Lists">
  <network-lists>
    <list name="livocall_trunks" default="deny">
EOF
  for cidr in ${SIP_PROVIDER_CIDRS}; do
    printf '      <node type="allow" cidr="%s"/>\n' "${cidr}"
  done
  cat <<'EOF'
    </list>

    <list name="livocall_esl" default="deny">
EOF
  for cidr in ${ESL_ALLOWED_CIDRS}; do
    printf '      <node type="allow" cidr="%s"/>\n' "${cidr}"
  done
  cat <<'EOF'
    </list>
  </network-lists>
</configuration>
EOF
} > "${FS_ROOT}/acl.conf.xml"

cat > "${FS_ROOT}/modules.conf.xml" <<'EOF'
<configuration name="modules.conf" description="Modules">
  <modules>
    <load module="mod_console"/>
    <load module="mod_logfile"/>
    <load module="mod_event_socket"/>
    <load module="mod_sofia"/>
    <load module="mod_dptools"/>
    <load module="mod_dialplan_xml"/>
    <load module="mod_commands"/>
    <load module="mod_db"/>
    <load module="mod_expr"/>
    <load module="mod_audio_fork"/>
    <load module="mod_g711"/>
    <load module="mod_tone_stream"/>
    <load module="mod_local_stream"/>
    <load module="mod_sndfile"/>
    <load module="mod_native_file"/>
  </modules>
</configuration>
EOF

cat > "${FS_ROOT}/sip_profiles/external.xml" <<EOF
<profile name="external">
  <aliases>
    <alias name="outbound"/>
  </aliases>
  <gateways>
    <X-PRE-PROCESS cmd="include" data="external/*.xml"/>
  </gateways>
  <settings>
    <param name="user-agent-string" value="livocall/0.2"/>
    <param name="debug" value="0"/>
    <param name="sip-trace" value="false"/>
    <param name="rfc2833-pt" value="101"/>
    <param name="sip-port" value="5080"/>
    <param name="dialplan" value="XML"/>
    <param name="context" value="public"/>
    <param name="dtmf-duration" value="2000"/>
    <param name="inbound-codec-prefs" value="PCMU@20i"/>
    <param name="outbound-codec-prefs" value="PCMU@20i"/>
    <param name="inbound-codec-negotiation" value="greedy"/>
    <param name="inbound-late-negotiation" value="false"/>
    <param name="disable-transcoding" value="true"/>
    <param name="rtp-autoflush-during-bridge" value="true"/>
    <param name="rtp-rewrite-timestamps" value="true"/>
    <param name="hold-music" value="local_stream://moh"/>
    <param name="rtp-timer-name" value="soft"/>
    <param name="rtp-ip" value="\$\${local_ip_v4}"/>
    <param name="sip-ip" value="\$\${local_ip_v4}"/>
    <param name="ext-rtp-ip" value="${VPS_PUBLIC_IP}"/>
    <param name="ext-sip-ip" value="${VPS_PUBLIC_IP}"/>
    <param name="apply-inbound-acl" value="livocall_trunks"/>
    <param name="auth-calls" value="false"/>
    <param name="accept-blind-reg" value="false"/>
    <param name="accept-blind-auth" value="false"/>
    <param name="inbound-reg-force-matching-username" value="false"/>
    <param name="force-register-domain" value="\$\${domain}"/>
    <param name="force-subscription-domain" value="\$\${domain}"/>
    <param name="force-register-db-domain" value="\$\${domain}"/>
    <param name="challenge-realm" value="auto_from"/>
    <param name="NDLB-broken-auth-hash" value="true"/>
    <param name="tls" value="false"/>
  </settings>
</profile>
EOF

cat > "${FS_ROOT}/sip_profiles/mrf.xml" <<EOF
<profile name="drachtio_mrf">
  <aliases>
    <alias name="outbound"/>
  </aliases>
  <gateways>
    <X-PRE-PROCESS cmd="include" data="external/*.xml"/>
  </gateways>
  <settings>
    <param name="user-agent-string" value="livocall/0.2"/>
    <param name="debug" value="0"/>
    <param name="sip-trace" value="false"/>
    <param name="rfc2833-pt" value="101"/>
    <param name="sip-port" value="5080"/>
    <param name="dialplan" value="XML"/>
    <param name="context" value="public"/>
    <param name="dtmf-duration" value="2000"/>
    <param name="inbound-codec-prefs" value="PCMU,PCMA,OPUS,G722"/>
    <param name="outbound-codec-prefs" value="PCMU,PCMA,OPUS,G722"/>
    <param name="inbound-codec-negotiation" value="greedy"/>
    <param name="inbound-late-negotiation" value="true"/>
    <param name="rtp-autoflush-during-bridge" value="true"/>
    <param name="rtp-rewrite-timestamps" value="true"/>
    <param name="rtp-timer-name" value="soft"/>
    <param name="rtp-ip" value="${VPS_PUBLIC_IP}"/>
    <param name="sip-ip" value="${VPS_PUBLIC_IP}"/>
    <param name="ext-rtp-ip" value="${VPS_PUBLIC_IP}"/>
    <param name="ext-sip-ip" value="${VPS_PUBLIC_IP}"/>
    <param name="apply-inbound-acl" value="livocall_trunks"/>
    <param name="auth-calls" value="false"/>
    <param name="accept-blind-reg" value="false"/>
    <param name="accept-blind-auth" value="false"/>
    <param name="challenge-realm" value="auto_to"/>
    <param name="tls" value="false"/>
  </settings>
</profile>
EOF

cat > "${FS_ROOT}/dialplan/default/00_livocall_outbound.xml" <<'EOF'
<include>
  <context name="default">
    <extension name="livocall_outbound">
      <condition field="${livocall_outbound}" expression="^1$">
        <condition field="${livocall_provider}" expression="^[A-Za-z0-9_-]+$" break="on-true">
          <action application="bridge" data="sofia/gateway/${livocall_provider}/${destination_number}"/>
        </condition>
      </condition>
    </extension>

    <extension name="livocall_park">
      <condition field="${livocall_park}" expression="^1$">
        <action application="answer"/>
        <action application="set" data="absolute_codec_string=PCMU@20i"/>
        <action application="set" data="rtp_disable_transcoding=true"/>
        <action application="set" data="record_sample_rate=16000"/>
        <action application="set" data="recordings_dir=/var/lib/freeswitch/recordings"/>

        <condition field="${livocall_disclosure_url}" expression=".+" break="on-false">
          <action application="playback" data="${livocall_disclosure_url}"/>
        </condition>

        <condition field="${livocall_record}" expression="^prompt$" break="on-false">
          <action application="read" data="1 1 ${livocall_consent_prompt} consent_digit 5000 #"/>
          <condition field="${consent_digit}" expression="^1$" break="on-true">
            <action application="set" data="execute_on_answer=record_session ${recordings_dir}/${uuid}.wav"/>
          </condition>
        </condition>

        <condition field="${livocall_record}" expression="^on$" break="on-false">
          <action application="set" data="execute_on_answer=record_session ${recordings_dir}/${uuid}.wav"/>
        </condition>

        <action application="audio_fork" data="${livocall_ws_url}"/>
        <action application="park"/>
      </condition>
    </extension>
  </context>
</include>
EOF

cat > "${FS_ROOT}/dialplan/public/00_livocall_inbound.xml" <<EOF
<include>
  <context name="public">
    <extension name="livocall_inbound">
      <condition field="destination_number" expression="^(8801[0-9]{9})$">
        <action application="set" data="hangup_after_bridge=true"/>
        <action application="set" data="continue_on_fail=true"/>
        <action application="set" data="absolute_codec_string=PCMU@20i"/>
        <action application="set" data="rtp_disable_transcoding=true"/>
        <action application="set" data="record_sample_rate=16000"/>
        <action application="set" data="recordings_dir=/var/lib/freeswitch/recordings"/>
        <action application="system" data="VOICE_SERVICE_URL=${VOICE_SERVICE_URL} VOICE_SERVICE_TOKEN=${VOICE_SERVICE_TOKEN} destination_number=\${destination_number} caller_id_number=\${caller_id_number} uuid=\${uuid} /usr/local/freeswitch/scripts/inbound_route.py"/>
        <condition field="\${livocall_ws_url}" expression="^$" break="on-true">
          <action application="hangup" data="CALL_REJECTED"/>
        </condition>
        <action application="answer"/>

        <condition field="\${livocall_disclosure_url}" expression=".+" break="on-false">
          <action application="playback" data="\${livocall_disclosure_url}"/>
        </condition>

        <condition field="\${livocall_record}" expression="^off$" break="on-true">
          <action application="log" data="INFO inbound call \${uuid} recording disabled by org policy"/>
        </condition>
        <condition field="\${livocall_record}" expression="^(on|prompt|)$" break="on-false">
          <action application="set" data="execute_on_answer=record_session \${recordings_dir}/\${uuid}.wav"/>
        </condition>

        <action application="audio_fork" data="\${livocall_ws_url}"/>
        <action application="park"/>
      </condition>
    </extension>
  </context>
</include>
EOF

cat > "${FS_ROOT}/scripts/inbound_route.py" <<'EOF'
#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


def main() -> int:
    voice_url = os.environ.get("VOICE_SERVICE_URL", "http://127.0.0.1:8084").rstrip("/")
    token = os.environ.get("VOICE_SERVICE_TOKEN") or os.environ.get("INBOUND_ROUTE_TOKEN", "")
    payload = {
        "destination_number": os.environ.get("destination_number", ""),
        "caller_number": os.environ.get("caller_id_number", ""),
        "fs_uuid": os.environ.get("uuid", ""),
    }
    req = urllib.request.Request(
        f"{voice_url}/calls/inbound-route",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as response:
            route = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"set livocall_route_error={str(exc)[:160]}")
        print("hangup CALL_REJECTED")
        return 0

    print(f"set call_doc_id={route['callId']}")
    print(f"set livocall_ws_url={route['wsUrl']}")
    print(f"set livocall_disclosure_url={route.get('disclosureUrl', '')}")
    print(f"set livocall_record={route.get('recordMode', 'on')}")
    print(f"set livocall_consent_prompt={route.get('consentPromptUrl', '')}")
    print(f"set agent_id={route['agentId']}")
    print(f"set tier={route['tier']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
EOF
chmod 0755 "${FS_ROOT}/scripts/inbound_route.py"

cat > /opt/livocall/sync-freeswitch-gateways.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/root/livocall.env}"
if [[ -f "${ENV_FILE}" ]]; then
  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line%$'\r'}"
    [[ "${line}" =~ ^[[:space:]]*# ]] && continue
    [[ "${line}" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    export "${line}"
  done < "${ENV_FILE}"
fi

: "${FREESWITCH_CONFIG_TOKEN:?Set FREESWITCH_CONFIG_TOKEN in ${ENV_FILE}.}"
WEB_BASE_URL="${WEB_BASE_URL:-https://livocall.com}"
OUT_DIR="/opt/livocall/freeswitch/sip_profiles/external"
OUT_FILE="${OUT_DIR}/livocall_dashboard.xml"

mkdir -p "${OUT_DIR}"
tmp="$(mktemp)"
curl -fsS \
  -H "Authorization: Bearer ${FREESWITCH_CONFIG_TOKEN}" \
  "${WEB_BASE_URL%/}/api/numbers/freeswitch?format=xml" \
  -o "${tmp}"

if ! grep -q '<gateway name=' "${tmp}"; then
  echo "No gateways returned from dashboard; leaving existing config untouched." >&2
  rm -f "${tmp}"
  exit 1
fi

mv "${tmp}" "${OUT_FILE}"
docker cp "${OUT_FILE}" livocall-freeswitch:/usr/local/freeswitch/conf/sip_profiles/external/livocall_dashboard.xml
docker exec livocall-freeswitch fs_cli \
  -H 127.0.0.1 \
  -P "${FS_ESL_PORT:-8021}" \
  -p "${FS_ESL_PASSWORD}" \
  -x "reloadxml"
docker exec livocall-freeswitch fs_cli \
  -H 127.0.0.1 \
  -P "${FS_ESL_PORT:-8021}" \
  -p "${FS_ESL_PASSWORD}" \
  -x "sofia profile drachtio_mrf rescan reloadxml"
EOF
chmod 0755 /opt/livocall/sync-freeswitch-gateways.sh

cat > "${FS_ROOT}/sip_profiles/external/sip_custom.xml.example" <<'EOF'
<include>
  <gateway name="sip_custom">
    <param name="username" value="YOUR_TRUNK_USERNAME"/>
    <param name="auth-username" value="YOUR_TRUNK_AUTH_USERNAME"/>
    <param name="password" value="YOUR_TRUNK_PASSWORD"/>
    <param name="realm" value="PROVIDER_REALM_OR_DOMAIN"/>
    <param name="proxy" value="PROVIDER_SIP_IP_OR_DOMAIN"/>
    <param name="register-proxy" value="PROVIDER_SIP_IP_OR_DOMAIN"/>
    <param name="register" value="true"/>
    <param name="transport" value="udp"/>
    <param name="caller-id-in-from" value="true"/>
    <param name="codec-prefs" value="PCMU@20i"/>
  </gateway>
</include>
EOF

cat > /opt/livocall/freeswitch.compose.yml <<'EOF'
services:
  freeswitch:
    image: ${FREESWITCH_IMAGE}
    container_name: livocall-freeswitch
    restart: unless-stopped
    network_mode: host
    volumes:
      - livocall-fs-conf:/usr/local/freeswitch/conf
      - /opt/livocall/freeswitch/scripts/inbound_route.py:/usr/local/freeswitch/scripts/inbound_route.py:ro
      - livocall-recordings:/usr/local/freeswitch/recordings
      - livocall-sounds:/usr/local/freeswitch/sounds
      - livocall-logs:/usr/local/freeswitch/log

volumes:
  livocall-fs-conf:
  livocall-recordings:
  livocall-sounds:
  livocall-logs:
EOF

docker compose -f /opt/livocall/freeswitch.compose.yml up -d
sleep 15
docker cp "${FS_ROOT}/event_socket.conf.xml" livocall-freeswitch:/usr/local/freeswitch/conf/autoload_configs/event_socket.conf.xml
docker cp "${FS_ROOT}/acl.conf.xml" livocall-freeswitch:/usr/local/freeswitch/conf/autoload_configs/acl.conf.xml
docker cp "${FS_ROOT}/dialplan" livocall-freeswitch:/usr/local/freeswitch/conf/
docker cp "${FS_ROOT}/sip_profiles/mrf.xml" livocall-freeswitch:/usr/local/freeswitch/conf/sip_profiles/mrf.xml
docker cp "${FS_ROOT}/sip_profiles/external" livocall-freeswitch:/usr/local/freeswitch/conf/sip_profiles/
docker restart livocall-freeswitch

echo
echo "FreeSWITCH container requested. Next checks:"
echo "  docker logs --tail=120 livocall-freeswitch"
echo "  docker exec -it livocall-freeswitch fs_cli -x 'status'"
echo "  docker exec -it livocall-freeswitch fs_cli -x 'sofia status profile external'"
echo "  docker exec -it livocall-freeswitch fs_cli -x 'module_exists mod_audio_fork'"
echo
echo "To sync dashboard-created SIP trunks:"
echo "  ENV_FILE=/root/livocall.env /opt/livocall/sync-freeswitch-gateways.sh"
