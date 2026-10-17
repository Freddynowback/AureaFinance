#!/usr/bin/env bash
# Regenera el icono de la app (todas las densidades + adaptativo + tienda)
# desde los SVG de assets/brand/. Requiere rsvg-convert (librsvg).
set -euo pipefail
cd "$(dirname "$0")/.."
B=assets/brand
R=android/app/src/main/res
for pair in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  IFS=: read -r d s a <<< "$pair"
  mkdir -p "$R/mipmap-$d"
  rsvg-convert -w "$s" -h "$s" "$B/icon-square.svg" -o "$R/mipmap-$d/ic_launcher.png"
  rsvg-convert -w "$s" -h "$s" "$B/icon-round.svg" -o "$R/mipmap-$d/ic_launcher_round.png"
  rsvg-convert -w "$a" -h "$a" "$B/icon-foreground.svg" -o "$R/mipmap-$d/ic_launcher_foreground.png"
  rsvg-convert -w "$a" -h "$a" "$B/icon-background.svg" -o "$R/mipmap-$d/ic_launcher_background.png"
done
rsvg-convert -w 512 -h 512 "$B/icon-square.svg" -o "$B/playstore-512.png"
rsvg-convert -w 1024 -h 1024 "$B/icon-square.svg" -o "$B/icon-1024.png"
echo "Icono regenerado."
