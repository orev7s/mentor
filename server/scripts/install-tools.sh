#!/usr/bin/env bash
#
# Pre-install the document, PDF and OCR tools Mentor's agent is allowed to
# assume are present. The agent is told to use these before installing anything
# itself (see src/agent/tools-inventory.ts), so this is what keeps a student from
# waiting minutes on apt-get in the middle of a turn.
#
# Run it once when the server is provisioned:
#
#   sudo server/scripts/install-tools.sh
#
# It is idempotent: packages already present are skipped, so it is safe to run
# again after an upgrade. Set MENTOR_SKIP_HEAVY=1 to leave out LibreOffice and
# TeX Live (the two large groups) on a small machine.
set -euo pipefail

log() { printf '\n== %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

if ! have apt-get; then
  echo "This script targets Debian/Ubuntu (apt-get). Install the tools listed" >&2
  echo "in server/src/agent/tools-inventory.ts with your package manager." >&2
  exit 1
fi

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if have sudo; then SUDO="sudo"; else
    echo "Run as root, or install sudo." >&2
    exit 1
  fi
fi

export DEBIAN_FRONTEND=noninteractive

log "apt-get update"
$SUDO apt-get update -y

# Core: every one of these is a tool the agent may reach for in a normal
# document task. Keep the list focused; a tool that is installed but never used
# is just disk.
APT_CORE=(
  poppler-utils          # pdftotext, pdftoppm, pdfinfo, pdfimages
  tesseract-ocr          # OCR engine
  tesseract-ocr-eng
  tesseract-ocr-tur
  tesseract-ocr-ara
  ghostscript            # PDF repair, rasterize, compress
  qpdf                   # PDF merge, split, linearize, decrypt
  imagemagick            # convert, montage, image crops
  pandoc                 # docx/md/html/rst conversion
  ffmpeg                 # audio and video
  graphviz               # dot, diagrams
  ripgrep                # fast text search
  unzip
  zip
  jq
  fonts-dejavu-core
  fonts-noto-core
)

# Heavy: conversion and typesetting through LibreOffice and LaTeX. Still worth
# pre-installing, because both take minutes on first use.
APT_HEAVY=(
  libreoffice-writer
  libreoffice-impress
  libreoffice-calc
  texlive-latex-base
  texlive-latex-recommended
  texlive-fonts-recommended
)

log "apt packages (core)"
$SUDO apt-get install -y --no-install-recommends "${APT_CORE[@]}"

if [ "${MENTOR_SKIP_HEAVY:-0}" != "1" ]; then
  log "apt packages (heavy: LibreOffice, TeX Live)"
  $SUDO apt-get install -y --no-install-recommends "${APT_HEAVY[@]}"
fi

# Python tooling. Prefer the distro packages: they install the CLI on PATH and
# avoid the PEP 668 / RECORD conflicts that pip hits on a Debian system. The pip
# fallback only runs for the few packages Ubuntu does not ship.
APT_PYTHON=(
  ocrmypdf        # searchable-PDF over tesseract
  weasyprint      # HTML/CSS to PDF
  python3-pypdf   # PDF read/write/merge
  python3-docx
  python3-openpyxl
  python3-pil
  python3-markdown
)

log "python packages (apt)"
$SUDO apt-get install -y --no-install-recommends "${APT_PYTHON[@]}" || true

PIP_PKGS=(
  pdfplumber      # PDF tables and layout
  python-pptx
  pytesseract
  pi-heif         # HEIC input for ocrmypdf
  "cryptography<47"  # stay on the Debian-compatible ABI; 50 breaks system pyopenssl
)

if have pip3; then
  log "python packages (pip fallback)"
  # --ignore-installed avoids the Debian-owned typing_extensions RECORD clash.
  $SUDO pip3 install --break-system-packages --ignore-installed "${PIP_PKGS[@]}" || \
    echo "pip fallback skipped; the tools above are enough for PDF and OCR work." >&2
else
  echo "pip3 not found; skipped the pip fallback." >&2
fi

log "done"
for tool in pdftotext tesseract ocrmypdf gs qpdf convert pandoc soffice ffmpeg dot rg weasyprint; do
  if have "$tool"; then printf '  %-12s ok\n' "$tool"; else printf '  %-12s MISSING\n' "$tool"; fi
done
