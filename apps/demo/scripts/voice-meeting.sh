#!/bin/bash
# Builds assets/meeting.wav (+ meeting.cues.tsv) from the script's lines.
#   ./scripts/voice-meeting.sh
set -euo pipefail
cd "$(dirname "$0")/.."
WORK=$(mktemp -d)
swift scripts/voice-meeting.swift "$WORK/raw" > "$WORK/lines.tsv"

GAP=0.9      # the pause between speakers
LEAD=1.0     # silence before the first line
# The host: the same voice about 3.5 semitones down, tempo kept, so the two parts
# read as two people.
DEEPEN="asetrate=48000*0.82,aresample=48000,atempo=1.2195"

ffmpeg -v error -f lavfi -i anullsrc=r=48000:cl=mono -t "$GAP" -c:a pcm_s16le "$WORK/gap.wav"
ffmpeg -v error -f lavfi -i anullsrc=r=48000:cl=mono -t "$LEAD" -c:a pcm_s16le "$WORK/lead.wav"
: > "$WORK/list.txt"; echo "file '$WORK/lead.wav'" >> "$WORK/list.txt"
: > assets/meeting.cues.tsv
t=$LEAD
while IFS=$'\t' read -r name text; do
  who=${name#*-}; who=${who%.caf}
  filter="aresample=48000"; [ "$who" = YOU ] && filter="aresample=48000,$DEEPEN"
  ffmpeg -v error -i "$WORK/raw/$name" -af "$filter" -ac 1 -ar 48000 -c:a pcm_s16le "$WORK/${name%.caf}.wav"
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$WORK/${name%.caf}.wav")
  printf '%.2f\t%.2f\t%s\t%s\n' "$t" "$(echo "$t + $d" | bc)" "$who" "$text" >> assets/meeting.cues.tsv
  t=$(echo "$t + $d + $GAP" | bc)
  echo "file '$WORK/${name%.caf}.wav'" >> "$WORK/list.txt"; echo "file '$WORK/gap.wav'" >> "$WORK/list.txt"
done < "$WORK/lines.tsv"
ffmpeg -v error -y -f concat -safe 0 -i "$WORK/list.txt" -ac 2 -c:a pcm_s16le assets/meeting.wav
rm -rf "$WORK"
echo "wrote assets/meeting.wav ($(ffprobe -v error -show_entries format=duration -of csv=p=0 assets/meeting.wav)s)"
