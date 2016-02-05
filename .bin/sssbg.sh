#!/bin/sh
sss "$@" 2>&1 | gawk '{ print strftime("%Y-%m-%d %H:%M:%S %z"), $0; fflush(); }' >>/var/log/ssslog &
