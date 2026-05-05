#!/usr/bin/env sh
set -e

PORT_VALUE="${BACKEND_PORT:-3300}"
sed "s/__BACKEND_PORT__/${PORT_VALUE}/g" /etc/nginx/default.conf.tpl > /etc/nginx/conf.d/default.conf
