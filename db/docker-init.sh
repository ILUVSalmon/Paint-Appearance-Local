#!/bin/sh
# First start of the Compose `postgres` service only (docker-entrypoint-initdb.d):
# create migrator, app_rw and the empty paint_appearance database.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -v migrator_password="$MIGRATOR_PASSWORD" \
    -v app_rw_password="$APP_RW_PASSWORD" \
    -f /db/create_roles.sql
