#!/bin/sh
# Start drachtio mod_audio_fork for a live FreeSWITCH channel from dialplan.
# Usage: start_audio_fork.sh <uuid> '<ws-url mono rate [options...]>'
set -eu

uuid="${1:-}"
shift || true
fork_args="$*"

if [ -z "$uuid" ] || [ -z "$fork_args" ]; then
  echo "usage: $0 <uuid> <audio-fork-args>" >&2
  exit 64
fi

pass=$(sed -n 's/.*<param name="password" value="\([^"]*\)".*/\1/p' /usr/local/freeswitch/conf/autoload_configs/event_socket.conf.xml | head -1)
if [ -z "$pass" ]; then
  echo "FS ESL password not found" >&2
  exit 65
fi

exec fs_cli -H 127.0.0.1 -P 8021 -p "$pass" -x "uuid_audio_fork $uuid start $fork_args"
