# Use a lightweight Debian-based image
FROM debian:bookworm-slim

# Install TiMidity++, standard instrument patches, and FFmpeg
RUN apt-get update && apt-get install -y \
    timidity \
    freepats \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /data

# Define the entrypoint to accept a MIDI file and output a WAV
# Usage: docker run -v $(pwd):/data <image_name> input.mid output.wav
ENTRYPOINT ["/bin/sh", "-c", "timidity \"$1\" -Ow -o - | ffmpeg -i - \"$2\"" , "--"]

