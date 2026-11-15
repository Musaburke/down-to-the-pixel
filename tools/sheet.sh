#!/bin/bash
# Contact sheet of captured stops. Usage: tools/sheet.sh <dir> <width-suffix 1440|390> <cols> <cell-width> [files...]
dir=$1; suf=$2; cols=$3; cw=$4; shift 4
files=("$@"); [ ${#files[@]} -eq 0 ] && files=($(ls "$dir" | grep -- "-$suf.jpg" | sort))
n=${#files[@]}; rows=$(( (n + cols - 1) / cols )); inputs=()
for f in "${files[@]}"; do inputs+=(-i "$dir/$f"); done
ffmpeg -y -loglevel error "${inputs[@]}" -filter_complex "$(for i in $(seq 0 $((n-1))); do printf "[%d:v]scale=%d:-1[v%d];" $i $cw $i; done)$(for i in $(seq 0 $((n-1))); do printf "[v%d]" $i; done)xstack=inputs=$n:layout=$(for i in $(seq 0 $((n-1))); do c=$((i % cols)); r=$((i / cols)); x=$([ $c -eq 0 ] && echo 0 || (for k in $(seq 1 $c); do printf "w0"; [ $k -lt $c ] && printf "+"; done)); y=$([ $r -eq 0 ] && echo 0 || (for k in $(seq 1 $r); do printf "h0"; [ $k -lt $r ] && printf "+"; done)); printf "%s_%s" "$x" "$y"; [ $i -lt $((n-1)) ] && printf "|"; done):fill=black" -q:v 3 "$dir/sheet-$suf.jpg"
echo "$dir/sheet-$suf.jpg"
