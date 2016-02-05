#!/bin/sh
nohup sssbg send "$@" >/dev/null 2>&1 &
