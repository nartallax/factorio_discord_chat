#!/bin/bash
set -e
cd "$(dirname "$0")"

node ../ts-bundler/main.js	\
	--tsconfig ./tsconfig.json \
	--entry-point main \
	--entry-point-function main \
	--environment node \
	--fancy > main.js