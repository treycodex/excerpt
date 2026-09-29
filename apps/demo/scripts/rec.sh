#!/bin/bash
# Records one shot of the demo, and logs the clicks made during it for the edit.
#
#   rec.sh start <shot>            start recording footage/<shot>.mov
#   rec.sh mark <x> <y> <label>    log an action at screen point (x, y), in points
#   rec.sh key <keys> <label>      log a key press for the keycap overlay
#   rec.sh stop                    finish the recording
#
# The cursor is not recorded (no -C): the edit draws its own, gliding between the
# logged points, so a teleporting automation cursor never appears on film.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p footage
STATE=footage/.current

now() { perl -MTime::HiRes=time -e 'printf "%.3f", time'; }

case "${1:-}" in
  start)
    shot=${2:?shot name}
    [ -f "$STATE" ] && { echo "error: $(cut -d' ' -f1 "$STATE") is still recording"; exit 1; }
    rm -f "footage/$shot.mov" "footage/$shot.actions.jsonl"
    # screencapture records the real pointer even without -C; park it in a corner.
    [ -x scripts/park-pointer ] && scripts/park-pointer
    screencapture -v -x "footage/$shot.mov" >/dev/null 2>&1 &
    echo "$shot $! $(now)" > "$STATE"
    echo "{\"shot\":\"$shot\",\"start\":$(now),\"screen\":[1710,1112]}" > "footage/$shot.actions.jsonl"
    echo "recording $shot"
    ;;
  mark|key)
    read -r shot _ start < "$STATE"
    t=$(perl -e "printf '%.3f', $(now) - $start")
    if [ "$1" = mark ]; then
      echo "{\"t\":$t,\"type\":\"click\",\"x\":${2:?x},\"y\":${3:?y},\"label\":\"${4:-}\"}" >> "footage/$shot.actions.jsonl"
    else
      echo "{\"t\":$t,\"type\":\"key\",\"keys\":\"${2:?keys}\",\"label\":\"${3:-}\"}" >> "footage/$shot.actions.jsonl"
    fi
    ;;
  stop)
    read -r shot pid _ < "$STATE"
    kill -INT "$pid" 2>/dev/null || true
    while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done
    rm -f "$STATE"
    dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "footage/$shot.mov")
    echo "saved footage/$shot.mov (${dur}s)"
    ;;
  *) sed -n 2,10p "$0"; exit 1 ;;
esac
